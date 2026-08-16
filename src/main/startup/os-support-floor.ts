import os from 'node:os'

/**
 * Runtime detection of an OS below Orca's declared support floor.
 * See docs/reference/legacy-os-support.md — that doc is the matrix of record,
 * and config/scripts/verify-os-support-floor.mjs keeps it and the build config
 * in agreement. This module is the third leg: telling the *user*.
 */

// Why: Darwin 21 = macOS 12 (Monterey). macOS also refuses to launch below
// LSMinimumSystemVersion, so this is defence in depth rather than the only
// guard — it still matters for a build whose plist was overridden.
const MIN_DARWIN_MAJOR = 21

// Why: Windows NT 10.0 is Windows 10 *and* Windows 11 (11 is distinguished by
// build number, not by NT major), so `>= 10` accepts both and rejects 8.1
// (NT 6.3) and older. Windows has no installer-level floor at all, which makes
// this the only thing standing between an unsupported user and undefined
// behaviour.
const MIN_WINDOWS_NT_MAJOR = 10

export type OsSupportFloorVerdict =
  | { readonly belowFloor: false }
  | { readonly belowFloor: true; readonly requirement: string; readonly detected: string }

const SUPPORTED: OsSupportFloorVerdict = { belowFloor: false }

export interface OsSupportFloorInput {
  readonly platform?: NodeJS.Platform
  readonly release?: string
}

/**
 * Whether the current OS is below the declared floor.
 *
 * Fails open on purpose: an unparseable release reports supported. A false
 * positive here nags — or, if this is ever escalated to a hard block, strands —
 * a user whose OS is fine, which is worse than staying quiet on an OS we cannot
 * identify.
 *
 * Linux is deliberately not checked. Its floor is glibc 2.31, which the kernel
 * release string says nothing about, and a too-old glibc already fails at
 * native-module load before this code runs. That axis is enforced at packaging
 * by config/scripts/verify-linux-glibc-floor.cjs.
 */
export function checkOsSupportFloor({
  platform = process.platform,
  release = os.release()
}: OsSupportFloorInput = {}): OsSupportFloorVerdict {
  if (platform === 'darwin') {
    return checkMajor(release, MIN_DARWIN_MAJOR, 'macOS 12.0 (Monterey) or later')
  }

  if (platform === 'win32') {
    return checkMajor(release, MIN_WINDOWS_NT_MAJOR, 'Windows 10 or later')
  }

  return SUPPORTED
}

function checkMajor(
  release: string,
  minimumMajor: number,
  requirement: string
): OsSupportFloorVerdict {
  const major = Number.parseInt(release, 10)

  if (!Number.isFinite(major)) {
    return SUPPORTED
  }

  if (major >= minimumMajor) {
    return SUPPORTED
  }

  return { belowFloor: true, requirement, detected: release }
}

/** Human-readable warning naming the requirement, or null when supported. */
export function osSupportFloorWarning(verdict: OsSupportFloorVerdict): string | null {
  if (!verdict.belowFloor) {
    return null
  }

  return (
    `Orca requires ${verdict.requirement}. This system reports ${verdict.detected}.\n\n` +
    'Orca will keep running, but it is untested here and features may fail in ' +
    'confusing ways. Updating your operating system is the supported fix.'
  )
}
