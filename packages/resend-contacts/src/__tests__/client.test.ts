import { describe, expect, it, vi } from 'vitest'

import { splitName, upsertContact } from '../client'
import type { ResendContactsConfig } from '../types'

const ok = (status = 201) =>
  vi.fn(async () => new Response(JSON.stringify({ id: 'c_1' }), { status }))

const failing = (status: number, body = '') =>
  vi.fn(async () => new Response(body, { status }))

const config = (over: Partial<ResendContactsConfig> = {}): ResendContactsConfig => ({
  apiKey: 'test-key',
  segmentIds: ['seg_1'],
  topicIds: ['top_1'],
  ...over,
})

const person = { email: 'Aloha@Example.COM', source: 'test', consent: true }

describe('consent', () => {
  it('sends NOTHING when consent is false', async () => {
    const fetchMock = ok()
    const res = await upsertContact(
      { ...person, consent: false },
      config({ fetch: fetchMock }),
    )
    expect(fetchMock).not.toHaveBeenCalled()
    expect(res.outcome).toBe('skipped-no-consent')
    // No consent is a correct outcome, not an error. A caller that treats
    // ok === false as "retry later" must not retry this one forever.
    expect(res.ok).toBe(true)
  })

  it('marks the body as a subscribe rather than an unsubscribe', async () => {
    const fetchMock = ok()
    await upsertContact(person, config({ fetch: fetchMock }))
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))
    expect(body.unsubscribed).toBe(false)
    expect(body.topics).toEqual([{ id: 'top_1', subscription: 'opt_in' }])
  })
})

describe('repeats', () => {
  // The behaviour this guards is the one nobody at Kanu has established: what
  // Resend does with an address it already holds. Whatever it does, a repeat
  // signer must not be recorded as a failure.
  it('treats a 409 as already on the list, not a failure', async () => {
    const res = await upsertContact(
      person,
      config({ fetch: failing(409, 'Contact already exists') }),
    )
    expect(res.outcome).toBe('already-exists')
    expect(res.ok).toBe(true)
  })

  it('treats a 422 that says "already exists" the same way', async () => {
    const res = await upsertContact(
      person,
      config({ fetch: failing(422, '{"message":"Contact already exists"}') }),
    )
    expect(res.outcome).toBe('already-exists')
    expect(res.ok).toBe(true)
  })

  it('does NOT treat an unrecognised 422 as a duplicate', async () => {
    const res = await upsertContact(
      person,
      config({ fetch: failing(422, '{"message":"segment not found"}') }),
    )
    expect(res.outcome).toBe('failed')
    expect(res.ok).toBe(false)
  })
})

describe('failure is contained', () => {
  it('never throws when the network throws', async () => {
    const res = await upsertContact(
      person,
      config({
        fetch: vi.fn(async () => {
          throw new Error('ECONNRESET')
        }),
      }),
    )
    expect(res.ok).toBe(false)
    expect(res.status).toContain('ECONNRESET')
  })

  it('never puts the api key in the status', async () => {
    const res = await upsertContact(
      person,
      config({ apiKey: 'super-secret', fetch: failing(500, 'boom') }),
    )
    expect(res.status).not.toContain('super-secret')
  })

  it('reports plainly when no segment or topic is configured', async () => {
    const res = await upsertContact(
      person,
      config({ fetch: ok(), segmentIds: [], topicIds: [] }),
    )
    expect(res.outcome).toBe('subscribed-unlisted')
    expect(res.status).toContain('NO segment or topic')
  })
})

describe('input handling', () => {
  it('lowercases and trims the address, which is what dedupe rests on', async () => {
    const fetchMock = ok()
    await upsertContact({ ...person, email: '  Aloha@Example.COM ' }, config({ fetch: fetchMock }))
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))
    expect(body.email).toBe('aloha@example.com')
  })

  it('rejects a non-address without calling out', async () => {
    const fetchMock = ok()
    const res = await upsertContact(
      { ...person, email: 'not-an-address' },
      config({ fetch: fetchMock }),
    )
    expect(fetchMock).not.toHaveBeenCalled()
    expect(res.outcome).toBe('invalid-email')
  })

  it('splits a single name field', () => {
    expect(splitName('Keone')).toEqual({ first: 'Keone' })
    expect(splitName('Keone Kealoha')).toEqual({ first: 'Keone', last: 'Kealoha' })
    expect(splitName('  Mary Ann Kahale ')).toEqual({ first: 'Mary Ann', last: 'Kahale' })
    expect(splitName(null)).toEqual({})
  })
})
