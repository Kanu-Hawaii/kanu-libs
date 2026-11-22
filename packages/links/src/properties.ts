/**
 * Where each Kanu property lives, in each environment.
 *
 * This table is the whole point of the package. Five applications link to each
 * other constantly — the ribbon, the footer, a CTA, a widget script — and every
 * one of those links was written as a production URL, because that is the only
 * name a person knows. So a staging build links to production, a local build
 * links to production, and a developer clicking "Volunteer" on their own laptop
 * ends up looking at the live site while the change they are testing sits
 * unvisited on the machine in front of them. It is not an error anyone sees;
 * the link works, it just goes to the wrong copy.
 *
 * WHY EVERY ENVIRONMENT'S HOSTNAME IS LISTED, rather than deriving them from a
 * pattern: there is no promise of one. Until 2026-11-22 the marketing site was
 * `new` and the pledge `pledge2` in production, because WordPress held the real
 * names. A rule that covered four of the five would be a rule somebody trusts
 * and then debugs.
 *
 * MATCHING IS DONE AGAINST ALL THREE COLUMNS, not just production. Content
 * mostly stores production URLs, but a page seeded from a staging database or a
 * link somebody pasted while working locally carries one of the other two — and
 * a rewriter that only understands the production form silently leaves those
 * pointing at somebody's laptop. Matching every known origin also makes the
 * rewrite idempotent: running it twice, or on a page that was already correct,
 * changes nothing.
 */

export type PropertyName = 'www' | 'needs' | 'map' | 'pledge' | 'docs'

/** The three copies of the world. A PR preview counts as `production`; see `environmentFromHost`. */
export type KanuEnvironment = 'production' | 'staging' | 'local'

export const ENVIRONMENTS: readonly KanuEnvironment[] = ['production', 'staging', 'local']

export const PROPERTIES: Record<PropertyName, Record<KanuEnvironment, string>> = {
  /** The marketing site. It was `new.kanuhawaii.org` until it took over www on 2026-11-22. */
  www: {
    production: 'https://www.kanuhawaii.org',
    staging: 'https://stg.www.kanuhawaii.org',
    local: 'https://www.kanuhawaii.localhost',
  },
  /** The volunteer platform. */
  needs: {
    production: 'https://needs.kanuhawaii.org',
    staging: 'https://stg.needs.kanuhawaii.org',
    local: 'https://needs.kanuhawaii.localhost',
  },
  map: {
    production: 'https://map.kanuhawaii.org',
    staging: 'https://stg.map.kanuhawaii.org',
    local: 'https://map.kanuhawaii.localhost',
  },
  /** The pledge. It was `pledge2.kanuhawaii.org` while WordPress still held `pledge.` (until 2026-11-22). */
  pledge: {
    production: 'https://pledge.kanuhawaii.org',
    staging: 'https://stg.pledge.kanuhawaii.org',
    local: 'https://pledge.kanuhawaii.localhost',
  },
  docs: {
    production: 'https://docs.kanuhawaii.org',
    staging: 'https://stg.docs.kanuhawaii.org',
    local: 'https://docs.kanuhawaii.localhost',
  },
}

/**
 * Origins that mean a property but are not one of its three hostnames.
 *
 * An alias is matched like any other origin, but IN PRODUCTION IT IS LEFT ALONE
 * UNLESS THE APP OPTS IN. Today's aliases are the pre-launch hostnames, `new.`
 * and `pledge2.`, which the apps answered at while WordPress held `www.` and
 * `pledge.`. Both keep redirecting to the real name, so a link that is not
 * rewritten still arrives; the opt-in exists because rewriting somebody's
 * stored URL in production is the app's decision, not a link library's.
 *
 * WHAT IS DELIBERATELY NOT HERE: `donate.kanuhawaii.org`, the GiveWP install
 * that /donate replaced. That one wants a relative link on the marketing site
 * rather than a fifth property, and rewriting its origin would point a test
 * donation at the real Stripe account — which has already happened once.
 */
export const ALIASES: ReadonlyArray<readonly [string, PropertyName]> = [
  ['https://pledge2.kanuhawaii.org', 'pledge'],
  /*
   * `www.kanuhawaii.org` and `pledge.kanuhawaii.org` are no longer aliases:
   * they are the production origins in PROPERTIES, which are matched in every
   * environment anyway. The apex still redirects to www.
   */
  ['https://new.kanuhawaii.org', 'www'],
  ['https://kanuhawaii.org', 'www'],
]
