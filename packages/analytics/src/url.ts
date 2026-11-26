/**
 * Query strings are where personal data leaks into analytics: an email in a
 * confirmation link, a token in a sign-in redirect, a name a form put in the
 * address. Campaign tags (`utm_*`) are the only parameters a report needs, so
 * those are kept and everything else is dropped. The fragment goes too.
 *
 * Anything that does not parse as an absolute URL is returned unchanged rather
 * than thrown on: this runs on every event, on pages we do not control.
 */
export function stripQuery(url: string): string {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return url
  }
  const kept = new URLSearchParams()
  parsed.searchParams.forEach((value, key) => {
    if (key.toLowerCase().startsWith('utm_')) kept.append(key, value)
  })
  const search = kept.toString()
  return `${parsed.origin}${parsed.pathname}${search ? `?${search}` : ''}`
}

/** The PostHog properties that carry a full address. */
export const URL_PROPERTIES = ['$current_url', '$referrer', '$initial_current_url', '$initial_referrer'] as const
