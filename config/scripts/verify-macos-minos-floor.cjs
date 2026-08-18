const { readdirSync, openSync, readSync, closeSync } = require('node:fs')
const { spawnSync } = require('node:child_process')
const { join, relative } = require('node:path')

// Why: Linux has a packaging gate that fails the build when a bundled native
// binary needs a newer glibc than the floor (#9902 shipped exactly that crash).
// macOS had no equivalent: release builds run on a macos-15 runner with no
// pinned deployment target and nothing inspecting Mach-O load commands, so the
// identical silent-runner-bump failure had nothing standing in its way. This
// reads each bundled Mach-O's minimum OS and fails packaging when one exceeds
// the declared floor. See docs/reference/legacy-os-support.md.
const MIN_MACOS = Object.freeze([12, 0])
const FLOOR_LABEL = 'macOS 12.0 (Monterey)'

// Why: sherpa-onnx is a third-party speech prebuilt that the Linux gate already
// has to exempt from the libstdc++ floor — it is built against a newer toolchain
// than Orca's floor. It loads lazily in the speech worker and never at launch,
// so a violation degrades speech rather than crashing startup. Report it, do not
// fail the release on a pre-existing non-launch condition.
const LAZY_LOAD_EXEMPT = /(?:^|[/\\])sherpa-onnx/

const MACH_O_MAGICS = new Set([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe])
const BINARY_EXTENSIONS = new Set(['.node', '.dylib', '.so'])

/**
 * Parse `vtool -show-build` / `otool -l` output into a [major, minor] minimum.
 * Handles LC_BUILD_VERSION (`minos 12.0`) and the older LC_VERSION_MIN_MACOSX
 * (`version 10.13`). Returns null when neither is present.
 */
function parseMinimumOsVersion(toolOutput) {
  const match = /^\s*(?:minos|version)\s+(\d+(?:\.\d+)*)\s*$/m.exec(toolOutput ?? '')

  if (!match) {
    return null
  }

  const parts = match[1].split('.').map((part) => Number.parseInt(part, 10))

  return parts.every((part) => Number.isFinite(part)) ? parts : null
}

/** Compare version tuples; missing trailing parts count as 0. */
function compareVersions(a, b) {
  const length = Math.max(a.length, b.length)

  for (let i = 0; i < length; i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff !== 0) {
      return diff < 0 ? -1 : 1
    }
  }

  return 0
}

/** True when the first 4 bytes are a Mach-O (or universal) magic number. */
function isMachO(filePath) {
  let fd

  try {
    fd = openSync(filePath, 'r')
    const buffer = Buffer.alloc(4)
    if (readSync(fd, buffer, 0, 4, 0) < 4) {
      return false
    }
    return MACH_O_MAGICS.has(buffer.readUInt32BE(0)) || MACH_O_MAGICS.has(buffer.readUInt32LE(0))
  } catch {
    return false
  } finally {
    if (fd !== undefined) {
      closeSync(fd)
    }
  }
}

function collectMachOBinaries(rootDir) {
  const found = []

  const walk = (dir) => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
        continue
      }
      if (!entry.isFile()) {
        continue
      }
      const dot = entry.name.lastIndexOf('.')
      const ext = dot === -1 ? '' : entry.name.slice(dot)
      // Extensionless files are candidate executables; otherwise only known
      // binary extensions are worth opening.
      if (ext !== '' && !BINARY_EXTENSIONS.has(ext)) {
        continue
      }
      if (isMachO(full)) {
        found.push(full)
      }
    }
  }

  walk(rootDir)

  return found
}

function readMinimumOsVersion(filePath) {
  for (const [command, args] of [
    ['vtool', ['-show-build', filePath]],
    ['otool', ['-l', filePath]]
  ]) {
    const result = spawnSync(command, args, { encoding: 'utf8' })
    if (result.error || result.status !== 0) {
      continue
    }
    const parsed = parseMinimumOsVersion(result.stdout)
    if (parsed) {
      return parsed
    }
  }

  return null
}

function verifyMacosMinosFloor(rootDir) {
  const binaries = collectMachOBinaries(rootDir)

  if (binaries.length === 0) {
    console.log(`[verify-macos-minos-floor] OK — no bundled Mach-O binaries under ${rootDir}`)
    return
  }

  const offenders = []
  const exempt = []
  let inspected = 0

  for (const filePath of binaries) {
    const minimum = readMinimumOsVersion(filePath)
    if (!minimum) {
      continue
    }
    inspected += 1
    if (compareVersions(minimum, MIN_MACOS) <= 0) {
      continue
    }
    const record = `${relative(rootDir, filePath)} requires macOS ${minimum.join('.')}`
    if (LAZY_LOAD_EXEMPT.test(filePath)) {
      exempt.push(record)
    } else {
      offenders.push(record)
    }
  }

  for (const record of exempt) {
    console.warn(`[verify-macos-minos-floor] WARN (loads lazily, not at launch) — ${record}`)
  }

  if (offenders.length > 0) {
    throw new Error(
      `[verify-macos-minos-floor] ${offenders.length} bundled binary/binaries require a newer ` +
        `macOS than ${FLOOR_LABEL}:\n  ${offenders.join('\n  ')}\n` +
        'Rebuild them with MACOSX_DEPLOYMENT_TARGET=12.0, or record a higher floor in ' +
        'docs/reference/legacy-os-support.md and every site the floor gate checks.'
    )
  }

  console.log(
    `[verify-macos-minos-floor] OK — ${inspected} Mach-O binary/binaries within ${FLOOR_LABEL}`
  )
}

module.exports = {
  verifyMacosMinosFloor,
  parseMinimumOsVersion,
  compareVersions,
  MIN_MACOS
}
