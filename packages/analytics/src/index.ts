/**
 * One way for every Kanu site to say what happened.
 *
 * An app calls `initAnalytics` from its cookie banner's `onApply` once the
 * visitor has agreed to analytics, and `track` wherever something in the event
 * catalog happens. Before consent, or when nothing is configured, `track` does
 * nothing: events are dropped, never queued for later.
 *
 * Withdrawing consent reloads the page (each app's `onWithdraw` already does),
 * because a loaded analytics script cannot be unloaded.
 *
 * PostHog is the only destination in this version. Google Analytics will move
 * in here as a second destination once Kanu settles which GA property to keep;
 * until then each app keeps its own `ga.ts`.
 */

import {
  type CommonProperties,
  type KanuEventName,
  type KanuEvents,
  type KanuSite,
  SCHEMA_VERSION,
} from './events'
import {
  type BrowserLike,
  DEFAULT_POSTHOG_HOST,
  isAllowedHost,
  isPostHogKey,
  type PostHogLike,
  startPostHog,
} from './posthog'

export type {
  AmountBand,
  CommonProperties,
  KanuEventName,
  KanuEvents,
  KanuForm,
  KanuSite,
} from './events'
export { SCHEMA_VERSION } from './events'
export { DEFAULT_POSTHOG_HOST, isPostHogKey, postHogConfig, scrubEvent } from './posthog'
export { stripQuery } from './url'

export interface AnalyticsConfig {
  site: KanuSite
  /** Short git commit of the build, when the app has it. */
  release?: string
  /**
   * The app's PostHog project key, read from its own environment
   * (`NEXT_PUBLIC_POSTHOG_KEY` or `VITE_POSTHOG_KEY`). Unset or malformed
   * means PostHog stays off.
   */
  posthogKey?: string
  /** Defaults to PostHog's US cloud. */
  posthogHost?: string
  /**
   * Send from any host. Off by default, so localhost reloads and
   * `*.vercel.app` previews are not counted as real visits.
   */
  anyHost?: boolean
}

const isKanuHost = (hostname: string): boolean => {
  const host = hostname.toLowerCase()
  return host === 'kanuhawaii.org' || host.endsWith('.kanuhawaii.org')
}

let posthog: PostHogLike | null = null

interface PageLike extends BrowserLike {
  location: { hostname: string }
}

const currentPage = (): PageLike | null =>
  typeof window === 'undefined' ? null : (window as unknown as PageLike)

/**
 * Starts every destination this site is configured for. Safe to call again:
 * it returns early once something is running. True when anything is running.
 */
export function initAnalytics(config: AnalyticsConfig, page: PageLike | null = currentPage()): boolean {
  if (posthog) return true
  if (!page) return false
  if (!config.anyHost && !isKanuHost(page.location.hostname)) return false

  const key = config.posthogKey?.trim()
  if (!key) return false
  if (!isPostHogKey(key)) {
    console.warn('[@kanu/analytics] PostHog key is set but malformed; PostHog stays off.')
    return false
  }
  const host = config.posthogHost?.trim() || DEFAULT_POSTHOG_HOST
  if (!isAllowedHost(host)) {
    console.warn('[@kanu/analytics] PostHog host is not an allowed https host; PostHog stays off.')
    return false
  }

  const client = startPostHog(page, key, host)
  const common: CommonProperties = { site: config.site, schema_version: SCHEMA_VERSION }
  if (config.release) common.release = config.release
  client.register({ ...common })
  posthog = client
  return true
}

/** Records one catalog event. Does nothing before `initAnalytics` has started something. */
export function track<E extends KanuEventName>(name: E, properties: KanuEvents[E]): void {
  if (!posthog) return
  posthog.capture(name, { ...properties })
}

/** Whether anything is running, which decides if withdrawing consent needs a reload. */
export function analyticsRunning(): boolean {
  return posthog !== null
}

/** Test seam. Not for application code. */
export function __resetAnalyticsForTests(): void {
  posthog = null
}
