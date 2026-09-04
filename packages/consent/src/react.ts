/**
 * The React binding, behind its own entry point.
 *
 * Separate from the core for the same reason `@kanu/resend-contacts` keeps its
 * Node convenience apart: the core has to run anywhere a page does, and React
 * is a peer that only the browser apps have. Nothing in `./index` imports this.
 *
 * VENDORS ARE THE APP'S BUSINESS, NOT THIS PACKAGE'S. kanu-needs runs GTM and
 * PostHog; kanu-web may run neither. So the hook takes callbacks rather than
 * knowing any vendor's name, and each app decides what "analytics on" means for
 * it.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import {
  ACCEPT_ALL,
  needsDecision,
  preferencesOf,
  readConsent,
  REJECT_ALL,
  writeConsent,
} from './consent'
import { consumeConsentHash } from './hash'
import { defaultStore, type ConsentStore } from './storage'
import type { ConsentPreferences, StoredConsent } from './types'

export interface UseCookieConsentOptions {
  /**
   * Start what the visitor agreed to. Called on mount for an existing
   * decision, and again whenever one is saved. Must be safe to call twice.
   */
  onApply?: (preferences: ConsentPreferences) => void
  /**
   * A category was switched OFF that had been on. Most vendors cannot be
   * unloaded once started, so the honest implementation of this is usually a
   * page reload; see the note in each app's analytics module.
   */
  onWithdraw?: (preferences: ConsentPreferences) => void
  /** Injected in tests. Defaults to the cookie-then-localStorage store. */
  store?: ConsentStore
}

export function useCookieConsent(options: UseCookieConsentOptions = {}) {
  const { onApply, onWithdraw } = options

  // Resolved once: swapping the store under a live hook is not a thing, and
  // calling defaultStore() on every render would re-read document.cookie.
  const storeRef = useRef<ConsentStore | null>(null)
  storeRef.current ??= options.store ?? defaultStore()
  const store: ConsentStore = storeRef.current

  /**
   * The stored decision, read through useSyncExternalStore.
   *
   * WHY NOT useState + useEffect. Four of the five consuming apps are
   * server-rendered, so the first render must not read storage: the server has
   * no cookie access and would always say "no decision yet", and a client
   * render that disagreed would either warn or keep the server's markup and
   * show a banner to somebody who already answered. The obvious fix is to read
   * in an effect and setState, and that is what this did first — but it trips
   * kanu-web's React Compiler lint for exactly the reason the rule exists: a
   * synchronous setState in a mount effect is a second render pass on every
   * page load.
   *
   * useSyncExternalStore is the primitive for this. `getServerSnapshot` returns
   * null so server and first client render agree by construction, and React
   * moves to the real value after hydration without a cascading render.
   *
   * The snapshot must be REFERENTIALLY STABLE or this loops forever, so the
   * parsed record is cached against the raw string it came from.
   */
  const [version, bump] = useState(0)

  const { subscribe, getSnapshot, getServerSnapshot } = useMemo(() => {
    const listeners = new Set<() => void>()
    // Closed over rather than held in a ref: getSnapshot runs during render,
    // and reading a ref there is forbidden by the React Compiler rules and
    // unsafe under concurrent rendering. The memo is rebuilt whenever the store
    // or the version changes, which is exactly when this should reset.
    let cache: { raw: string | null; parsed: StoredConsent | null } | null = null
    return {
      subscribe(listener: () => void) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      getSnapshot(): StoredConsent | null {
        const raw = store.read()
        if (!cache || cache.raw !== raw) {
          cache = { raw, parsed: readConsent(store) }
        }
        return cache.parsed
      },
      getServerSnapshot(): StoredConsent | null {
        return null
      },
      notify() {
        for (const listener of listeners) listener()
      },
    }
    // `version` is in the deps so a save rebuilds the reader and the snapshot is
    // taken fresh rather than served from the previous cache entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, version])

  const stored = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const [hydrated, setHydrated] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  const preferences = preferencesOf(stored)
  // Never before hydration: a banner in server HTML is a banner shown to
  // somebody whose stored answer has not been read yet.
  const showBanner = hydrated && needsDecision(stored) && !dialogOpen

  const openPreferences = useCallback(() => setDialogOpen(true), [])
  const closePreferences = useCallback(() => setDialogOpen(false), [])

  // Callbacks in refs so a caller passing an inline arrow does not re-run the
  // mount effect and start analytics again. Written in an effect rather than
  // during render, which the React Compiler lint forbids and which is unsafe
  // under concurrent rendering anyway.
  const applyRef = useRef(onApply)
  const withdrawRef = useRef(onWithdraw)
  useEffect(() => {
    applyRef.current = onApply
    withdrawRef.current = onWithdraw
  })

  // Whatever was already agreed to starts once, after hydration. A returning
  // visitor should not have to accept again for analytics to run.
  const appliedRef = useRef(false)
  useEffect(() => {
    setHydrated(true)
    if (appliedRef.current) return
    appliedRef.current = true
    const existing = readConsent(store)
    if (existing) applyRef.current?.(existing.preferences)
  }, [store])

  // `#cookie` opens the dialog, on first load and on any later hash change.
  useEffect(() => {
    const check = () => {
      if (consumeConsentHash()) setDialogOpen(true)
    }
    check()
    window.addEventListener('hashchange', check)
    return () => window.removeEventListener('hashchange', check)
  }, [])

  const save = useCallback(
    (next: ConsentPreferences) => {
      const hadAnalytics = stored?.preferences.analytics === true
      writeConsent(next, store)
      // Invalidate the snapshot cache and re-read.
      bump((n) => n + 1)
      setDialogOpen(false)

      if (next.analytics) applyRef.current?.(next)
      else if (hadAnalytics) withdrawRef.current?.(next)
    },
    [stored, store],
  )

  const acceptAll = useCallback(() => save(ACCEPT_ALL), [save])
  const rejectAll = useCallback(() => save(REJECT_ALL), [save])

  return {
    preferences,
    showBanner,
    /** False until the stored decision has been read. Server renders stay inert. */
    hydrated,
    dialogOpen,
    openPreferences,
    closePreferences,
    save,
    acceptAll,
    rejectAll,
  }
}
