import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The whole reason this package avoids the `resend` npm SDK is so kanu-needs'
 * Supabase edge functions, which run on Deno, can use the same code as the two
 * Next apps. That property is invisible: nothing in a Node test run fails when
 * somebody adds a Node-only import, and the breakage surfaces in an edge
 * function in production.
 *
 * So it is asserted here instead. `env.ts` is exempt because it is the declared
 * Node entry point, and it reaches `process` through `globalThis` precisely so
 * that using it on Deno degrades rather than throwing.
 */
const RUNTIME_AGNOSTIC = ['client.ts', 'types.ts', 'index.ts'] as const

const source = (file: string) =>
  readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

describe('runs on Node and Deno', () => {
  it.each(RUNTIME_AGNOSTIC)('%s imports nothing', (file) => {
    const imports = [...source(file).matchAll(/^import\s.*?from\s+'([^']+)'/gm)].map(
      (m) => m[1]!,
    )
    // Relative imports are the package's own files. Anything else is a
    // dependency, and this package has none.
    expect(imports.filter((s) => !s.startsWith('./'))).toEqual([])
  })

  it.each(RUNTIME_AGNOSTIC)('%s uses no Node-only global', (file) => {
    const body = source(file).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
    for (const banned of ['process.', 'require(', '__dirname', 'Buffer.']) {
      expect(body, `${file} must not use ${banned}`).not.toContain(banned)
    }
  })
})
