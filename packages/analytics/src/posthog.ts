/**
 * PostHog, loaded only once a visitor has agreed to analytics.
 *
 * NO NPM DEPENDENCY. This repo's rule is no dependencies without a real
 * reason, and posthog-js would be one in every app. Instead this does what
 * PostHog's own HTML snippet does, written out readably: put a queueing stub
 * on `window.posthog`, then load `array.js` from PostHog's CDN, which replays
 * the queue when it arrives. Calls made before the script loads are not lost.
 *
 * WHAT IS TURNED OFF, AND WHY.
 * - Autocapture, dead clicks, rage clicks, heatmaps: the catalog in events.ts
 *   is what we measure. Autocapture records the text of what was clicked,
 *   which on student and pledge pages can be a child's name, and it would
 *   spend most of the free tier's 1M events a month on clicks nobody reads.
 * - Session recording: off everywhere. LAU-58 asks for it off on student
 *   pages; off everywhere is the only setting that cannot be got wrong.
 * - Person profiles only for identified visitors, and we never identify. Every
 *   event is anonymous, and anonymous events are the cheap kind.
 * - Feature flags and surveys: unused, so their requests are not made.
 *
 * Page views ARE on, including route changes in the single-page apps
 * (`history_change`), so needs and map count every screen without a router
 * hook. Page-leave events are off: they would double the event count for a
 * number nobody has asked for.
 */

import { stripQuery, URL_PROPERTIES } from './url'

export const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com'

/**
 * A PostHog project key looks like `phc_` and then letters and digits. Anything
 * else is a mistake in an environment variable, and LAU-110 is what a mistake
 * there costs: needs requested a Tag Manager container called "NULL" for days.
 * So a malformed key turns PostHog off loudly instead of loading it wrongly.
 */
export const isPostHogKey = (key: string): boolean => /^phc_[A-Za-z0-9]{20,}$/.test(key)

/** Only an https PostHog ingestion host, or a reverse proxy on kanuhawaii.org. */
export const isAllowedHost = (host: string): boolean =>
  /^https:\/\/(us|eu)\.i\.posthog\.com$/.test(host) || /^https:\/\/[a-z0-9-]+\.kanuhawaii\.org$/.test(host)

type Queued = unknown[]

/** The stub's surface, which is also all of PostHog this package calls. */
export interface PostHogLike {
  capture(event: string, properties?: Record<string, unknown>): void
  register(properties: Record<string, unknown>): void
}

interface PostHogStub extends PostHogLike {
  push(entry: Queued): number
  _i: Queued[]
  __SV?: number
  people: Queued[]
  init(key: string, config: Record<string, unknown>, name?: string): void
}

/** The subset of a browser this needs, so tests can pass a fake one. */
export interface BrowserLike {
  posthog?: unknown
  document: {
    createElement(tag: 'script'): {
      async: boolean
      src: string
      crossOrigin: string | null
    }
    head: { appendChild(node: unknown): unknown }
  }
}

/** Methods queued on the stub until `array.js` replaces it. */
const STUBBED = ['capture', 'register', 'register_once', 'reset', 'opt_out_capturing', 'opt_in_capturing'] as const

/** Where `array.js` lives for a given ingestion host, the way PostHog's snippet derives it. */
export const scriptSrcFor = (host: string): string =>
  `${host.replace('.i.posthog.com', '-assets.i.posthog.com')}/static/array.js`

/** The `init` options. Exported so a test can read exactly what is sent. */
export function postHogConfig(host: string): Record<string, unknown> {
  return {
    api_host: host,
    defaults: '2026-08-30',
    autocapture: false,
    capture_dead_clicks: false,
    rageclick: false,
    capture_heatmaps: false,
    capture_pageview: 'history_change',
    capture_pageleave: false,
    disable_session_recording: true,
    disable_surveys: true,
    advanced_disable_flags: true,
    person_profiles: 'identified_only',
    before_send: scrubEvent,
  }
}

/** Runs on every event in the browser, after PostHog has filled in its own properties. */
export function scrubEvent<T extends { properties?: Record<string, unknown> } | null>(event: T): T {
  const props = event?.properties
  if (!props) return event
  for (const key of URL_PROPERTIES) {
    const value = props[key]
    if (typeof value === 'string') props[key] = stripQuery(value)
  }
  return event
}

/**
 * Installs the stub, starts loading PostHog and queues `init`. Returns the
 * stub, which callers use exactly as they would the real client.
 */
export function startPostHog(browser: BrowserLike, key: string, host: string): PostHogLike {
  const existing = browser.posthog as PostHogStub | undefined
  if (existing && existing.__SV) return existing

  const stub = [] as unknown as PostHogStub
  stub._i = []
  stub.people = []
  for (const method of STUBBED) {
    ;(stub as unknown as Record<string, (...args: unknown[]) => void>)[method] = (...args: unknown[]) => {
      stub.push([method, ...args])
    }
  }
  stub.init = (k, config, name) => {
    const script = browser.document.createElement('script')
    script.async = true
    script.crossOrigin = 'anonymous'
    script.src = scriptSrcFor(String(config.api_host))
    browser.document.head.appendChild(script)
    stub._i.push([k, config, name])
  }
  stub.__SV = 1
  browser.posthog = stub

  stub.init(key, postHogConfig(host))
  return stub
}
