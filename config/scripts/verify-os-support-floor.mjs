#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const __dirname = import.meta.dirname
const repoRoot = resolve(__dirname, '../..')

// Why: before this gate, `minimumSystemVersion` was absent and the macOS floor
// was inherited from whatever Electron's own Info.plist carried — so an Electron
// upgrade could drop an OS with no failing check, no doc change, and no in-app
// message. Linux already has that guard (verify-linux-glibc-floor.cjs); this is
// the equivalent for the declared floors. It keeps three things in agreement:
// the builder config, the support matrix doc, and what Electron actually needs.
// See docs/reference/legacy-os-support.md.
//
// Electron's platform support per major, read from the electron/electron README
// at the pinned tag. This table is deliberately manual: bumping Electron must be
// a decision, not a silent inherit, so an unknown major fails the build and asks
// a human to look the floor up and record it.
const ELECTRON_PLATFORM_FLOORS = Object.freeze({
  43: Object.freeze({ macos: '12.0', macosName: 'Monterey', windows: '10' })
})

const BUILDER_CONFIG = 'config/electron-builder.config.cjs'
const SUPPORT_DOC = 'docs/reference/legacy-os-support.md'
const GLIBC_DOC = 'docs/reference/linux-glibc-compatibility.md'

const errors = []
const fail = (message) => errors.push(message)

const electronMajor = readElectronMajor()
const expected = ELECTRON_PLATFORM_FLOORS[electronMajor]

if (!expected) {
  const known = Object.keys(ELECTRON_PLATFORM_FLOORS).join(', ')
  fail(
    `Electron ${electronMajor} has no entry in ELECTRON_PLATFORM_FLOORS (known: ${known}).\n` +
      `  Electron majors can raise the OS floor. Read the "Platform support" section of\n` +
      `  https://raw.githubusercontent.com/electron/electron/v${electronMajor}.0.0/README.md,\n` +
      `  add an entry to ${relativeSelf()}, then update the table in ${SUPPORT_DOC}\n` +
      `  and minimumSystemVersion in ${BUILDER_CONFIG} to match.`
  )
  report()
}

const declaredMac = readDeclaredMacFloor()
const table = readSupportTable()

// 1. The builder config must declare a macOS floor at all.
if (!declaredMac) {
  fail(
    `${BUILDER_CONFIG}: no \`minimumSystemVersion\` in the mac block.\n` +
      `  Without it, LSMinimumSystemVersion is inherited from Electron and the macOS\n` +
      `  floor moves silently on every upgrade. Set it to '${expected.macos}.0'.`
  )
}

// 2. Orca must not claim to support a macOS that Electron cannot run on.
if (declaredMac && compareVersions(declaredMac, expected.macos) < 0) {
  fail(
    `${BUILDER_CONFIG}: declared macOS floor ${declaredMac} is below Electron ` +
      `${electronMajor}'s floor ${expected.macos} (${expected.macosName}).\n` +
      `  The app would be advertised as installable on a macOS Electron does not support.\n` +
      `  Raise minimumSystemVersion to '${expected.macos}.0' and update ${SUPPORT_DOC}.`
  )
}

// 3. The doc is the support matrix of record — it must agree with the config.
//    A stricter-than-Electron floor is allowed (Linux already is one), but the
//    doc and the config may never disagree with each other.
if (declaredMac && table.macos && compareVersions(declaredMac, table.macos) !== 0) {
  fail(
    `macOS floor disagrees between config and doc:\n` +
      `  ${BUILDER_CONFIG}: ${declaredMac}\n` +
      `  ${SUPPORT_DOC}: ${table.macos}\n` +
      `  These must match. The doc is the matrix of record; change both together.`
  )
}

if (!table.macos) {
  fail(`${SUPPORT_DOC}: could not read a macOS version from the floor table.`)
}

// 4. Same rule for Windows, which is doc-only (electron-builder has no
//    minimumSystemVersion for Windows, so there is no config side to compare).
if (table.windows && compareVersions(table.windows, expected.windows) < 0) {
  fail(
    `${SUPPORT_DOC}: declared Windows floor ${table.windows} is below Electron ` +
      `${electronMajor}'s floor ${expected.windows}.`
  )
}

if (!table.windows) {
  fail(`${SUPPORT_DOC}: could not read a Windows version from the floor table.`)
}

// 5. The Linux row must not drift from the doc that actually enforces it.
const glibcDocFloor = readGlibcDocFloor()

if (table.linuxUbuntu && glibcDocFloor.ubuntu && table.linuxUbuntu !== glibcDocFloor.ubuntu) {
  fail(
    `Linux Ubuntu floor disagrees between docs:\n` +
      `  ${SUPPORT_DOC}: ${table.linuxUbuntu}\n` +
      `  ${GLIBC_DOC}: ${glibcDocFloor.ubuntu}\n` +
      `  ${GLIBC_DOC} is enforced at packaging; the matrix must follow it.`
  )
}

if (table.linuxGlibc && glibcDocFloor.glibc && table.linuxGlibc !== glibcDocFloor.glibc) {
  fail(
    `Linux glibc floor disagrees between docs:\n` +
      `  ${SUPPORT_DOC}: glibc ${table.linuxGlibc}\n` +
      `  ${GLIBC_DOC}: glibc ${glibcDocFloor.glibc}`
  )
}

report()

function report() {
  if (errors.length > 0) {
    console.error('OS support floor check FAILED\n')
    for (const error of errors) {
      console.error(`- ${error}\n`)
    }
    process.exit(1)
  }

  console.log(
    `OS support floor: OK — macOS ${declaredMac}, Windows ${table.windows}, ` +
      `Ubuntu ${table.linuxUbuntu} (glibc ${table.linuxGlibc}), Electron ${electronMajor}`
  )
  process.exit(0)
}

function relativeSelf() {
  return 'config/scripts/verify-os-support-floor.mjs'
}

function read(relativePath) {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8')
}

/**
 * Electron major from the package.json devDependency range. A caret range on
 * 43.x cannot resolve to 44, so the major in the range is the shipped major.
 */
function readElectronMajor() {
  const pkg = JSON.parse(read('package.json'))
  const range = pkg.devDependencies?.electron ?? pkg.dependencies?.electron

  if (!range) {
    console.error('package.json: no `electron` dependency found.')
    process.exit(1)
  }

  const major = /(\d+)\./.exec(range)?.[1]

  if (!major) {
    console.error(`package.json: could not read an Electron major from "${range}".`)
    process.exit(1)
  }

  return Number.parseInt(major, 10)
}

/**
 * Read `minimumSystemVersion` textually rather than by require()ing the config.
 * The config resolves packages at load time, so require() needs a full install;
 * this check must also run in a fresh checkout. It is reading a declaration, so
 * a literal read is faithful.
 */
function readDeclaredMacFloor() {
  return /minimumSystemVersion:\s*'([\d.]+)'/.exec(read(BUILDER_CONFIG))?.[1] ?? null
}

/** Parse the floor table in the support doc. */
function readSupportTable() {
  const doc = read(SUPPORT_DOC)
  const macosCell = tableCell(doc, 'macOS')
  const windowsCell = tableCell(doc, 'Windows')
  const linuxCell = tableCell(doc, 'Linux')
  const linuxNumbers = linuxCell ? [...linuxCell.matchAll(/(\d+(?:\.\d+)+)/g)].map((m) => m[1]) : []

  return {
    macos: firstVersion(macosCell),
    windows: firstVersion(windowsCell),
    linuxUbuntu: linuxNumbers[0] ?? null,
    linuxGlibc: linuxNumbers[1] ?? null
  }
}

/** The "Minimum" cell for a bolded platform row: `| **macOS** | 12.0 (...) | ...`. */
function tableCell(doc, platform) {
  const row = new RegExp(`^\\|\\s*\\*\\*${platform}\\*\\*\\s*\\|([^|]+)\\|`, 'm')
  return row.exec(doc)?.[1]?.trim() ?? null
}

function firstVersion(cell) {
  return cell ? (/(\d+(?:\.\d+)*)/.exec(cell)?.[1] ?? null) : null
}

/** Ubuntu and glibc versions from the sentence that opens the glibc doc. */
function readGlibcDocFloor() {
  const doc = read(GLIBC_DOC)
  return {
    ubuntu: /Ubuntu\s+(\d+\.\d+)/.exec(doc)?.[1] ?? null,
    glibc: /glibc\s+(\d+\.\d+)/.exec(doc)?.[1] ?? null
  }
}

/** Compare dotted versions; missing trailing parts count as 0 ("12" === "12.0"). */
function compareVersions(a, b) {
  const left = a.split('.').map(Number)
  const right = b.split('.').map(Number)
  const length = Math.max(left.length, right.length)

  for (let i = 0; i < length; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0)
    if (diff !== 0) {
      return diff < 0 ? -1 : 1
    }
  }

  return 0
}
