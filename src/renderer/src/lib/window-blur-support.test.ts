import { describe, expect, it } from 'vitest'
import { isWindowBlurSupported } from './window-blur-support'

describe('isWindowBlurSupported', () => {
  it('supports Windows 11 22H2 and newer', () => {
    // 22621 is 22H2, the first build where backgroundMaterial: 'acrylic' works.
    expect(isWindowBlurSupported({ platform: 'win32', osRelease: '10.0.22621' })).toBe(true)
    expect(isWindowBlurSupported({ platform: 'win32', osRelease: '10.0.26100' })).toBe(true)
  })

  it('rejects Windows below 22H2, including the whole Windows floor', () => {
    // Windows 10 tops out at 19045; 22000 is Windows 11 21H2, still pre-acrylic.
    expect(isWindowBlurSupported({ platform: 'win32', osRelease: '10.0.19045' })).toBe(false)
    expect(isWindowBlurSupported({ platform: 'win32', osRelease: '10.0.22000' })).toBe(false)
  })

  it('rejects macOS and Linux, where the option is never applied', () => {
    expect(isWindowBlurSupported({ platform: 'darwin', osRelease: '23.0.0' })).toBe(false)
    expect(isWindowBlurSupported({ platform: 'linux', osRelease: '5.15.0' })).toBe(false)
  })

  it('fails open when the build cannot be read', () => {
    // The web client reports an empty osRelease; a detection failure must never
    // hide a control that does work.
    expect(isWindowBlurSupported({ platform: 'win32', osRelease: '' })).toBe(true)
    expect(isWindowBlurSupported({ platform: 'win32', osRelease: 'unknown' })).toBe(true)
  })

  it('fails open when the platform is unknown', () => {
    expect(isWindowBlurSupported({ platform: undefined, osRelease: undefined })).toBe(true)
  })
})
