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

import { useCallback, useEffect, useRef, useState } from 'react'
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
   * Deliberately null on the first render, on the server AND in the browser,
   * rather than seeded from storage.
   *
   * Four of the five consuming apps are server-rendered. A first client render
   * that read the cookie would disagree with the HTML the server sent — the
   * server has no cookie access here and would always say "no decision yet" —
   * and React would either warn about the mismatch or, worse, keep the server's
   * markup and show a banner to somebody who already answered. Reading in an
   * effect makes both renders agree by construction.
   */
  const [stored, setStored] = useState<StoredConsent | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  const preferences = preferencesOf(stored)
  // Never before hydration: a banner in server HTML is a banner shown to
  // somebody whose stored answer has not been read yet.
  const showBanner = hydrated && needsDecision(stored) && !dialogOpen

  const openPreferences = useCallback(() => setDialogOpen(true), [])
  const closePreferences = useCallback(() => setDialogOpen(false), [])

  // Held in a ref so a caller passing an inline arrow does not re-run the
  // mount effect on every render and start analytics repeatedly.
  const applyRef = useRef(onApply)
  applyRef.current = onApply
  const withdrawRef = useRef(onWithdraw)
  withdrawRef.current = onWithdraw

  // Read the decision and start whatever it allows, once, after mount.
  // A returning visitor should not have to accept again for analytics to run.
  useEffect(() => {
    const existing = readConsent(store)
    setStored(existing)
    setHydrated(true)
    if (existing) applyRef.current?.(existing.preferences)
    // Once, on mount. Later changes go through `save`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      const record = writeConsent(next, store)
      setStored(record)
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
