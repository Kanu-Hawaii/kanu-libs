'use client'

/**
 * The banner and dialog, for the apps that use Mantine.
 *
 * WHY THIS EXISTS WHEN THE PACKAGE OTHERWISE RENDERS NOTHING. The first cut of
 * this package deliberately shipped no components, on the reasoning that
 * kanu-needs is Mantine and kanu-web has its own brand tokens, so anything
 * shared would fit neither. That was true of two apps and wrong about five:
 * needs, pledge, map and docs are all Mantine, and only kanu-web is not. Four
 * copies of one banner is four places for the wording, the button order and the
 * hydration handling to drift. kanu-web keeps its own, built from the same hook
 * and the same CONSENT_COPY.
 *
 * Mantine and React are optional peers, and this module is reachable only
 * through the `./mantine` entry point, so an app with neither is unaffected.
 * `portability.test.ts` pins that.
 *
 * REJECT IS AS EASY AS ACCEPT, at the same size and in the same row. A banner
 * where declining costs an extra click through a settings screen is a dark
 * pattern, and it is the one regulators name specifically.
 */

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Anchor, Button, Group, Modal, Paper, Stack, Switch, Text } from '@mantine/core'
import { CONSENT_COPY } from './copy'
import { useCookieConsent, type UseCookieConsentOptions } from './react'

export interface CookieConsentProps extends UseCookieConsentOptions {
  /** Where the Privacy Policy link points. Defaults to this site's own page. */
  privacyHref?: string
  /** Brand colour for the inline link, as a Mantine colour name. */
  linkColor?: string
  /** Applied to every text node, so a site's own face carries through. */
  textStyle?: CSSProperties
  /** Rendered inside the dialog under the categories. For a site-specific note. */
  children?: ReactNode
}

export function CookieConsent({
  privacyHref = '/privacy',
  linkColor = 'kanu-orange',
  textStyle,
  children,
  ...options
}: CookieConsentProps) {
  const {
    preferences,
    showBanner,
    dialogOpen,
    openPreferences,
    closePreferences,
    save,
    acceptAll,
    rejectAll,
  } = useCookieConsent(options)

  // Local until saved, so toggling a switch and dismissing the dialog changes
  // nothing. Reset on each open so an abandoned edit does not persist.
  const [analytics, setAnalytics] = useState(preferences.analytics)
  useEffect(() => {
    if (dialogOpen) setAnalytics(preferences.analytics)
  }, [dialogOpen, preferences.analytics])

  return (
    <>
      {showBanner && (
        <Paper
          shadow="md"
          p="md"
          role="region"
          aria-label="Cookie choices"
          style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1000, borderRadius: 0 }}
        >
          <Group justify="center" gap="md" wrap="wrap">
            <Text size="sm" style={textStyle}>
              {CONSENT_COPY.bannerBody}{' '}
              <Anchor href={privacyHref} size="sm" c={linkColor} style={textStyle}>
                {CONSENT_COPY.privacyLinkLabel}
              </Anchor>
            </Text>
            <Group gap="xs">
              <Button size="xs" variant="subtle" onClick={openPreferences}>
                {CONSENT_COPY.choose}
              </Button>
              <Button size="xs" variant="light" onClick={rejectAll}>
                {CONSENT_COPY.reject}
              </Button>
              <Button size="xs" onClick={acceptAll}>
                {CONSENT_COPY.accept}
              </Button>
            </Group>
          </Group>
        </Paper>
      )}

      <Modal
        opened={dialogOpen}
        onClose={closePreferences}
        title={CONSENT_COPY.dialogTitle}
        centered
        zIndex={1100}
      >
        <Stack gap="lg">
          <Switch
            checked
            disabled
            label={CONSENT_COPY.categories.necessary.label}
            description={CONSENT_COPY.categories.necessary.description}
          />
          <Switch
            checked={analytics}
            onChange={(e) => setAnalytics(e.currentTarget.checked)}
            label={CONSENT_COPY.categories.analytics.label}
            description={CONSENT_COPY.categories.analytics.description}
          />

          {children}

          <Text size="xs" c="dimmed" style={textStyle}>
            {CONSENT_COPY.reopenHint}
          </Text>

          <Group justify="space-between">
            <Button
              variant="subtle"
              size="xs"
              onClick={() => save({ necessary: true, analytics: false })}
            >
              {CONSENT_COPY.rejectAllLabel}
            </Button>
            <Group gap="xs">
              <Button variant="default" size="xs" onClick={closePreferences}>
                {CONSENT_COPY.cancelLabel}
              </Button>
              <Button size="xs" onClick={() => save({ necessary: true, analytics })}>
                {CONSENT_COPY.saveLabel}
              </Button>
            </Group>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}

/**
 * The footer entry. A plain anchor to the hash rather than a button wired to
 * state, so the link and a pasted URL go through exactly one path.
 */
export function CookiePreferencesLink(props: {
  size?: string
  c?: string
  style?: CSSProperties
}) {
  return (
    <Text component="a" href="#cookie" td="underline" {...props}>
      {CONSENT_COPY.footerLinkLabel}
    </Text>
  )
}
