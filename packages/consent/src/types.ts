/**
 * What a visitor has agreed to, across every Kanu Hawaiʻi site.
 *
 * TWO CATEGORIES, NOT FOUR. The usual cookie-banner set is necessary /
 * functional / analytics / marketing, and three of those would be empty on
 * every property here: none of them runs ad tech, sells anything, or embeds a
 * third-party "functional" service a visitor could sensibly opt out of. A
 * category that controls nothing is worse than an absent one, because it
 * presents a choice that does not exist. Add one when something actually lands
 * in it, and bump CONSENT_VERSION when you do.
 *
 * NECESSARY IS NOT A CHOICE. It covers the session that keeps somebody signed
 * in and the record of this decision itself: first-party, and never used to
 * build a profile. The UI says so rather than offering a switch that will not
 * move.
 */

export type ConsentCategory = 'necessary' | 'analytics'

export interface ConsentPreferences {
  /** Always true. Present so callers read one shape rather than special-casing. */
  necessary: true
  /** Product analytics: GTM, PostHog, anything that measures a visitor. */
  analytics: boolean
}

export interface StoredConsent {
  version: number
  preferences: ConsentPreferences
  /** ISO 8601. Empty for a decision carried forward from the v1 format. */
  decidedAt: string
}

/** Nothing on until somebody says so. */
export const CONSENT_DEFAULTS: ConsentPreferences = {
  necessary: true,
  analytics: false,
}

/**
 * Bumped when the categories change meaning, so an old answer is re-asked
 * rather than guessed at. Adding a category that defaults to off does not
 * require a bump; changing what an existing one covers does.
 */
export const CONSENT_VERSION = 2
