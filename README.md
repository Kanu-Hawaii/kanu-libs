# kanu-libs

Shared libraries for the Kanu Hawaiʻi apps: [kanu-needs](https://github.com/Kanu-Hawaii/kanu-needs),
[kanu-web](https://github.com/Kanu-Hawaii/kanu-web), [kanu-map](https://github.com/Kanu-Hawaii/kanu-map)
and [kanu-pledge](https://github.com/Kanu-Hawaii/kanu-pledge).

| Package | What it is |
|---|---|
| [`@kanu/resend-contacts`](packages/resend-contacts) | Adding a consenting person to Resend's contact book. No dependencies, runs on Node and Deno |

```bash
pnpm install
pnpm check      # typecheck + test
pnpm build
```

## The rule that shapes everything here

**A package in this repo has to run in three places that disagree about what a runtime is**: a Next
server action, a Payload webhook handler, and a Supabase edge function on Deno. kanu-needs does all
its email work in Deno edge functions, so a package that quietly depends on Node is a package
kanu-needs cannot use, and the symptom shows up in production rather than in a test run.

So: **no dependencies unless there is a real reason**, nothing but Web platform APIs in the core, and
any Node-only convenience lives behind its own entry point. `@kanu/resend-contacts` has a test that
asserts this rather than trusting it.

## What does not belong here

Anything only one app needs. This exists because three separate Resend integrations grew across four
repos sharing nothing but an account and a sending domain, not because shared code is good on its own.
