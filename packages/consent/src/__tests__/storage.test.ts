import { describe, expect, it } from 'vitest'
import {
  CONSENT_COOKIE_NAME,
  cookieDomainFor,
  cookieStore,
  layeredStore,
  localStore,
  nullStore,
} from '../storage'

/** Just enough of `document` to exercise the cookie accessor pair. */
function fakeDocument(): Document & { written: string[] } {
  let jar = ''
  // `written` is closed over rather than read off `this`: inside an object
  // literal's setter `this` widens to `{}` under strict settings, and a
  // consuming app that typechecks this file then fails on it.
  const written: string[] = []
  return {
    written,
    get cookie() {
      return jar
    },
    set cookie(value: string) {
      written.push(value)
      const pair = value.split(';')[0]!
      jar = jar ? `${jar}; ${pair}` : pair
    },
  } as unknown as Document & { written: string[] }
}

describe('cookieDomainFor', () => {
  it('scopes to the registrable domain for every Kanu host, so the answer travels', () => {
    for (const host of [
      'kanuhawaii.org',
      'www.kanuhawaii.org',
      'needs.kanuhawaii.org',
      'stg.needs.kanuhawaii.org',
      'PLEDGE.KANUHAWAII.ORG',
    ]) {
      expect(cookieDomainFor(host)).toBe('.kanuhawaii.org')
    }
  })

  it('shares the decision across the local apps too, which are five subdomains of one name', () => {
    /* This asserted `null` until somebody accepted on the pledge, opened the
       docs, and was asked again. Local development has the same shape as
       production -- www, needs, map, pledge and docs under one name -- so the
       cookie has to travel the same way. `.localhost` is an ordinary suffix to
       a browser and is not a public suffix. */
    for (const host of [
      'kanuhawaii.localhost',
      'needs.kanuhawaii.localhost',
      'my-branch.www.kanuhawaii.localhost',
    ]) {
      expect(cookieDomainFor(host)).toBe('.kanuhawaii.localhost')
    }
  })

  it('refuses anywhere else, so no cookie lands on a domain we do not own', () => {
    for (const host of [
      'localhost',
      'kanu-needs.vercel.app',
      'gohawaii.com',
      'notkanuhawaii.org',
      'kanuhawaii.org.evil.com',
    ]) {
      expect(cookieDomainFor(host)).toBeNull()
    }
  })
})

describe('cookieStore', () => {
  it('round-trips a value', () => {
    const doc = fakeDocument()
    const store = cookieStore(doc, '.kanuhawaii.org', true)
    store.write('{"a":1}')
    expect(store.read()).toBe('{"a":1}')
  })

  it('writes the attributes that make it shared, lasting and safe', () => {
    const doc = fakeDocument()
    cookieStore(doc, '.kanuhawaii.org', true).write('x')
    const written = doc.written[0]!
    expect(written).toContain(`${CONSENT_COOKIE_NAME}=x`)
    expect(written).toContain('Domain=.kanuhawaii.org')
    expect(written).toContain('Path=/')
    expect(written).toContain('Max-Age=')
    // Lax, not Strict: the decision has to survive arriving from an email.
    expect(written).toContain('SameSite=Lax')
    expect(written).toContain('Secure')
  })

  it('omits Secure over plain http, or the cookie would be dropped', () => {
    const doc = fakeDocument()
    cookieStore(doc, '.kanuhawaii.org', false).write('x')
    expect(doc.written[0]).not.toContain('Secure')
  })

  it('is null when the jar holds other cookies but not ours', () => {
    const doc = fakeDocument()
    doc.cookie = 'other=1'
    expect(cookieStore(doc, '.kanuhawaii.org', true).read()).toBeNull()
  })
})

describe('localStore', () => {
  it('survives storage throwing, which is private mode', () => {
    const blocked = {
      getItem() {
        throw new Error('blocked')
      },
      setItem() {
        throw new Error('blocked')
      },
    } as unknown as Storage

    const store = localStore(blocked)
    expect(store.read()).toBeNull()
    expect(() => store.write('x')).not.toThrow()
  })
})

describe('layeredStore', () => {
  it('prefers the cookie, so the cross-site answer wins', () => {
    const cookie = { read: () => 'from-cookie', write: () => {} }
    const local = { read: () => 'from-local', write: () => {} }
    expect(layeredStore(cookie, local).read()).toBe('from-cookie')
  })

  it('falls back to local, which is what an existing visitor already has', () => {
    const cookie = { read: () => null, write: () => {} }
    const local = { read: () => 'accepted', write: () => {} }
    expect(layeredStore(cookie, local).read()).toBe('accepted')
  })

  it('writes both, so an old decision gains the shared one', () => {
    const writes: string[] = []
    const a = { read: () => null, write: (v: string) => writes.push(`a:${v}`) }
    const b = { read: () => null, write: (v: string) => writes.push(`b:${v}`) }
    layeredStore(a, b).write('x')
    expect(writes).toEqual(['a:x', 'b:x'])
  })
})

describe('nullStore', () => {
  it('reads nothing and swallows writes, which is every server render', () => {
    expect(nullStore.read()).toBeNull()
    expect(() => nullStore.write('x')).not.toThrow()
  })
})
