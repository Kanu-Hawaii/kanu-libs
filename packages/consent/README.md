# @kanu/consent

Cookie consent by category, shared across the Kanu Hawaiʻi sites.

## Why this is shared

Four properties on four subdomains, all run by one organization. Without this,
each one asks its own question in its own words, and a visitor who accepts on
`www.kanuhawaii.org` is asked again on `needs.`, again on `pledge.`, and again
on `map.` — four banners, four chances to give a different answer, and four
places to get the wording wrong.

## The decision travels

The answer is stored in a **cookie on `.kanuhawaii.org`**, which is the only
thing a browser shares across those subdomains. localStorage is per-origin and
would defeat the point.

Everywhere the host is not under `kanuhawaii.org` — `localhost`, a portless
`.localhost` name, a `*.vercel.app` preview — a domain-scoped cookie either
cannot be set or would land on a domain we do not control, so those fall back to
localStorage. Behaviour is identical; only the reach differs.

Reads go cookie first, then localStorage. Writes go to both. That is what
carries an existing kanu-needs visitor's answer forward: they already have the
local key, and they gain the shared cookie the next time they decide.

## Two categories, not four

| Category | Covers | Switchable |
|---|---|---|
| Strictly necessary | The session that keeps somebody signed in, and the record of this decision | No |
| Analytics | Anything that measures a visitor: GTM, PostHog | Yes, off unless chosen |

The usual banner set adds *functional* and *marketing*, and both would be empty
on every Kanu property: no ad tech, nothing sold, no third-party functional
embed. **A category that controls nothing is worse than an absent one**, because
it presents a choice that does not exist. Add one when something lands in it,
and bump `CONSENT_VERSION` when an existing category changes meaning.

## What this package does not do

**It knows no vendor's name.** `useCookieConsent` takes `onApply` and
`onWithdraw` callbacks. Each app decides what "analytics on" means for it. A
package that imported GTM would be unusable in half the places it has to go.

## Three entry points

| Entry | For | Peers |
|---|---|---|
| `@kanu/consent` | The model: categories, storage, migration, hash, copy | none |
| `@kanu/consent/react` | `useCookieConsent`, for an app rendering its own UI | react |
| `@kanu/consent/mantine` | `<CookieConsent />` and `<CookiePreferencesLink />`, ready to mount | react, @mantine/core |

The first cut of this package shipped no components at all, reasoning that
kanu-needs is Mantine and kanu-web has its own brand tokens so anything shared
would fit neither. That was true of two apps and wrong about five: **needs,
pledge, map and docs are all Mantine**, and only kanu-web is not. Four copies of
one banner is four places for the wording, the button order and the hydration
handling to drift, so the Mantine one is shared and kanu-web builds its own from
the same hook and the same `CONSENT_COPY`.

Both optional peers are behind their own entry point, and `portability.test.ts`
asserts that importing the model drags in neither.

## Using it

A Mantine app mounts the component and is done:

```tsx
import { CookieConsent } from '@kanu/consent/mantine'

<CookieConsent
  onApply={(prefs) => { if (prefs.analytics) startAnalytics() }}
  onWithdraw={stopAnalytics}
/>
```

An app rendering its own UI takes the hook:

```ts
import { CONSENT_COPY } from '@kanu/consent'
import { useCookieConsent } from '@kanu/consent/react'

const { preferences, showBanner, dialogOpen, save, acceptAll, rejectAll,
        openPreferences, closePreferences } = useCookieConsent({
  onApply: (prefs) => { if (prefs.analytics) startAnalytics() },
  onWithdraw: () => stopAnalytics(),
})
```

### Server rendering

Four of the five consuming apps are server-rendered, so the hook reads storage
in an effect rather than seeding state from it, and `showBanner` stays false
until `hydrated` is true. A first client render that read the cookie would
disagree with HTML the server produced without one, and the visible form of that
bug is a banner shown to somebody who already answered.

`#cookie` on any page address reopens the dialog, on first load and on a later
hash change, clearing the fragment afterwards. `#cookies` and
`#cookie-preferences` work too. Point the footer link at `#cookie` so there is
one path in rather than a link and a button that can drift.

### Consumers must dedupe React

This package arrives through the kanu-libs **submodule**, so it sits outside the
consuming app's workspace and resolves its own imports from kanu-libs'
`node_modules`. Without deduping, two things go wrong, and only the first is
loud:

1. The React entry point fails to resolve `react` at all, and the bundler says
   so.
2. Once it resolves, it loads *kanu-libs'* copy of React — a second instance,
   which turns every hook in here into "invalid hook call" at runtime.

Vite:

```ts
resolve: { dedupe: ['react', 'react-dom'] }
```

Next.js dedupes workspace React on its own; check it if a hook misbehaves.

### Withdrawal usually means a reload

Most analytics cannot be unloaded once their script is in the document;
deleting the global leaves the listeners. `onWithdraw` is where each app deals
with that, and for GTM the honest answer is `window.location.reload()`. Without
it, somebody who switched analytics off carries on being measured for the rest
of their session, which is the one thing this exists to prevent.

## Shape

| Entry | What it is |
|---|---|
| `@kanu/consent` | The model: categories, storage, migration, hash, copy. No dependencies, no DOM globals, runs on a server render |
| `@kanu/consent/react` | `useCookieConsent`. React is an optional peer, and nothing in the core imports it |

`portability.test.ts` asserts both of those rather than trusting them.
