/**
 * @kanu/resend-contacts
 *
 * Putting a consenting person into Resend's contact book, the same way in every
 * Kanu app. Sending mail is deliberately NOT in scope: the four apps legitimately
 * send differently (a Payload adapter, Deno edge functions, React Email
 * templates) and a package that owned both would grow one `sendEmail` that four
 * callers use four ways. The contact book is the part that is genuinely the same.
 */

export { upsertContact, splitName } from './client'
export type {
  ContactSyncOutcome,
  ContactSyncResult,
  ResendContactsConfig,
  UpsertContactInput,
} from './types'
