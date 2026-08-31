/**
 * Reading the configuration out of a Node environment.
 *
 * This is a SEPARATE entry point from the client on purpose. The client takes
 * its configuration as an argument so it can run on Deno inside a Supabase edge
 * function, where `process.env` does not exist. Putting an env read inside the
 * client would make the package silently Node-only, and the symptom would be a
 * failure in kanu-needs rather than an error here.
 *
 * Import from `@kanu/resend-contacts/env` only from Node. On Deno, build the
 * config object yourself from `Deno.env.get(...)`.
 */

import type { ResendContactsConfig } from './types'

/** Reads one comma-separated env var into a list, tolerating stray whitespace. */
/**
 * Reaches `process` through `globalThis` rather than naming it directly, for two
 * reasons that both matter more than the extra line.
 *
 * It keeps `@types/node` out of this package. With Node's globals in scope,
 * `client.ts` could use `process.env` and nothing would complain until it ran
 * inside a Deno edge function, which is the one place nobody runs by accident
 * before shipping. `__tests__/portability.test.ts` asserts that it does not.
 *
 * And it degrades rather than throwing: on Deno this returns an empty object, so
 * a caller that wrongly imports this module gets a "no key configured" result
 * from the client instead of a ReferenceError at import time.
 */
const readProcessEnv = (): Record<string, string | undefined> => {
  const g = globalThis as { process?: { env?: Record<string, string | undefined> } }
  return g.process?.env ?? {}
}

const idList = (raw: string | undefined): string[] =>
  (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

export interface EnvConfigOptions {
  /**
   * Which env var holds the segment ids. Each app puts its people in a
   * different segment, so the name is the caller's to choose:
   * kanu-web uses RESEND_DONOR_SEGMENT_ID, kanu-pledge would use its own.
   */
  readonly segmentEnvVar?: string
  readonly topicEnvVar?: string
  readonly env?: Record<string, string | undefined>
}

/**
 * Never throws and never reports whether the key is present, because the result
 * of this is often logged. A missing key surfaces as a `failed` result from the
 * client with a status that says so, at the point where it matters.
 */
export const configFromEnv = (
  options: EnvConfigOptions = {},
): ResendContactsConfig => {
  const env = options.env ?? readProcessEnv()
  return {
    apiKey: env.RESEND_API_KEY ?? '',
    segmentIds: idList(env[options.segmentEnvVar ?? 'RESEND_SEGMENT_ID']),
    topicIds: idList(env[options.topicEnvVar ?? 'RESEND_NEWSLETTER_TOPIC_ID']),
  }
}
