import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The core has to run wherever a page does, and nothing in a Node test run
 * fails when somebody adds an import that breaks that. So it is asserted.
 *
 * `react.ts` is exempt: it is the declared React entry point, it is not
 * reachable from `./index`, and React is an optional peer precisely so an app
 * without it can still use the model.
 */
const CORE = ['types.ts', 'storage.ts', 'consent.ts', 'hash.ts', 'copy.ts', 'index.ts'] as const

const source = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

describe('the core runs anywhere a page does', () => {
  it.each(CORE)('%s imports nothing outside the package', (file) => {
    const imports = [...source(file).matchAll(/^import\s.*?from\s+'([^']+)'/gm)].map((m) => m[1]!)
    expect(imports.filter((s) => !s.startsWith('./'))).toEqual([])
  })

  it.each(CORE)('%s uses no Node-only global', (file) => {
    const body = source(file).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
    for (const banned of ['process.', 'require(', '__dirname', 'Buffer.']) {
      expect(body, `${file} must not use ${banned}`).not.toContain(banned)
    }
  })

  it('index does not pull in the React binding', () => {
    // Importing the model must not drag React in behind it, or an app without
    // React cannot read a stored decision.
    expect(source('index.ts')).not.toContain('react')
  })

  it.each(CORE)('%s touches the DOM only through a passed-in handle', (file) => {
    // Reaching for a bare `document` or `localStorage` throws on a server
    // render. Every one of those arrives as an argument instead, defaulting
    // from globalThis at the single call site in defaultStore.
    const body = source(file).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
    for (const bare of [/(?<![.\w])document\./, /(?<![.\w])localStorage\./]) {
      expect(bare.test(body), `${file} must not reach for a global DOM object`).toBe(false)
    }
  })
})
