import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Same guarantee as @kanu/consent: this runs in every app's browser bundle, so
 * it imports nothing from outside the package and touches no Node global.
 * Without a test, an added `import posthog from 'posthog-js'` or a
 * `process.env` read would pass review and fail in one app's build.
 */
const FILES = ['events.ts', 'url.ts', 'posthog.ts', 'index.ts'] as const

const source = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

describe('the package runs anywhere a page does', () => {
  it.each(FILES)('%s imports nothing outside the package', (file) => {
    const imports = [...source(file).matchAll(/^import\s[\s\S]*?from\s+'([^']+)'/gm)].map((m) => m[1]!)
    expect(imports.filter((s) => !s.startsWith('./'))).toEqual([])
  })

  it.each(FILES)('%s uses no Node-only global', (file) => {
    const body = source(file).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
    for (const banned of ['process.', 'require(', '__dirname', 'Buffer.']) {
      expect(body, `${file} must not use ${banned}`).not.toContain(banned)
    }
  })
})
