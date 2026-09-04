/**
 * Reopening the preferences dialog from a URL fragment.
 *
 * A HASH RATHER THAN A ROUTE, and the same one on every site. The dialog is not
 * a page: it has to be reachable from wherever somebody is standing without
 * navigating them off it, and it has to survive being pasted into an email or a
 * support reply. `#cookie` works the same way on all four properties, which is
 * a thing support can say once.
 */

export const CONSENT_HASHES = ['#cookie', '#cookies', '#cookie-preferences'] as const

export function isConsentHash(hash: string): boolean {
  return (CONSENT_HASHES as readonly string[]).includes(hash.toLowerCase())
}

/**
 * True when the current URL asks for the dialog, clearing the fragment as it
 * goes so a refresh does not reopen it and the address bar is not left holding
 * what looks like state.
 */
export function consumeConsentHash(win: Window | undefined = globalThis.window): boolean {
  if (!win?.location || !isConsentHash(win.location.hash)) return false
  win.history?.replaceState(null, '', win.location.pathname + win.location.search)
  return true
}
