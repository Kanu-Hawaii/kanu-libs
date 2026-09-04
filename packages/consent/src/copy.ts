/**
 * Every user-facing sentence about cookies, in one place.
 *
 * Four sites asking the same question in four different sets of words is how a
 * visitor learns that "Kanu Hawaiʻi" is several organizations. The wording is
 * also the part a lawyer reviews, and reviewing it once beats reviewing it per
 * repo. Each app renders these with its own components: kanu-needs is Mantine,
 * kanu-web has its own brand tokens, and a shared component would fit neither.
 */

export const CONSENT_COPY = {
  bannerBody:
    'We use cookies to keep you signed in, and (with your say-so) to understand how the site gets used.',
  privacyLinkLabel: 'Privacy Policy',
  choose: 'Choose',
  reject: 'Reject',
  accept: 'Accept',
  dialogTitle: 'Cookie preferences',
  saveLabel: 'Save preferences',
  rejectAllLabel: 'Reject all',
  cancelLabel: 'Cancel',
  reopenHint:
    'You can change this whenever you like: the Cookie preferences link in the footer, or add #cookie to any page address.',
  footerLinkLabel: 'Cookie preferences',
  categories: {
    necessary: {
      label: 'Strictly necessary',
      description:
        'Keeps you signed in and remembers this choice. First-party only, and never used to build a profile. These cannot be switched off, so we are not pretending otherwise with a toggle that does nothing.',
    },
    analytics: {
      label: 'Analytics',
      description:
        'Which pages and opportunities get used, so we can make the ones that matter easier to find. Off unless you turn it on.',
    },
  },
} as const
