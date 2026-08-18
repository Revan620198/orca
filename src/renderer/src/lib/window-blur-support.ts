/**
 * Whether the "Window Blur" setting can do anything on this system.
 *
 * createMainWindow() implements blur as `backgroundMaterial: 'acrylic'`, which
 * Electron supports only on Windows 11 22H2 (build 22621) and up, and only on
 * win32 — macOS vibrancy was removed in #8482 and Linux never had it. So on the
 * entire declared Windows floor (Windows 10), and on every macOS and Linux
 * build, the toggle was a control that silently did nothing.
 *
 * See docs/reference/legacy-os-support.md.
 */

// Windows 11 22H2. Windows 10 tops out at build 19045, so this cleanly excludes
// the whole Windows floor as well as pre-22H2 Windows 11.
const MIN_ACRYLIC_BUILD = 22621

export interface WindowBlurSupportInput {
  readonly platform: NodeJS.Platform | undefined
  readonly osRelease: string | undefined
}

/**
 * Fails OPEN: when the platform or build cannot be determined, this reports
 * supported so a detection failure never removes a control that does work. The
 * web client reports an empty osRelease, and serve-mode clients are not the
 * Electron window at all.
 */
export function isWindowBlurSupported({ platform, osRelease }: WindowBlurSupportInput): boolean {
  if (!platform) {
    return true
  }

  if (platform !== 'win32') {
    return false
  }

  const build = parseWindowsBuildNumber(osRelease)

  return build === undefined || build >= MIN_ACRYLIC_BUILD
}

/** Build number from an NT version string such as `10.0.22621`. */
function parseWindowsBuildNumber(osRelease: string | undefined): number | undefined {
  const build = osRelease?.split('.')[2]

  if (!build) {
    return undefined
  }

  const parsed = Number.parseInt(build, 10)

  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}
