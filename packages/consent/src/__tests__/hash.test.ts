import { describe, expect, it } from 'vitest'
import { consumeConsentHash, isConsentHash } from '../hash'

describe('isConsentHash', () => {
  it('accepts the documented spellings, case-insensitively', () => {
    expect(isConsentHash('#cookie')).toBe(true)
    expect(isConsentHash('#cookies')).toBe(true)
    expect(isConsentHash('#Cookie-Preferences')).toBe(true)
  })

  it('ignores anything else, so a page anchor is never hijacked', () => {
    expect(isConsentHash('#cookie-policy')).toBe(false)
    expect(isConsentHash('#get-in')).toBe(false)
    expect(isConsentHash('')).toBe(false)
  })
})

describe('consumeConsentHash', () => {
  function fakeWindow(url: string) {
    const parsed = new URL(url)
    const replaced: string[] = []
    return {
      replaced,
      location: { hash: parsed.hash, pathname: parsed.pathname, search: parsed.search },
      history: {
        replaceState(_s: unknown, _t: string, next: string) {
          replaced.push(next)
        },
      },
    } as unknown as Window & { replaced: string[] }
  }

  it('reports the request and clears the fragment', () => {
    const win = fakeWindow('https://needs.kanuhawaii.org/needs?island=oahu#cookie')
    expect(consumeConsentHash(win)).toBe(true)
    // Cleared so a refresh does not reopen it, and the query survives.
    expect(win.replaced).toEqual(['/needs?island=oahu'])
  })

  it('leaves an unrelated fragment alone', () => {
    const win = fakeWindow('https://needs.kanuhawaii.org/needs#get-in')
    expect(consumeConsentHash(win)).toBe(false)
    expect(win.replaced).toEqual([])
  })

  it('is false with no window, which is every server render', () => {
    expect(consumeConsentHash(undefined)).toBe(false)
  })
})
