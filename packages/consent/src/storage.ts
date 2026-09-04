/**
 * Where the decision is kept, and why it is a cookie rather than localStorage.
 *
 * THE POINT OF SHARING THIS IS THAT THE ANSWER TRAVELS. localStorage is scoped
 * to one origin, so a visitor who accepted on `www.kanuhawaii.org` would be
 * asked again on `needs.`, again on `pledge.`, and again on `map.` — four
 * banners for one organization, and four chances to give a different answer.
 * A cookie on the registrable domain is the only thing a browser will share
 * across those subdomains, so that is the default wherever the host is under
 * kanuhawaii.org.
 *
 * Everywhere else — localhost, a portless `.localhost` name, a `*.vercel.app`
 * preview — a domain-scoped cookie either cannot be set or would be set on a
 * domain we do not control, so those fall back to localStorage. Behaviour is
 * identical; only the reach differs.
 *
 * Web platform APIs only, per the repo rule: no Node, no framework, nothing
 * that stops this running wherever a page does.
 */

/** Reads and writes one opaque string. Swappable so tests need no browser. */
export interface ConsentStore {
  read(): string | null
  write(value: string): void
}

export const CONSENT_COOKIE_NAME = 'kanu_cookie_consent'

/**
 * The localStorage key, which is also the LEGACY v1 key.
 *
 * kanu-needs shipped a bare 'accepted' / 'declined' string here before any of
 * this existed. It is still read, so nobody who already answered is asked
 * again. See readConsent.
 */
export const CONSENT_STORAGE_KEY = 'kanu-cookie-consent'

/** A year. Long enough not to nag, short enough to be a real re-consent. */
export const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

/**
 * The domain to scope the cookie to, or null when there is no safe one.
 *
 * Deliberately a fixed suffix rather than a public-suffix parse: this library
 * serves exactly one organization, and guessing a registrable domain from an
 * arbitrary host is how a cookie ends up on `.co.uk`.
 */
export function cookieDomainFor(hostname: string): string | null {
  const host = hostname.toLowerCase()
  if (host === 'kanuhawaii.org' || host.endsWith('.kanuhawaii.org')) {
    return '.kanuhawaii.org'
  }
  return null
}

export function cookieStore(doc: Document, domain: string, secure: boolean): ConsentStore {
  return {
    read() {
      const match = doc.cookie
        .split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${CONSENT_COOKIE_NAME}=`))
      if (!match) return null
      try {
        return decodeURIComponent(match.slice(CONSENT_COOKIE_NAME.length + 1))
      } catch {
        return null
      }
    },
    write(value: string) {
      const parts = [
        `${CONSENT_COOKIE_NAME}=${encodeURIComponent(value)}`,
        `Domain=${domain}`,
        'Path=/',
        `Max-Age=${CONSENT_MAX_AGE_SECONDS}`,
        // Lax rather than Strict: the decision must survive arriving from an
        // email or a partner's page, which is most of how people get here.
        'SameSite=Lax',
      ]
      if (secure) parts.push('Secure')
      doc.cookie = parts.join('; ')
    },
  }
}

export function localStore(storage: Storage): ConsentStore {
  return {
    read() {
      try {
        return storage.getItem(CONSENT_STORAGE_KEY)
      } catch {
        // Private mode, or storage blocked outright. No stored answer, and no
        // way to keep one: the banner shows and nothing is switched on.
        return null
      }
    },
    write(value: string) {
      try {
        storage.setItem(CONSENT_STORAGE_KEY, value)
      } catch {
        // The choice holds for this page and is asked again later. Better than
        // throwing inside a click handler.
      }
    },
  }
}

/** Nothing to read, nothing to keep. Used server-side and in a locked-down browser. */
export const nullStore: ConsentStore = {
  read: () => null,
  write: () => {},
}

/**
 * Reads through the cookie first and the local key second, and writes to both.
 *
 * The read order matters on a Kanu host: the cookie is the shared answer and
 * wins, and localStorage is what an existing kanu-needs visitor has. Writing
 * both means somebody who decided before this shipped keeps their answer, and
 * gains the cross-site one from then on.
 */
export function layeredStore(primary: ConsentStore, fallback: ConsentStore): ConsentStore {
  return {
    read: () => primary.read() ?? fallback.read(),
    write(value: string) {
      primary.write(value)
      fallback.write(value)
    },
  }
}

/**
 * The store to use in the current browser. `nullStore` when there is no
 * document at all, which is every server render.
 */
export function defaultStore(win: Window | undefined = globalThis.window): ConsentStore {
  if (!win?.document) return nullStore

  const local = win.localStorage ? localStore(win.localStorage) : nullStore
  const domain = cookieDomainFor(win.location?.hostname ?? '')
  if (!domain) return local

  const secure = win.location?.protocol === 'https:'
  return layeredStore(cookieStore(win.document, domain, secure), local)
}
