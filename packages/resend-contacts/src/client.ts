/**
 * Adding a consenting person to Resend's contact book.
 *
 * Extracted from kanu-web's `src/lib/resend-audience.ts`, which was the only
 * working contacts integration across the four Kanu apps. What it got right and
 * what is preserved here:
 *
 * - **Sending mail and managing contacts are different APIs.** An email adapter
 *   posts a message; it has no access to the contact book. So this is a direct
 *   HTTPS call and it is not coupled to however the calling app sends mail.
 * - **No `resend` npm package.** One POST does not justify a dependency, and
 *   avoiding the SDK is what lets kanu-needs' Deno edge functions use this file
 *   unmodified. Nothing here is imported beyond the Web platform: `fetch`,
 *   `AbortSignal.timeout`, `JSON`.
 * - **Consent is recorded by the caller BEFORE this runs.** The caller's own
 *   database is the source of truth for what somebody agreed to; Resend is a
 *   downstream copy. If this call fails, the consent is still on the record and
 *   a backfill can find it later.
 * - **This never throws.** A marketing opt-in must not be able to fail a
 *   donation, a pledge, or an RSVP. Every path returns a result.
 */

import type {
  ContactSyncResult,
  ResendContactsConfig,
  UpsertContactInput,
} from './types'

const DEFAULT_ENDPOINT = 'https://api.resend.com/contacts'
const DEFAULT_TIMEOUT_MS = 8000

/**
 * Deliberately loose, matching the check constraint on `pledge.pledges.email`.
 * The authority on whether an address is real is a confirmation email, not a
 * regex, so this only rejects input that cannot be an address at all.
 */
const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/**
 * Splits a single "name" field into Resend's first and last. Best effort by
 * design: several Kanu forms collect one name field, and a wrong split is
 * cosmetic where dropping the name entirely is not.
 */
export const splitName = (
  full?: string | null,
): { first?: string; last?: string } => {
  const name = full?.trim()
  if (!name) return {}
  const parts = name.split(/\s+/)
  if (parts.length === 1) return { first: parts[0] }
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] }
}

/**
 * Resend's documentation does not state what a POST for an existing address
 * does, so this recognises the shapes a duplicate could plausibly arrive as
 * rather than assuming one. Getting this wrong in the safe direction means a
 * repeat signer is recorded as `failed` and somebody investigates; getting it
 * wrong the other way would hide a real error, which is why nothing here treats
 * an unrecognised 4xx as a duplicate.
 *
 * TODO: replace this with the observed behaviour once somebody has posted the
 * same address twice against a test key. See the package README.
 */
const looksLikeDuplicate = (httpStatus: number, body: string): boolean => {
  if (httpStatus === 409) return true
  if (httpStatus !== 422 && httpStatus !== 400) return false
  return /already exist|already registered|duplicate/i.test(body)
}

export const upsertContact = async (
  input: UpsertContactInput,
  config: ResendContactsConfig,
): Promise<ContactSyncResult> => {
  // Consent first, before anything else is even looked at. Nothing about a
  // person leaves this process without it.
  if (!input.consent) {
    return {
      ok: true,
      outcome: 'skipped-no-consent',
      status: 'not requested: no opt-in was given',
    }
  }

  const email = input.email.trim().toLowerCase()
  if (!EMAIL_SHAPE.test(email)) {
    return {
      ok: false,
      outcome: 'invalid-email',
      status: 'not sent: the address is not shaped like an address',
    }
  }

  if (!config.apiKey) {
    return {
      ok: false,
      outcome: 'failed',
      status: 'pending: no Resend API key is configured',
    }
  }

  const segmentIds = config.segmentIds ?? []
  const topicIds = config.topicIds ?? []
  const doFetch = config.fetch ?? globalThis.fetch
  const endpoint = config.endpoint ?? DEFAULT_ENDPOINT

  const first = input.firstName?.trim() || undefined
  const last = input.lastName?.trim() || undefined

  try {
    const res = await doFetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        ...(first ? { first_name: first } : {}),
        ...(last ? { last_name: last } : {}),
        // They ticked a box on a form; that is a subscribe, not an unsubscribe.
        unsubscribed: false,
        ...(segmentIds.length
          ? { segments: segmentIds.map((id) => ({ id })) }
          : {}),
        ...(topicIds.length
          ? {
              topics: topicIds.map((id) => ({
                id,
                subscription: 'opt_in' as const,
              })),
            }
          : {}),
        /**
         * `properties` is sent ONLY when a property name is configured, because
         * Resend rejects the whole request with 422 "One or more properties do
         * not exist" unless the custom property already exists on the account.
         *
         * This cost a real signup. kanu-web's original resend-audience.ts sent
         * `properties: { source: 'donation form' }` unconditionally, so it could
         * never have created a contact even with a working key and a firing
         * webhook, and nothing surfaced that because the 422 was recorded into a
         * status string on the donation and never read.
         *
         * `source` is still required and still useful: it goes into the status
         * and the caller's logs, so "which form did this person come through"
         * stays answerable without a Resend property.
         */
        ...(config.sourceProperty ? { properties: { [config.sourceProperty]: input.source } } : {}),
      }),
      signal: AbortSignal.timeout(config.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      if (looksLikeDuplicate(res.status, detail)) {
        return {
          ok: true,
          outcome: 'already-exists',
          status: 'already on the list',
          httpStatus: res.status,
        }
      }
      return {
        ok: false,
        outcome: 'failed',
        status: `failed: Resend returned ${res.status}${
          detail ? `: ${detail.slice(0, 200)}` : ''
        }`,
        httpStatus: res.status,
      }
    }

    // Configured with neither a segment nor a topic, the contact exists but is
    // in no list. That is worth saying out loud: silence would look like
    // success, and the opt-in would sit somewhere nobody ever mails.
    if (!segmentIds.length && !topicIds.length) {
      return {
        ok: true,
        outcome: 'subscribed-unlisted',
        status:
          'added as a contact, but in NO segment or topic: no segment or topic id is configured',
        httpStatus: res.status,
      }
    }

    return {
      ok: true,
      outcome: 'subscribed',
      status: `subscribed${segmentIds.length ? ' to segment' : ''}${
        topicIds.length ? ' and topic' : ''
      }`,
      httpStatus: res.status,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error'
    return { ok: false, outcome: 'failed', status: `failed: ${msg}` }
  }
}
