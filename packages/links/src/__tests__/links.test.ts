import { describe, expect, it } from 'vitest'

import {
  environmentFromHost,
  environmentFromVercel,
  mappingsFor,
  PROPERTIES,
  rewriteDeep,
  rewriteHref,
  rewritesNothing,
  targetsFor,
} from '../index'

describe('environmentFromHost', () => {
  it('reads the three copies of the world off the hostname', () => {
    expect(environmentFromHost('www.kanuhawaii.localhost')).toBe('local')
    expect(environmentFromHost('stg.www.kanuhawaii.org')).toBe('staging')
    expect(environmentFromHost('new.kanuhawaii.org')).toBe('production')
  })

  it('treats a portless worktree hostname as local', () => {
    /* portless prepends the branch name as a further subdomain. */
    expect(environmentFromHost('my-branch.www.kanuhawaii.localhost')).toBe('local')
    expect(environmentFromHost('localhost:3000')).toBe('local')
  })

  it('treats a PR preview as production, because its four siblings have no preview', () => {
    expect(environmentFromHost('kanu-web-git-feat-x-kanu.vercel.app')).toBe('production')
  })

  it('is not fooled by a hostname that merely contains ours', () => {
    expect(environmentFromHost('kanuhawaii.localhost.example.com')).toBe('production')
  })
})

describe('environmentFromVercel', () => {
  it('finds staging in VERCEL_TARGET_ENV, where a custom environment puts it', () => {
    expect(environmentFromVercel({ VERCEL_ENV: 'preview', VERCEL_TARGET_ENV: 'staging' })).toBe(
      'staging',
    )
  })

  it('calls a PR preview production and an unset environment local', () => {
    expect(environmentFromVercel({ VERCEL_ENV: 'preview', VERCEL_TARGET_ENV: 'preview' })).toBe(
      'production',
    )
    expect(environmentFromVercel({ VERCEL_ENV: 'production' })).toBe('production')
    expect(environmentFromVercel({})).toBe('local')
  })
})

describe('rewriteHref', () => {
  it('sends a stored production URL to the local app', () => {
    expect(rewriteHref('https://needs.kanuhawaii.org/needs?island=maui', 'local')).toBe(
      'https://needs.kanuhawaii.localhost/needs?island=maui',
    )
  })

  it('sends it to staging on staging', () => {
    expect(rewriteHref('https://map.kanuhawaii.org/resilience', 'staging')).toBe(
      'https://stg.map.kanuhawaii.org/resilience',
    )
  })

  it('is idempotent, and rewrites a local URL back on a production build', () => {
    const local = rewriteHref('https://docs.kanuhawaii.org/embed', 'local')
    expect(rewriteHref(local, 'local')).toBe(local)
    expect(rewriteHref(local, 'production')).toBe('https://docs.kanuhawaii.org/embed')
  })

  it('leaves a bare origin bare', () => {
    expect(rewriteHref('https://needs.kanuhawaii.org', 'local')).toBe(
      'https://needs.kanuhawaii.localhost',
    )
  })

  it('requires the origin to END where it matches', () => {
    /* The trap this exists for: a lookalike domain that starts with ours. */
    expect(rewriteHref('https://needs.kanuhawaii.org.example.com/x', 'local')).toBe(
      'https://needs.kanuhawaii.org.example.com/x',
    )
  })

  it('leaves relative links and third parties alone', () => {
    for (const url of ['/donate', 'https://example.org/needs.kanuhawaii.org']) {
      expect(rewriteHref(url, 'local')).toBe(url)
    }
  })

  it('honours an override over the table', () => {
    expect(
      rewriteHref('https://needs.kanuhawaii.org/join', 'local', {
        needs: 'https://needs-worktree.kanuhawaii.localhost/',
      }),
    ).toBe('https://needs-worktree.kanuhawaii.localhost/join')
  })
})

describe('the WordPress alias', () => {
  /* kanu-pledge's ported navigation is forty-nine links at this origin. */
  it('resolves to the marketing site locally and on staging', () => {
    expect(rewriteHref('https://www.kanuhawaii.org/volunteer', 'local')).toBe(
      'https://www.kanuhawaii.localhost/volunteer',
    )
    expect(rewriteHref('https://kanuhawaii.org/students', 'staging')).toBe(
      'https://stg.www.kanuhawaii.org/students',
    )
  })

  it('is left alone in production, where it is still the page being linked to', () => {
    const url = 'https://www.kanuhawaii.org/volunteerism-report.pdf'
    expect(rewriteHref(url, 'production')).toBe(url)
  })
})

describe('the pledge alias', () => {
  it('reaches the app locally and on staging', () => {
    expect(rewriteHref('https://pledge.kanuhawaii.org/sign', 'local')).toBe(
      'https://pledge.kanuhawaii.localhost/sign',
    )
    expect(rewriteHref('https://pledge.kanuhawaii.org/sign', 'staging')).toBe(
      'https://stg.pledge.kanuhawaii.org/sign',
    )
  })

  it('is left alone in production, where it still serves the live WordPress page', () => {
    expect(rewriteHref('https://pledge.kanuhawaii.org/sign', 'production')).toBe(
      'https://pledge.kanuhawaii.org/sign',
    )
  })

  it('moves in production only when the app asks for it', () => {
    expect(
      rewriteHref('https://pledge.kanuhawaii.org/sign', 'production', {}, {
        rewriteAliasesInProduction: true,
      }),
    ).toBe('https://pledge2.kanuhawaii.org/sign')
  })
})

describe('production', () => {
  it('leaves a production URL exactly as it is', () => {
    const url = 'https://needs.kanuhawaii.org/needs'
    expect(rewriteHref(url, 'production')).toBe(url)
  })

  it('still corrects a stray staging or localhost URL, which is the point of running it there', () => {
    expect(rewriteHref('https://stg.map.kanuhawaii.org/resilience', 'production')).toBe(
      'https://map.kanuhawaii.org/resilience',
    )
    expect(rewriteHref('https://needs.kanuhawaii.localhost/join', 'production')).toBe(
      'https://needs.kanuhawaii.org/join',
    )
  })

  it('does no work at all when it is given nothing to move', () => {
    expect(rewritesNothing([])).toBe(true)
  })

  it('targets every property at its production origin', () => {
    const targets = targetsFor('production')
    for (const [name, hosts] of Object.entries(PROPERTIES)) {
      expect(targets[name as keyof typeof PROPERTIES]).toBe(hosts.production)
    }
  })
})

describe('rewriteDeep', () => {
  const mappings = mappingsFor('local')

  it('rewrites link fields anywhere in a document', () => {
    const page = {
      title: 'Volunteer',
      blocks: [
        { type: 'cta', ctaUrl: 'https://needs.kanuhawaii.org/join', label: 'Sign up' },
        { type: 'nested', items: [{ href: 'https://map.kanuhawaii.org' }] },
      ],
    }

    expect(rewriteDeep(page, mappings)).toEqual({
      title: 'Volunteer',
      blocks: [
        { type: 'cta', ctaUrl: 'https://needs.kanuhawaii.localhost/join', label: 'Sign up' },
        { type: 'nested', items: [{ href: 'https://map.kanuhawaii.localhost' }] },
      ],
    })
  })

  it('leaves prose that mentions a hostname as prose', () => {
    const page = { body: 'Opportunities are listed at https://needs.kanuhawaii.org.' }
    expect(rewriteDeep(page, mappings)).toEqual(page)
  })

  it('leaves a production document alone on a production build', () => {
    const page = { ctaUrl: 'https://needs.kanuhawaii.org' }
    expect(rewriteDeep(page, mappingsFor('production'))).toEqual(page)
  })

  it('returns the very same object when there is nothing to move', () => {
    const page = { ctaUrl: 'https://needs.kanuhawaii.org' }
    expect(rewriteDeep(page, [])).toBe(page)
  })
})
