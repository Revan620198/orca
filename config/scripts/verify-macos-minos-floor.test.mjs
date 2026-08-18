import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { parseMinimumOsVersion, compareVersions, MIN_MACOS } = require('./verify-macos-minos-floor.cjs')

// Representative `vtool -show-build` output for a modern binary.
const VTOOL_BUILD_VERSION = `/tmp/pty.node:
Load command 10
      cmd LC_BUILD_VERSION
  cmdsize 32
 platform MACOS
    minos 12.0
      sdk 15.0
   ntools 1
`

// Older toolchains emit LC_VERSION_MIN_MACOSX instead, via `otool -l`.
const OTOOL_VERSION_MIN = `Load command 9
      cmd LC_VERSION_MIN_MACOSX
  cmdsize 16
  version 10.13
      sdk 10.14
`

describe('parseMinimumOsVersion', () => {
  it('reads minos from LC_BUILD_VERSION', () => {
    expect(parseMinimumOsVersion(VTOOL_BUILD_VERSION)).toEqual([12, 0])
  })

  it('reads version from the older LC_VERSION_MIN_MACOSX', () => {
    expect(parseMinimumOsVersion(OTOOL_VERSION_MIN)).toEqual([10, 13])
  })

  it('does not mistake the sdk line for the minimum', () => {
    // `sdk` sits directly below `minos` and is always newer; matching it would
    // fail every build.
    expect(parseMinimumOsVersion(VTOOL_BUILD_VERSION)).not.toEqual([15, 0])
  })

  it('returns null when neither load command is present', () => {
    expect(parseMinimumOsVersion('Load command 0\n      cmd LC_SEGMENT_64\n')).toBeNull()
    expect(parseMinimumOsVersion('')).toBeNull()
    expect(parseMinimumOsVersion(undefined)).toBeNull()
  })
})

describe('compareVersions against the floor', () => {
  it('accepts binaries at or below the floor', () => {
    expect(compareVersions([12, 0], MIN_MACOS)).toBe(0)
    expect(compareVersions([11, 0], MIN_MACOS)).toBeLessThan(0)
    expect(compareVersions([10, 13], MIN_MACOS)).toBeLessThan(0)
  })

  it('rejects binaries above the floor', () => {
    expect(compareVersions([13, 0], MIN_MACOS)).toBeGreaterThan(0)
    expect(compareVersions([12, 3], MIN_MACOS)).toBeGreaterThan(0)
  })

  it('treats missing trailing parts as zero', () => {
    expect(compareVersions([12], MIN_MACOS)).toBe(0)
  })
})
