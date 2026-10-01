/**
 * Cross-property links that point at the copy of the world you are in.
 *
 * Core only: no React, no DOM, nothing but strings. The browser binding is
 * `@kanu/links/react`, and every app that renders HTML should mount it — but
 * anything that is not an `<a href>` (a widget script's `src`, a canonical tag,
 * an OG image URL, a redirect) has to call `rewriteHref` directly, because a
 * DOM rewriter runs after the page has already asked for those.
 *
 * THE ENVIRONMENT IS DEDUCED FROM THE HOSTNAME, not configured. Every app knows
 * which copy of the world it is in because it is being served by it: a page on
 * `*.kanuhawaii.localhost` is local, a page on `stg.*` is staging, anything
 * else is production. That is the difference between this and the per-app
 * `NEXT_PUBLIC_*_URL` variables it replaces — four variables per app, five apps,
 * set correctly in every environment, or the links are wrong in a way nobody
 * notices. Overrides are still accepted, because a variable that is set is a
 * deliberate statement and should win.
 */

import { ALIASES, PROPERTIES, type KanuEnvironment, type PropertyName } from './properties'

export { ALIASES, ENVIRONMENTS, PROPERTIES } from './properties'
export type { KanuEnvironment, PropertyName } from './properties'

/** Per-property overrides, as an app's own env vars supply them. Unset values are ignored. */
export type Overrides = Partial<Record<PropertyName, string | undefined>>

export type RewriteOptions = {
  /**
   * Rewrite the aliases in production as well. Off by default: both aliases
   * still serve live WordPress pages. See ALIASES.
   *
   * `true` moves every alias; a list moves only the aliases of the properties
   * it names. The list exists because the two answers differ by app: kanu-pledge
   * wants all of them, but on the marketing site `www.kanuhawaii.org` is where
   * the WordPress-only files still live (the volunteerism report PDFs), so it
   * wants `['pledge']` and must leave `www` alone.
   */
  rewriteAliasesInProduction?: boolean | readonly PropertyName[]
}

const aliasMoves = (
  env: KanuEnvironment,
  name: PropertyName,
  option: RewriteOptions['rewriteAliasesInProduction'],
) => env !== 'production' || option === true || (Array.isArray(option) && option.includes(name))

const trimOrigin = (value: string) => value.trim().replace(/\/+$/, '')

/**
 * Which copy of the world a hostname belongs to.
 *
 * A PR PREVIEW IS `production`, and that is deliberate rather than an
 * oversight. A preview of one app has no matching preview of the other four, so
 * "the environment I am in" has no answer for them; production is the copy that
 * definitely exists and definitely works. A preview that linked to staging
 * would send a reviewer somewhere with different data mid-review.
 *
 * `*.localhost` is matched as a suffix because a portless worktree prepends its
 * branch name — `my-branch.www.kanuhawaii.localhost` is still local.
 */
export const environmentFromHost = (host: string | undefined | null): KanuEnvironment => {
  const name = (host ?? '').toLowerCase().split(':')[0] ?? ''
  if (name === 'localhost' || name.endsWith('.localhost')) return 'local'
  if (name.startsWith('stg.')) return 'staging'
  return 'production'
}

/**
 * The same question answered from Vercel's variables, for server-side code that
 * has no `window`.
 *
 * `VERCEL_ENV` is only ever production, preview or development — a custom
 * environment reports `preview` there and carries its name in
 * `VERCEL_TARGET_ENV`, which is why staging has to be read from the second one.
 */
export const environmentFromVercel = (env: {
  VERCEL_ENV?: string | undefined
  VERCEL_TARGET_ENV?: string | undefined
}): KanuEnvironment => {
  if (env.VERCEL_TARGET_ENV === 'staging') return 'staging'
  if (!env.VERCEL_ENV) return 'local'
  return 'production'
}

/** Where each property lives for this environment, after overrides. */
export const targetsFor = (env: KanuEnvironment, overrides: Overrides = {}) => {
  const out = {} as Record<PropertyName, string>
  for (const name of Object.keys(PROPERTIES) as PropertyName[]) {
    const override = overrides[name]?.trim()
    out[name] = override ? trimOrigin(override) : PROPERTIES[name][env]
  }
  return out
}

type Mapping = readonly [from: string, to: string]

/**
 * Every origin this environment knows how to move, longest first.
 *
 * Longest first matters: `https://pledge.kanuhawaii.org` and
 * `https://pledge2.kanuhawaii.org` share no prefix, but a future alias that is
 * a prefix of another origin would otherwise match the shorter one and rewrite
 * the wrong half of the URL.
 */
export const mappingsFor = (
  env: KanuEnvironment,
  overrides: Overrides = {},
  options: RewriteOptions = {},
): Mapping[] => {
  const targets = targetsFor(env, overrides)
  const pairs: Mapping[] = []

  for (const name of Object.keys(PROPERTIES) as PropertyName[]) {
    for (const from of Object.values(PROPERTIES[name])) {
      if (from !== targets[name]) pairs.push([from, targets[name]] as const)
    }
  }

  for (const [from, name] of ALIASES) {
    if (!aliasMoves(env, name, options.rewriteAliasesInProduction)) continue
    if (from !== targets[name]) pairs.push([from, targets[name]] as const)
  }

  return pairs.sort((a, b) => b[0].length - a[0].length)
}

/**
 * Point one URL at this environment's copy of the property it names.
 *
 * The origin has to END where it is matched — `…kanuhawaii.org` followed by
 * `/`, `?`, `#` or nothing — so `https://needs.kanuhawaii.org.example.com` is
 * left alone rather than treated as ours. Anything at an origin with no row is
 * returned untouched, which is what keeps body copy, WordPress pages and
 * third-party links intact.
 */
export const rewriteWith = (mappings: readonly Mapping[], url: string): string => {
  for (const [from, to] of mappings) {
    if (!url.startsWith(from)) continue
    const rest = url.slice(from.length)
    if (rest === '' || '/?#'.includes(rest[0] as string)) return to + rest
  }
  return url
}

/** `rewriteWith`, resolving the mappings for you. Prefer the two-step form in a loop. */
export const rewriteHref = (
  url: string,
  env: KanuEnvironment,
  overrides: Overrides = {},
  options: RewriteOptions = {},
): string => rewriteWith(mappingsFor(env, overrides, options), url)

/** True when this environment moves nothing, so a caller can skip the work entirely. */
export const rewritesNothing = (mappings: readonly Mapping[]) => mappings.length === 0

const isLinkField = (key: string) => key === 'href' || /url$/i.test(key)

/**
 * The same, for a whole document: a CMS page's layout, a navigation global,
 * anything with links buried in it.
 *
 * Keyed on the field NAME rather than on any string that looks like one of our
 * URLs, so body copy that mentions needs.kanuhawaii.org still reads as
 * needs.kanuhawaii.org. Every link field in kanu-web's Payload schema is named
 * `url` or ends in `Url` (`ctaUrl`, `secondaryUrl`, `buttonUrl`, `sourceUrl`),
 * which is what makes a name test hold for fields nobody has added yet.
 */
export const rewriteDeep = <T,>(node: T, mappings: readonly Mapping[]): T => {
  if (rewritesNothing(mappings)) return node
  if (Array.isArray(node)) return node.map((item) => rewriteDeep(item, mappings)) as unknown as T
  if (node && typeof node === 'object') {
    return Object.fromEntries(
      Object.entries(node).map(([k, v]) => [
        k,
        isLinkField(k) && typeof v === 'string' ? rewriteWith(mappings, v) : rewriteDeep(v, mappings),
      ]),
    ) as T
  }
  return node
}
