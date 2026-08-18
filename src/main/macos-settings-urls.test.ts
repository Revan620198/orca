import { describe, expect, it } from 'vitest'
import {
  isMacosVenturaOrNewer,
  macosNotificationSettingsUrl,
  macosPrivacySettingsUrl
} from './macos-settings-urls'

describe('isMacosVenturaOrNewer', () => {
  it('treats Darwin 22+ (macOS 13) as Ventura or newer', () => {
    expect(isMacosVenturaOrNewer('22.1.0')).toBe(true)
    expect(isMacosVenturaOrNewer('25.0.0')).toBe(true)
  })

  it('treats Darwin 21 (macOS 12 Monterey, the floor) as older', () => {
    expect(isMacosVenturaOrNewer('21.6.0')).toBe(false)
  })

  it('assumes modern when the release is unparseable', () => {
    expect(isMacosVenturaOrNewer('')).toBe(true)
    expect(isMacosVenturaOrNewer('unknown')).toBe(true)
  })
})

describe('macosNotificationSettingsUrl', () => {
  it('uses the legacy pane id on Monterey', () => {
    expect(macosNotificationSettingsUrl(undefined, '21.6.0')).toBe(
      'x-apple.systempreferences:com.apple.preference.notifications'
    )
  })

  it('uses the Settings extension id on Ventura and newer', () => {
    expect(macosNotificationSettingsUrl(undefined, '22.1.0')).toBe(
      'x-apple.systempreferences:com.apple.Notifications-Settings.extension'
    )
  })

  it('scopes to a bundle id on both', () => {
    expect(macosNotificationSettingsUrl('com.stablyai.orca', '21.6.0')).toBe(
      'x-apple.systempreferences:com.apple.preference.notifications?id=com.stablyai.orca'
    )
    expect(macosNotificationSettingsUrl('com.stablyai.orca', '22.1.0')).toBe(
      'x-apple.systempreferences:com.apple.Notifications-Settings.extension?id=com.stablyai.orca'
    )
  })
})

describe('macosPrivacySettingsUrl', () => {
  it('picks the pane id per macOS version', () => {
    expect(macosPrivacySettingsUrl('21.6.0')).toBe(
      'x-apple.systempreferences:com.apple.preference.security'
    )
    expect(macosPrivacySettingsUrl('22.1.0')).toBe(
      'x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension'
    )
  })
})
