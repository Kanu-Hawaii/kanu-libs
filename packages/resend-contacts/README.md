# @kanu/resend-contacts

Putting a consenting person into Resend's contact book, the same way in every Kanu app.

Zero dependencies. Nothing but `fetch`, `AbortSignal.timeout` and `JSON`, so the same file runs in a
Next server action, a Payload webhook, and a Supabase edge function on Deno.

```ts
import { upsertContact } from '@kanu/resend-contacts'
import { configFromEnv } from '@kanu/resend-contacts/env'   // Node only

const result = await upsertContact(
  { email, firstName, lastName, source: 'pledge form', consent: mailingOptIn },
  configFromEnv({ segmentEnvVar: 'RESEND_PLEDGE_SEGMENT_ID' }),
)

// Never throws. Record the status and carry on.
await recordSyncStatus(pledgeId, result.status)
```

## What it does not do

**It does not send email.** The four apps legitimately send differently: kanu-web through Payload's
`resendAdapter`, kanu-needs through thirteen Deno edge functions with React Email templates, and
kanu-pledge through nothing at all. A package that owned both would grow one `sendEmail` that four
callers use four ways. The contact book is the part that is genuinely the same everywhere.

## The rules it encodes

1. **Consent is a required argument with no default.** The two apps that collect an opt-in today
   disagree about the default: kanu-web's donation checkbox is unticked and its code comments say
   opt-in must be, kanu-pledge's signing checkbox is pre-ticked (`SignFlow.tsx`, `useState(true)`).
   That is an org decision, not a library default, so every call site has to state the answer out
   loud.
2. **The caller's database is the source of truth, and it is written first.** Resend is a downstream
   copy. If this call fails the consent is still on the record and a backfill can find it. Losing a
   consent record means either spamming somebody or dropping a supporter, and neither may depend on
   a third party being up.
3. **It never throws.** A marketing opt-in must not be able to fail a donation, a pledge or an RSVP.
   Every path returns a `ContactSyncResult`.
4. **Silence is never reported as success.** Configured with no segment and no topic, the contact is
   created but is in no list, and the outcome says exactly that (`subscribed-unlisted`).
5. **The API key never appears in a returned status**, because those statuses get persisted and
   logged. There is a test for it.

## The open question: what does a repeat actually do?

**Nobody at Kanu has established this, and Resend's create-contact documentation does not say.** It
states no behaviour for posting an address that already exists: no upsert, no conflict, no 409.

`looksLikeDuplicate()` in `client.ts` therefore recognises the shapes a duplicate could plausibly
arrive as (a 409, or a 400/422 whose body says "already exists") and deliberately does **not** treat
an unrecognised 4xx as one. Wrong in this direction means a repeat signer is recorded as `failed`
and somebody looks into it. Wrong the other way would hide a real error.

**To close this**, post the same address twice against a test API key and record what comes back:

```bash
curl -sS -X POST https://api.resend.com/contacts \
  -H "Authorization: Bearer $RESEND_TEST_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"email":"delivered@resend.dev","unsubscribed":false}' -w '\n%{http_code}\n'
# then run it again and compare
```

`delivered@resend.dev` is Resend's always-succeeds test address, already used by
`kanu-web/scripts/e2e-donate.mjs`. Replace `looksLikeDuplicate` with the observed behaviour and
delete this section.

## Why no `resend` npm package

One POST does not justify a dependency, and avoiding the SDK is what lets kanu-needs' Deno edge
functions use this unmodified. `src/__tests__/portability.test.ts` asserts that `client.ts`,
`types.ts` and `index.ts` import nothing and use no Node-only global. `env.ts` is the one declared
Node entry point, and it reaches `process` through `globalThis` so that importing it on Deno
degrades to "no key configured" rather than throwing at import time.

## Adoption

| App | Today | To do |
|---|---|---|
| **kanu-web** | `src/lib/resend-audience.ts`, the source this was extracted from | Replace with this package. Behaviour differences: the source hardcoded `properties.source` to `'donation form'` and skipped renewals in the *caller*; both are preserved by passing `source` and keeping the renewal check in `donation-webhooks.ts` |
| **kanu-pledge** | nothing. `pledges.mailing_opt_in` is written and never read | Needs a decision first: which segment, and whether the pre-ticked box stays. See `SKIPPED.md`, "Which ESP the mailing opt-in feeds today" |
| **kanu-needs** | self-hosted list: Postgres `email_unsubscribes` + HMAC unsubscribe links, never touches `/contacts` | Nothing forced. Its model works and is not a Resend list. Only worth revisiting if the org wants one contact book |
| **kanu-map** | no email at all | Nothing |

## Consuming it as a submodule

`exports` points at **TypeScript source**, not at a build. This is deliberate: `dist/` is gitignored,
so a submodule checked out on Vercel would have no build output and the import would fail at deploy
time rather than locally. Shipping source means there is nothing to build and nothing to forget.

The cost is that a bundler has to compile it. Both consumers are Next, so:

```ts
// next.config.ts
transpilePackages: ['@kanu/resend-contacts'],
```

On Deno, import the files directly (`@kanu/resend-contacts/src/client.ts`) or vendor them.

**Imports carry no file extension**, and it took two wrong answers to get there. `.js` specifiers,
the way an emitted ESM build would write them, are what `tsc` accepts and what Turbopack rejects:
`tsc` remaps `.js` to `.ts` and a bundler reading raw source does not, so `next build` failed with
`Can't resolve './client.js'` after this package had been committed and called working. `.ts`
specifiers fix that but require every consumer to enable `allowImportingTsExtensions`, which is a
flag imposed on two Next apps to serve a Deno consumer that does not exist yet.

Extensionless resolves in Turbopack and in a consumer's `tsc` under
`moduleResolution: "bundler"`, with no consumer configuration at all.

**The cost, stated honestly: Deno will not import these files as they stand.** Deno wants an explicit
extension. Vendoring them, bundling them, or running with `--unstable-sloppy-imports` all work, and
none of that is exercised today because kanu-needs is not a consumer. If it ever becomes one, this is
the decision to revisit.

There is **no build step**. `pnpm typecheck` is the only compile.
