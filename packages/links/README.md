# @kanu/links

Cross-property links that point at the copy of the world you are in.

```bash
pnpm add @kanu/links   # in this workspace: link:./kanu-libs/packages/links
```

```tsx
// app/layout.tsx — once per app, inside whatever providers it has
import { KanuLinks } from '@kanu/links/react'

<KanuLinks />
```

That is the whole setup. The component reads the hostname it is being served
from, works out which copy of the world this is, and rewrites every
cross-property `<a href>` on the page to match.

## The problem

Five applications link to each other constantly — the ribbon, the footer, a
CTA, an embed's script tag — and every one of those links is written as a
production URL, because that is the only name a person knows. So a staging
build links to production, a local build links to production, and a developer
clicking **Volunteer** on their own laptop lands on the live site while the
change they are testing sits unvisited on the machine in front of them.

Nothing errors. The link works. It just goes to the wrong copy, and the only
way to notice is to look at the address bar.

## What it does

| This page is served from | so a link to `https://needs.kanuhawaii.org/join` becomes |
|---|---|
| `www.kanuhawaii.localhost` | `https://needs.kanuhawaii.localhost/join` |
| `stg.www.kanuhawaii.org` | `https://stg.needs.kanuhawaii.org/join` |
| `new.kanuhawaii.org` | unchanged |
| a PR preview on `*.vercel.app` | unchanged — see below |

The table of properties and their hostnames is
[`src/properties.ts`](src/properties.ts), and it is the only place a hostname
is written down.

**A PR preview counts as production.** A preview of one app has no matching
preview of the other four, so "the environment I am in" has no answer for them;
production is the copy that definitely exists and definitely works.

**It runs on the live site too.** There, the only thing it can touch is a stray
`stg.` or `.localhost` URL that reached the CMS by somebody pasting a resolved
value back — which kanu-web's notes already record as a thing that happens and
a thing nobody catches.

## What it cannot do

The rewriter runs after the page exists, so **anything the browser has already
acted on is beyond it**:

- a widget's `<script src>`
- an `<iframe src>` that has begun loading
- a canonical tag, an OG image URL, a `metadataBase`
- a redirect issued by the server

Build those with the resolver directly. On the server:

```ts
import { environmentFromVercel, mappingsFor, rewriteWith } from '@kanu/links'

const mappings = mappingsFor(environmentFromVercel(process.env))
const src = rewriteWith(mappings, 'https://pledge.kanuhawaii.org/widget/kanu-pledge.js')
```

In a client component:

```tsx
const { rewrite } = useKanuLinks({ env })   // pass env when the value is server-rendered
```

`rewriteDeep(document, mappings)` does the same for a whole CMS document,
keyed on field names (`href`, `ctaUrl`, anything ending in `Url`) so body copy
that *mentions* a hostname is left as prose.

## Escape hatches

- `data-kanu-links="off"` on an element or any ancestor — for a link that
  deliberately points at the live site.
- `overrides` — a per-property origin from the app's own environment variable,
  which always wins. kanu-web's `NEXT_PUBLIC_NEEDS_URL` and friends still work
  and still take precedence.
- `attributes` — rewrite something other than `a[href]`. Read the note on
  `iframe[src]` first.

## Two deliberate omissions

**`www.kanuhawaii.org` and `kanuhawaii.org` are not rewritten.** The WordPress
site is still live and still owns pages this project has not replaced, so
moving its origin wholesale would break working links in order to fix some of
them. Those move one at a time, as content edits.

**`pledge.kanuhawaii.org` is an alias, not a property.** It serves WordPress in
production (verified 2026-09-17) while the app is on `pledge2`. Locally and on
staging the alias resolves to the app, which is what a developer wants; in
production it is left alone unless an app passes
`rewriteAliasesInProduction`, because moving live traffic off a live page is
Kanu's decision rather than a link library's.
