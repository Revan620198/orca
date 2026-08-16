import { describe, expect, it } from 'vitest'
import { checkOsSupportFloor, osSupportFloorWarning } from './os-support-floor'

describe('checkOsSupportFloor', () => {
  it('accepts macOS at and above the Monterey floor', () => {
    // Darwin 21 = macOS 12 (Monterey), the declared floor.
    expect(checkOsSupportFloor({ platform: 'darwin', release: '21.0.0' }).belowFloor).toBe(false)
    expect(checkOsSupportFloor({ platform: 'darwin', release: '22.1.0' }).belowFloor).toBe(false)
    expect(checkOsSupportFloor({ platform: 'darwin', release: '25.0.0' }).belowFloor).toBe(false)
  })

  it('flags macOS below the Monterey floor', () => {
    // Darwin 20 = macOS 11 (Big Sur).
    const verdict = checkOsSupportFloor({ platform: 'darwin', release: '20.6.0' })
    expect(verdict.belowFloor).toBe(true)
    expect(verdict).toMatchObject({ requirement: 'macOS 12.0 (Monterey) or later', detected: '20.6.0' })
  })

  it('accepts Windows 10 and Windows 11', () => {
    // Why: Windows 11 also reports NT 10.0 — it is distinguished by build
    // number, not NT major — so a floor of `>= 10` must accept both.
    expect(checkOsSupportFloor({ platform: 'win32', release: '10.0.19045' }).belowFloor).toBe(false)
    expect(checkOsSupportFloor({ platform: 'win32', release: '10.0.22631' }).belowFloor).toBe(false)
  })

  it('flags Windows below 10', () => {
    // NT 6.3 = Windows 8.1, NT 6.1 = Windows 7.
    expect(checkOsSupportFloor({ platform: 'win32', release: '6.3.9600' }).belowFloor).toBe(true)
    expect(checkOsSupportFloor({ platform: 'win32', release: '6.1.7601' }).belowFloor).toBe(true)
  })

  it('does not check Linux, whose floor is glibc rather than kernel version', () => {
    expect(checkOsSupportFloor({ platform: 'linux', release: '5.4.0' }).belowFloor).toBe(false)
    expect(checkOsSupportFloor({ platform: 'linux', release: '3.10.0' }).belowFloor).toBe(false)
  })

  it('fails open on an unparseable release', () => {
    // A false positive nags (or, if escalated to a block, strands) a user whose
    // OS is fine — worse than staying quiet on an OS we cannot identify.
    expect(checkOsSupportFloor({ platform: 'darwin', release: '' }).belowFloor).toBe(false)
    expect(checkOsSupportFloor({ platform: 'win32', release: 'unknown' }).belowFloor).toBe(false)
  })
})

describe('osSupportFloorWarning', () => {
  it('names the requirement and what was detected', () => {
    const message = osSupportFloorWarning(
      checkOsSupportFloor({ platform: 'win32', release: '6.3.9600' })
    )
    expect(message).toContain('Windows 10 or later')
    expect(message).toContain('6.3.9600')
  })

  it('returns null for a supported OS', () => {
    expect(
      osSupportFloorWarning(checkOsSupportFloor({ platform: 'win32', release: '10.0.19045' }))
    ).toBeNull()
  })
})
