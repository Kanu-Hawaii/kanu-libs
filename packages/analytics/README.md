# @kanu/analytics

One set of named events for every Kanu Hawaiʻi site, sent to PostHog once a visitor has agreed to
analytics. No dependencies: PostHog's own script is loaded from its CDN at runtime, the same way its
HTML snippet does it.

## Using it

Start it from the cookie banner, next to whatever already starts there:

```ts
import { initAnalytics } from '@kanu/analytics'

function startAnalytics(preferences: ConsentPreferences) {
  if (!preferences.analytics) return
  initAnalytics({
    site: 'pledge',
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7),
    posthogKey: process.env.NEXT_PUBLIC_POSTHOG_KEY, // VITE_POSTHOG_KEY in kanu-needs
  })
}
```

Then record what happens, with names and parameters from [`src/events.ts`](src/events.ts):

```ts
import { track } from '@kanu/analytics'

track('pledge_signed', { entry: 'page' })
```

Page views need nothing: PostHog records every page and every route change in the single-page apps.

## What keeps it safe

- **Off unless configured.** No key, or a key that is not `phc_…`, means nothing loads. A malformed
  key logs one warning instead of loading wrongly (see LAU-110).
- **Kanu hosts only.** It runs on `kanuhawaii.org` and its subdomains. Previews and localhost send
  nothing unless `anyHost: true` is passed on purpose.
- **Consent first.** Events before `initAnalytics` are dropped, not queued.
- **Only the catalog.** Autocapture, heatmaps, dead and rage clicks are off, and session recording
  is off everywhere, because student, ambassador and pledge pages include under-13s.
- **No people.** Nothing calls `identify`, and profiles are only made for identified visitors, so
  every event is anonymous.
- **No query strings.** Every address PostHog records loses its query string except `utm_*` tags,
  so an email or token in a link never reaches PostHog.

## PostHog project settings

These live in PostHog, not in code. Set them when the project is created:

- **Discard client IP data:** on.
- **Billing limit:** none needed on the free plan; usage stops at the allowance instead of charging.

The free plan allows one project, which is what this expects: every site sends to the same project,
and the `site` property tells them apart. Its product-analytics allowance is 1 million events a month.
