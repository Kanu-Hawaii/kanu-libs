'use client'

/**
 * The browser binding: one component that fixes every cross-property link on
 * the page, and a hook for the code that builds URLs itself.
 *
 * WHY A REWRITER RATHER THAN A LINK COMPONENT. There are five apps, two
 * frontend stacks, a Nextra docs site, a CMS whose editors paste production
 * URLs by hand, and markdown content full of plain `<a href>`. Threading a
 * component through all of that means touching hundreds of call sites and
 * getting every future one right too — and the ones that are wrong stay wrong
 * silently, because a link to production always works. Rewriting the document
 * needs one mount per app and covers content nobody has written yet.
 *
 * WHAT IT CANNOT DO, and this is the important half. It runs after the page
 * exists, so anything the browser has already acted on is beyond it: a widget
 * `<script src>`, an `<iframe src>` that has begun loading, a canonical tag, an
 * OG image URL, a redirect issued by the server. Those must call `rewriteHref`
 * where they are built — `useKanuLinks` is here for that, and the core package
 * for the server. If you are adding a cross-property URL that is not an anchor,
 * assume the rewriter will not save you.
 *
 * IT RUNS IN PRODUCTION TOO, and that is deliberate. A production URL is left
 * exactly as it is — the table maps each property's OTHER origins onto the one
 * for this environment, so on the live site the only thing it can touch is a
 * stray `stg.` or `.localhost` URL that reached the CMS by somebody pasting a
 * resolved value back. kanu-web's notes already record that as a thing that
 * happens and a thing nobody catches; here it heals on sight. The cost is one
 * sweep of the document plus a mutation observer.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  environmentFromHost,
  mappingsFor,
  rewriteWith,
  rewritesNothing,
  type KanuEnvironment,
  type Overrides,
  type RewriteOptions,
} from './index'

export type KanuLinksProps = RewriteOptions & {
  /**
   * Which copy of the world this page belongs to. Omit it and the hostname
   * decides, which is right for every app we run and needs no configuration.
   */
  env?: KanuEnvironment
  /** Per-property overrides, from the app's own environment variables. */
  overrides?: Overrides
  /**
   * Attributes to rewrite, as `selector` → `attribute`. The default is anchors
   * only. `iframe[src]` is NOT included: changing a `src` after the element is
   * in the document reloads the frame, and the frame was already loading from
   * the old URL, so the fix costs a visible flash and a wasted request. Build
   * those with `useKanuLinks` instead.
   */
  attributes?: ReadonlyArray<readonly [selector: string, attribute: string]>
}

const DEFAULT_ATTRIBUTES = [['a[href]', 'href']] as const

/**
 * Mount once, near the root of the app, inside whatever providers it has.
 * Renders nothing.
 */
export function KanuLinks({
  env,
  overrides,
  attributes = DEFAULT_ATTRIBUTES,
  rewriteAliasesInProduction,
}: KanuLinksProps) {
  /* Both of these arrive as fresh objects on every render of the parent, so
     they are reduced to strings before anything depends on them. Without that
     the effect below tears down its observer and re-sweeps the document on
     every render of the app's root — which works, and is a mutation observer
     being installed hundreds of times. */
  const overridesKey = JSON.stringify(overrides ?? {})
  const attributesKey = JSON.stringify(attributes)

  const environment = useDetectedEnvironment(env)

  const mappings = useMemo(
    () =>
      environment
        ? mappingsFor(environment, JSON.parse(overridesKey) as Overrides, {
            rewriteAliasesInProduction,
          })
        : [],
    [environment, overridesKey, rewriteAliasesInProduction],
  )

  const specs = useMemo(
    () => JSON.parse(attributesKey) as ReadonlyArray<readonly [string, string]>,
    [attributesKey],
  )

  useEffect(() => {
    if (rewritesNothing(mappings)) return

    const sweep = (root: ParentNode) => {
      for (const [selector, attribute] of specs) {
        const matches = root.querySelectorAll ? Array.from(root.querySelectorAll(selector)) : []
        for (const element of matches) {
          /* An opt-out, for a link that deliberately points at production —
             "view this on the live site" is a real thing to want. */
          if (element.closest('[data-kanu-links="off"]')) continue
          const current = element.getAttribute(attribute)
          if (!current) continue
          const next = rewriteWith(mappings, current)
          if (next !== current) element.setAttribute(attribute, next)
        }
      }
    }

    sweep(document)

    /* Client-side navigation replaces the document's contents without
       remounting this component, and React re-renders anchors with the href
       from its own props — which is the pre-rewrite value. So the observer is
       not an optimisation for exotic pages, it is what makes the second page
       of the site work. */
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'attributes' && record.target instanceof Element) {
          sweep(record.target.parentNode ?? document)
        }
        record.addedNodes.forEach((node) => {
          if (node instanceof Element) sweep(node.parentNode ?? document)
        })
      }
    })

    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [...new Set(specs.map(([, attribute]) => attribute))],
    })

    return () => observer.disconnect()
  }, [mappings, specs])

  return null
}

/**
 * The environment, from the prop when the app knows it and from the hostname
 * otherwise. `null` until the first effect runs, so nothing is rewritten on a
 * server render — where there is no hostname to read and no DOM to fix.
 */
function useDetectedEnvironment(env: KanuEnvironment | undefined) {
  const [detected, setDetected] = useState<KanuEnvironment | null>(null)

  useEffect(() => {
    if (env) return
    setDetected(environmentFromHost(window.location.host))
  }, [env])

  return env ?? detected
}

/**
 * For the URLs a rewriter cannot reach: widget script sources, iframe sources,
 * anything handed to an API rather than rendered as a link.
 *
 * PASS `env` WHENEVER THE VALUE IS RENDERED ON THE SERVER. Without it the first
 * client render has to guess (it uses `production`, the safe answer) and
 * corrects itself after mount — which is fine for a `fetch` and wrong for
 * anything React hydrates, where the two renders must agree. Every app here can
 * read its environment on the server with `environmentFromVercel`.
 */
export function useKanuLinks({
  env,
  overrides,
  rewriteAliasesInProduction,
}: Omit<KanuLinksProps, 'attributes'> = {}) {
  /* `production` until the hostname has been read, because that is the answer
     that is never wrong in a way that matters: it links somewhere real. */
  const environment = useDetectedEnvironment(env) ?? 'production'

  return useMemo(() => {
    const mappings = mappingsFor(environment, overrides ?? {}, { rewriteAliasesInProduction })
    return {
      environment,
      rewrite: (url: string) => rewriteWith(mappings, url),
    }
  }, [environment, overrides, rewriteAliasesInProduction])
}
