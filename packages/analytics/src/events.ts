/**
 * Every event a Kanu site may send, and the parameters each one takes.
 *
 * ONE CATALOG FOR EVERY SITE. Names are `object_action`: snake_case, a noun
 * then a past-tense verb, under 40 characters. A journey gets a `_started`
 * and a `_completed` (or `_signed`) so drop-off is one subtraction. Adding an
 * event is a reviewed change here, so a name cannot drift between sites and a
 * typo fails the build in the app that made it.
 *
 * NO PERSONAL DATA, EVER. No names, emails, phone numbers, free text or exact
 * addresses in any parameter. Ids of needs and organisations are fine; ids of
 * people are not. Student, ambassador and pledge pages include under-13s, so
 * this is what keeps those pages safe by construction rather than by care.
 *
 * Page views are not listed: PostHog records them itself on every page and on
 * every route change in the single-page apps.
 */

/** Which Kanu site sent an event. Set once at start-up, never per event. */
export type KanuSite = 'www' | 'needs' | 'pledge' | 'map' | 'docs'

/** Donation amounts as bands, so a report can segment without exact figures. */
export type AmountBand = 'under_25' | '25_99' | '100_499' | '500_plus'

/** Forms on www that succeed or fail as one event family. */
export type KanuForm =
  | 'contact'
  | 'partner'
  | 'apply'
  | 'ambassador'
  | 'waitlist'
  | 'mailing_list'

interface DonationProps {
  frequency: 'once' | 'monthly'
  amount_band: AmountBand
  fee_covered: boolean
  /** True when the form is the /embed/donate iframe on a partner page. */
  embedded: boolean
}

interface VolunteerSignupProps {
  need_id: string
  org_id: string
  cause?: string
}

export interface KanuEvents {
  donation_started: DonationProps
  /** The only event that carries an exact amount, which revenue reports need. */
  donation_completed: DonationProps & { value: number; currency: 'USD' }
  pledge_started: { entry: 'page' | 'wall' | 'widget' }
  pledge_signed: { entry: 'page' | 'wall' | 'widget' }
  pledge_failed: { reason: 'validation' | 'captcha' | 'server' }
  volunteer_signup_started: VolunteerSignupProps
  volunteer_signup_completed: VolunteerSignupProps
  form_submitted: { form: KanuForm }
  form_failed: { form: KanuForm; reason: 'validation' | 'server' }
  site_link_clicked: { to_site: KanuSite }
}

export type KanuEventName = keyof KanuEvents

/**
 * Bumped when an existing event changes meaning, so reports can tell the old
 * numbers from the new. Adding an event does not need a bump.
 */
export const SCHEMA_VERSION = 1

/** Sent with every event, set once by `initAnalytics`. */
export interface CommonProperties {
  site: KanuSite
  /** Short git commit of the build, when the app knows it. */
  release?: string
  schema_version: number
}
