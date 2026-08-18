import { release } from 'node:os'

/**
 * System Settings deep links that work on the whole supported macOS range.
 *
 * Ventura (macOS 13) replaced System Preferences with System Settings and
 * introduced the `*-Settings.extension` / `com.apple.settings.*` identifiers.
 * Those do not resolve on Monterey (macOS 12), which is the declared floor —
 * see docs/reference/legacy-os-support.md — so each link needs the legacy pane
 * id below 13. The legacy ids stay mapped on 13+, but the modern ones are more
 * reliable there, so this picks per version rather than using one form.
 */

// Darwin 22 = macOS 13 (Ventura).
const MIN_VENTURA_DARWIN_MAJOR = 22

const NOTIFICATIONS_VENTURA = 'x-apple.systempreferences:com.apple.Notifications-Settings.extension'
const NOTIFICATIONS_LEGACY = 'x-apple.systempreferences:com.apple.preference.notifications'
const PRIVACY_VENTURA = 'x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension'
const PRIVACY_LEGACY = 'x-apple.systempreferences:com.apple.preference.security'

/** Whether this is macOS 13+ . Unparseable releases assume modern, matching the majority. */
export function isMacosVenturaOrNewer(darwinRelease: string = release()): boolean {
  const major = Number.parseInt(darwinRelease, 10)

  return !Number.isFinite(major) || major >= MIN_VENTURA_DARWIN_MAJOR
}

/** Notification settings pane, optionally scoped to an app bundle id. */
export function macosNotificationSettingsUrl(
  bundleId?: string,
  darwinRelease: string = release()
): string {
  const base = isMacosVenturaOrNewer(darwinRelease) ? NOTIFICATIONS_VENTURA : NOTIFICATIONS_LEGACY

  return bundleId ? `${base}?id=${encodeURIComponent(bundleId)}` : base
}

/** Privacy & Security pane — the fallback when no specific privacy pane is known. */
export function macosPrivacySettingsUrl(darwinRelease: string = release()): string {
  return isMacosVenturaOrNewer(darwinRelease) ? PRIVACY_VENTURA : PRIVACY_LEGACY
}
