/**
 * The vocabulary. No network, no environment, no dependencies, so this file can
 * be read to understand the contract without reading the client.
 */

/**
 * Everything the client needs to talk to Resend, passed in rather than read from
 * the environment.
 *
 * It is explicit because this package has to run in three places that disagree
 * about what an environment is: a Next server action, a Payload webhook handler,
 * and a Supabase edge function on Deno. `process.env` is not portable across
 * those. `configFromEnv()` in `env.ts` is the Node convenience wrapper, and it
 * is deliberately a separate entry point rather than a fallback inside here.
 */
export interface ResendContactsConfig {
  readonly apiKey: string

  /** Segments the contact is added to. Resend's replacement for Audiences. */
  readonly segmentIds?: readonly string[]

  /** Topics the contact is opted in to. Resend's subscription preferences. */
  readonly topicIds?: readonly string[]

  /**
   * Somebody is usually waiting on a confirmation screen while this runs, so it
   * gives up rather than holding the response. The caller's record carries the
   * consent either way, which is what makes abandoning safe.
   */
  readonly timeoutMs?: number

  /** Injectable for tests. Defaults to the global. */
  readonly fetch?: typeof fetch

  /** Injectable for tests and for a future proxy. */
  readonly endpoint?: string
}

export interface UpsertContactInput {
  readonly email: string
  readonly firstName?: string | null
  readonly lastName?: string | null

  /**
   * Where the consent was collected, recorded on the contact as a property.
   * Required, because "which form did this person tick" is the first question
   * asked when somebody complains about being on a list.
   */
  readonly source: string

  /**
   * Whether this person opted in. There is NO DEFAULT and it is not optional.
   *
   * A default here would be a default for consent, and the four Kanu apps do not
   * currently agree on what that default is: kanu-web's donation form is
   * unticked, kanu-pledge's signing form is pre-ticked. That disagreement is a
   * decision for the org, so this package refuses to make it silently and makes
   * every caller state the answer at the call site.
   */
  readonly consent: boolean
}

export type ContactSyncOutcome =
  /** No consent, so nothing was sent. This is a success, not a failure. */
  | 'skipped-no-consent'
  /** Created, and placed in at least one segment or topic. */
  | 'subscribed'
  /** Created, but no segment or topic was configured, so they are in no list. */
  | 'subscribed-unlisted'
  /** Resend already had this address. The goal state holds, so this is ok. */
  | 'already-exists'
  /** The address did not look like an address. Never sent. */
  | 'invalid-email'
  /** Anything else. The caller should record the status and move on. */
  | 'failed'

export interface ContactSyncResult {
  /**
   * Whether the intended end state holds. `already-exists` and
   * `skipped-no-consent` are both `true`: nothing is wrong in either case.
   */
  readonly ok: boolean
  readonly outcome: ContactSyncOutcome

  /**
   * A short sentence safe to persist on the caller's own record, the way
   * kanu-web stores `audienceSyncStatus` on a donation. Never contains the key.
   */
  readonly status: string

  /** Present when a request was actually made and answered. */
  readonly httpStatus?: number
}
