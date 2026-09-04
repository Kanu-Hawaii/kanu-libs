import { beforeEach, describe, expect, it } from 'vitest'
import { needsDecision, readConsent, writeConsent } from '../consent'
import type { ConsentStore } from '../storage'

/** An in-memory store, so the model is testable without a browser. */
function memoryStore(initial: string | null = null): ConsentStore & { value: string | null } {
  return {
    value: initial,
    read() {
      return this.value
    },
    write(v: string) {
      this.value = v
    },
  }
}

describe('readConsent', () => {
  it('is null when nothing has been decided', () => {
    const store = memoryStore()
    expect(readConsent(store)).toBeNull()
    expect(needsDecision(readConsent(store))).toBe(true)
  })

  it('reads back what was written', () => {
    const store = memoryStore()
    writeConsent({ necessary: true, analytics: true }, store)
    expect(readConsent(store)?.preferences).toEqual({ necessary: true, analytics: true })
    expect(needsDecision(readConsent(store))).toBe(false)
  })

  it('carries a v1 "accepted" forward rather than re-asking', () => {
    const store = memoryStore('accepted')
    expect(readConsent(store)?.preferences).toEqual({ necessary: true, analytics: true })
    expect(needsDecision(readConsent(store))).toBe(false)
  })

  it('carries a v1 "declined" forward as off, never as consent', () => {
    const store = memoryStore('declined')
    expect(readConsent(store)?.preferences).toEqual({ necessary: true, analytics: false })
    expect(needsDecision(readConsent(store))).toBe(false)
  })

  it('treats a corrupt value as no answer rather than as consent', () => {
    expect(readConsent(memoryStore('{not json'))).toBeNull()
    expect(readConsent(memoryStore(JSON.stringify({ version: 2 })))).toBeNull()
  })

  it('forces necessary true whatever is stored', () => {
    const store = memoryStore(
      JSON.stringify({ version: 2, preferences: { necessary: false, analytics: false } }),
    )
    expect(readConsent(store)?.preferences.necessary).toBe(true)
  })

  it('counts only an explicit true as analytics consent', () => {
    const store = memoryStore(JSON.stringify({ version: 2, preferences: { analytics: 'yes' } }))
    expect(readConsent(store)?.preferences.analytics).toBe(false)
  })
})

describe('writeConsent', () => {
  it('stamps a version and a moment, so a later category change can re-ask', () => {
    const store = memoryStore()
    const record = writeConsent({ necessary: true, analytics: false }, store)
    expect(record.version).toBe(2)
    expect(Date.parse(record.decidedAt)).not.toBeNaN()
  })
})
