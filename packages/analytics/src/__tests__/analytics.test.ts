import { afterEach, describe, expect, it, vi } from 'vitest'
import { __resetAnalyticsForTests, analyticsRunning, initAnalytics, track } from '../index'
import { postHogConfig, scriptSrcFor, scrubEvent } from '../posthog'
import { stripQuery } from '../url'

const KEY = 'phc_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG'

/** Just enough of a browser for the loader: a hostname, a <head>, a global. */
function fakePage(hostname = 'pledge.kanuhawaii.org') {
  const appended: { async: boolean; src: string; crossOrigin: string | null }[] = []
  const page = {
    posthog: undefined as unknown,
    location: { hostname },
    document: {
      createElement: () => ({ async: false, src: '', crossOrigin: null as string | null }),
      head: { appendChild: (node: (typeof appended)[number]) => appended.push(node) },
    },
  }
  const queue = () => page.posthog as unknown[][] & { _i: unknown[][] }
  return { page, appended, queue }
}

afterEach(() => {
  __resetAnalyticsForTests()
  vi.restoreAllMocks()
})

describe('initAnalytics', () => {
  it('stays off with no key, and track does nothing', () => {
    const { page, appended } = fakePage()
    expect(initAnalytics({ site: 'pledge' }, page)).toBe(false)
    track('pledge_signed', { entry: 'page' })
    expect(appended).toEqual([])
    expect(page.posthog).toBeUndefined()
    expect(analyticsRunning()).toBe(false)
  })

  it.each(['NULL', 'null', 'undefined', 'phc_', 'phx_abcdefghijklmnopqrstuvwxyz'])(
    'stays off, and says so, for the malformed key %s',
    (bad) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const { page, appended } = fakePage()
      expect(initAnalytics({ site: 'needs', posthogKey: bad }, page)).toBe(false)
      expect(appended).toEqual([])
      expect(warn).toHaveBeenCalledOnce()
    },
  )

  it('stays off on a preview or localhost unless asked', () => {
    for (const host of ['kanu-pledge.vercel.app', 'localhost', 'kanuhawaii.org.evil.com']) {
      const { page, appended } = fakePage(host)
      expect(initAnalytics({ site: 'pledge', posthogKey: KEY }, page)).toBe(false)
      expect(appended).toEqual([])
    }
    const { page } = fakePage('kanu-pledge.vercel.app')
    expect(initAnalytics({ site: 'pledge', posthogKey: KEY, anyHost: true }, page)).toBe(true)
  })

  it('refuses a host that is not PostHog or a kanuhawaii.org proxy', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { page, appended } = fakePage()
    expect(initAnalytics({ site: 'www', posthogKey: KEY, posthogHost: 'http://us.i.posthog.com' }, page)).toBe(false)
    expect(initAnalytics({ site: 'www', posthogKey: KEY, posthogHost: 'https://evil.example' }, page)).toBe(false)
    expect(appended).toEqual([])
  })

  it('loads PostHog once, from the US assets host, and queues init with the key', () => {
    const { page, appended, queue } = fakePage('www.kanuhawaii.org')
    expect(initAnalytics({ site: 'www', posthogKey: KEY }, page)).toBe(true)
    expect(initAnalytics({ site: 'www', posthogKey: KEY }, page)).toBe(true)
    expect(appended).toHaveLength(1)
    expect(appended[0]).toMatchObject({
      async: true,
      crossOrigin: 'anonymous',
      src: 'https://us-assets.i.posthog.com/static/array.js',
    })
    const [initKey, config] = queue()._i[0]!
    expect(initKey).toBe(KEY)
    expect(config).toMatchObject({ api_host: 'https://us.i.posthog.com' })
  })

  it('tags every event with site, release and schema version', () => {
    const { page, queue } = fakePage()
    initAnalytics({ site: 'pledge', release: 'aaf291c', posthogKey: KEY }, page)
    expect(queue()).toContainEqual(['register', { site: 'pledge', release: 'aaf291c', schema_version: 1 }])
  })
})

describe('track', () => {
  it('sends catalog events once running', () => {
    const { page, queue } = fakePage('needs.kanuhawaii.org')
    initAnalytics({ site: 'needs', posthogKey: KEY }, page)
    track('volunteer_signup_completed', { need_id: 'n1', org_id: 'o1' })
    expect(queue()).toContainEqual(['capture', 'volunteer_signup_completed', { need_id: 'n1', org_id: 'o1' }])
  })

  it('drops events from before consent instead of holding them', () => {
    const { page, queue } = fakePage()
    track('pledge_started', { entry: 'page' })
    initAnalytics({ site: 'pledge', posthogKey: KEY }, page)
    expect(queue().filter((entry) => entry[0] === 'capture')).toEqual([])
  })
})

describe('the PostHog configuration', () => {
  const config = postHogConfig('https://us.i.posthog.com')

  it('records only what the catalog names, plus page views', () => {
    expect(config).toMatchObject({
      autocapture: false,
      capture_dead_clicks: false,
      rageclick: false,
      capture_heatmaps: false,
      capture_pageview: 'history_change',
      capture_pageleave: false,
    })
  })

  it('never records sessions, never builds anonymous profiles, loads no flags or surveys', () => {
    expect(config).toMatchObject({
      disable_session_recording: true,
      person_profiles: 'identified_only',
      advanced_disable_flags: true,
      disable_surveys: true,
    })
  })

  it('derives the script host the way PostHog does', () => {
    expect(scriptSrcFor('https://eu.i.posthog.com')).toBe('https://eu-assets.i.posthog.com/static/array.js')
  })
})

describe('address scrubbing', () => {
  it('keeps campaign tags and drops every other parameter and the fragment', () => {
    expect(stripQuery('https://pledge.kanuhawaii.org/thanks?email=a%40b.org&utm_source=ig&token=x#top')).toBe(
      'https://pledge.kanuhawaii.org/thanks?utm_source=ig',
    )
    expect(stripQuery('https://www.kanuhawaii.org/donate')).toBe('https://www.kanuhawaii.org/donate')
  })

  it('leaves anything that is not an absolute address alone', () => {
    expect(stripQuery('$direct')).toBe('$direct')
  })

  it('scrubs the address properties PostHog fills in, before sending', () => {
    const event = {
      properties: {
        $current_url: 'https://needs.kanuhawaii.org/signup?name=Kai',
        $referrer: 'https://www.google.com/search?q=kanu',
        site: 'needs',
      },
    }
    expect(scrubEvent(event).properties).toEqual({
      $current_url: 'https://needs.kanuhawaii.org/signup',
      $referrer: 'https://www.google.com/search',
      site: 'needs',
    })
    expect(scrubEvent(null)).toBeNull()
  })
})
