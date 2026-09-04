import {
  CONSENT_DEFAULTS,
  CONSENT_VERSION,
  type ConsentPreferences,
  type StoredConsent,
} from './types'
import { defaultStore, type ConsentStore } from './storage'

/**
 * Reading and writing the decision, including carrying the old format forward.
 */

/**
 * The stored decision, or null when there is not one yet.
 *
 * CARRIES v1 FORWARD RATHER THAN RE-ASKING. v1 was a bare string, 'accepted' or
 * 'declined', gating Google Tag Manager on kanu-needs. Both map cleanly onto
 * the analytics category. Re-prompting somebody who already answered is rude,
 * and worse for us than for them: a visitor who declines once and is asked
 * again learns that the answer does not stick.
 *
 * Anything unparseable reads as NO ANSWER, never as consent. That is the only
 * safe direction for a corrupt value to fall.
 */
export function readConsent(store: ConsentStore = defaultStore()): StoredConsent | null {
  const raw = store.read()
  if (!raw) return null

  if (raw === 'accepted' || raw === 'declined') {
    return {
      version: 1,
      preferences: { necessary: true, analytics: raw === 'accepted' },
      decidedAt: '',
    }
  }

  let parsed: Partial<StoredConsent> | null
  try {
    parsed = JSON.parse(raw) as Partial<StoredConsent>
  } catch {
    return null
  }

  if (!parsed || typeof parsed !== 'object' || !parsed.preferences) return null

  return {
    version: typeof parsed.version === 'number' ? parsed.version : 1,
    preferences: {
      necessary: true,
      // Only an explicit true is consent. A truthy string is a bug somewhere,
      // and reading it as agreement would be the expensive way to find out.
      analytics: parsed.preferences.analytics === true,
    },
    decidedAt: typeof parsed.decidedAt === 'string' ? parsed.decidedAt : '',
  }
}

export function writeConsent(
  preferences: ConsentPreferences,
  store: ConsentStore = defaultStore(),
): StoredConsent {
  const record: StoredConsent = {
    version: CONSENT_VERSION,
    preferences: { necessary: true, analytics: preferences.analytics === true },
    decidedAt: new Date().toISOString(),
  }
  store.write(JSON.stringify(record))
  return record
}

/**
 * Whether to show the banner unprompted.
 *
 * A v1 answer is honoured and not re-shown: the categories it maps onto did not
 * change meaning, so there is nothing new to ask. Add a version check here when
 * that stops being true.
 */
export function needsDecision(stored: StoredConsent | null): boolean {
  return stored === null
}

export function preferencesOf(stored: StoredConsent | null): ConsentPreferences {
  return stored?.preferences ?? CONSENT_DEFAULTS
}

/** The two one-tap answers a banner offers. */
export const ACCEPT_ALL: ConsentPreferences = { necessary: true, analytics: true }
export const REJECT_ALL: ConsentPreferences = { necessary: true, analytics: false }
