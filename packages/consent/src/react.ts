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

/**
 * Parsed decisions, cached against the raw string they came from.
 *
 * useSyncExternalStore calls getSnapshot during render and loops forever if the
 * value is not referentially stable, so the parse has to be memoised somewhere.
 * Not in a ref and not in a render-phase closure: reading the first during
 * render and reassigning the second are both flagged by the React Compiler
 * rules, and both are genuinely unsafe under concurrent rendering.
 *
 * A module-level WeakMap is the right home. It is external state belonging to
 * an external store, which is exactly what useSyncExternalStore is for, and it
 * is keyed on the store so two hooks with different stores cannot collide. Weak
 * so a store that goes away takes its entry with it.
 */
const snapshots = new WeakMap<ConsentStore, { raw: string | null; parsed: StoredConsent | null }>()

function snapshotOf(store: ConsentStore): StoredConsent | null {
  const raw = store.read()
  const cached = snapshots.get(store)
  if (!cached || cached.raw !== raw) {
    const parsed = readConsent(store)
    snapshots.set(store, { raw, parsed })
    return parsed
  }
  return cached.parsed
}

/**
 * False while server-rendering and during hydration, true afterwards.
 *
 * The banner needs this because "no decision yet" and "not read yet" both look
 * like a null snapshot, and showing the banner in the first case is right while
 * showing it in the second flashes it at somebody who already answered. Done
 * with useSyncExternalStore rather than a mount effect so it costs no extra
 * render pass and trips no lint: getServerSnapshot is what React uses for both
 * the server render and the hydrating one.
 */
const NO_OP_SUBSCRIBE = () => () => {}
const alwaysTrue = () => true
const alwaysFalse = () => false

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

  // Resolved once per store: calling defaultStore() on every render would
  // rebuild the cookie reader each time. A ref would do, but reading one during
  // render is forbidden by the React Compiler rules and unsafe under concurrent
  // rendering, and useMemo says the same thing legally.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const store: ConsentStore = useMemo(() => options.store ?? defaultStore(), [options.store])

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
    return {
      subscribe(listener: () => void) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      getSnapshot(): StoredConsent | null {
        return snapshotOf(store)
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
  const hydrated = useSyncExternalStore(NO_OP_SUBSCRIBE, alwaysTrue, alwaysFalse)
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
