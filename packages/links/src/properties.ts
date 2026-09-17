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
 * pattern: there is no pattern. The marketing site is `new` in production,
 * `stg.www` in staging and `www` locally — it is mid-migration off WordPress,
 * which still holds `www.kanuhawaii.org` — and `pledge` is `pledge2` in
 * production for the same kind of reason. A rule that covered four of the five
 * would be a rule somebody trusts and then debugs.
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
  /** The marketing site. `new` until the WordPress install at www is retired. */
  www: {
    production: 'https://new.kanuhawaii.org',
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
  /**
   * The pledge. `pledge2` in production because `pledge.kanuhawaii.org` is
   * still the WordPress page this app replaces — which is exactly why it is
   * listed as an alias below rather than ignored: content all over the other
   * four apps says `pledge.kanuhawaii.org`, and today those links land on the
   * old site.
   */
  pledge: {
    production: 'https://pledge2.kanuhawaii.org',
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
 * UNLESS THE APP OPTS IN. Verified 2026-09-17: `pledge.kanuhawaii.org` serves
 * WordPress (`wp-content`, the old Kanu Hawaii title) and `pledge2` serves the
 * Next app. So rewriting the alias in production would move traffic off a page
 * that is still live, which is a content decision for Kanu rather than
 * something a link library should do on its own. Locally and on staging there
 * is no WordPress in the picture at all, so the alias resolves to the app and
 * a developer clicking "Pledge" gets the thing they are working on.
 *
 * WHAT IS DELIBERATELY NOT HERE: `donate.kanuhawaii.org`, the GiveWP install
 * that /donate replaced. That one wants a relative link on the marketing site
 * rather than a fifth property, and rewriting its origin would point a test
 * donation at the real Stripe account — which has already happened once.
 */
export const ALIASES: ReadonlyArray<readonly [string, PropertyName]> = [
  ['https://pledge.kanuhawaii.org', 'pledge'],
  /*
   * The WordPress site, which is the marketing site until it is retired.
   *
   * kanu-pledge's ported navigation has FORTY-NINE of these -- /volunteer,
   * /students, /visitors, /partnerships -- because that is where those pages
   * live today. On a local build every one of them left the machine and landed
   * on the live site, which is what an alias is for.
   *
   * Like the pledge alias, production is untouched: there, www.kanuhawaii.org
   * IS the page being linked to. Only local and staging resolve it to the new
   * marketing site, where the honest outcome is either the replacement page or
   * a 404 telling you it has not been built yet. Silently reading the live site
   * while developing is the worse of the two.
   */
  ['https://www.kanuhawaii.org', 'www'],
  ['https://kanuhawaii.org', 'www'],
]
