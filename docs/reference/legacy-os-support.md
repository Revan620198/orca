# OS Support Floor

Orca's supported operating-system floor, where each floor is declared, and the
rule for moving one. This page is the **support matrix of record** — if a floor
changes, it changes here in the same commit.

## The floor

| Platform    | Minimum                            | Architectures | Declared in                                            |
| ----------- | ---------------------------------- | ------------- | ------------------------------------------------------ |
| **macOS**   | 12.0 (Monterey)                    | x64, arm64    | `minimumSystemVersion` in [`config/electron-builder.config.cjs`](../../config/electron-builder.config.cjs) |
| **Windows** | 10                                 | x64           | this document (see [Windows](#windows) below)          |
| **Linux**   | Ubuntu 20.04 / glibc 2.31          | x64, arm64    | [`linux-glibc-compatibility.md`](./linux-glibc-compatibility.md), enforced at packaging |

Orca ships **no 32-bit builds**. macOS packaging accepts only x64 and arm64,
Linux release builds are explicitly `--x64`/`--arm64`, and the Windows release
passes a bare `--win`, which electron-builder defaults to x64. Electron 43.x is
the last series shipping prebuilt `win32-ia32` and `linux-armv7l` binaries, and
that support ends when v43 reaches EOL in January 2027 — this does not affect
Orca, because Orca never shipped those targets.

## Where the floor comes from

Two independent sources, and the floor is the **stricter** of the two:

**1. Electron.** `electron@43.1.0` (pinned in `pnpm-lock.yaml`) documents its own
platform support as macOS Monterey and up, Windows 10 and up, and Linux verified
on Ubuntu 18.04+/Fedora 32+/Debian 10+. Orca cannot support an OS that Electron
does not run on.

**2. Orca's own native dependencies.** On Linux this is the binding constraint:
node-pty pushes the real floor to **Ubuntu 20.04 / glibc 2.31**, stricter than
Electron's 18.04, because of the glibc 2.32–2.34 libpthread/libutil symbol merge.
See [`linux-glibc-compatibility.md`](./linux-glibc-compatibility.md) for the full
mechanism and the packaging gate that enforces it.

So Linux is *not* simply Electron's floor, and macOS/Windows should not be
assumed to be either — they are Electron's floor only until a native dependency
says otherwise.

## Changing the floor

The floor may only move as a **deliberate, recorded decision**. When an Electron
upgrade, a native dependency, or a platform API changes what Orca can run on:

1. Update the table at the top of this page in the same commit as the change.
2. Update `minimumSystemVersion` in `config/electron-builder.config.cjs` for macOS.
3. Note the change in the release notes — raising a floor drops users, and they
   deserve to find out before the update, not after it fails to launch.
4. Re-check the architecture matrix. An Electron major can drop an arch as well
   as an OS version.

Lowering a floor is equally deliberate: it means committing to test on the older
OS, not just widening a version string.

### macOS

`minimumSystemVersion` writes `LSMinimumSystemVersion` into the app's
`Info.plist`, which is what macOS itself reads to refuse to launch on an older
system. Before it was set explicitly, this key was inherited from whatever
Electron's own `Info.plist` carried — meaning the floor was a side effect of a
dependency version, with nothing in the repo recording or checking it.

### Windows

electron-builder has no `minimumSystemVersion` equivalent for Windows, so the
Windows floor is currently declared **here only** — it is documentation, not an
installer guard. A user on Windows 8.1 can still run the installer; what happens
next is undefined. Adding an NSIS version check to
[`config/nsis/`](../../config/nsis) would make this enforceable, and is tracked
as remaining work below.

### Linux

Already enforced. `config/scripts/verify-linux-glibc-floor.cjs` runs in the
electron-builder `afterPack` hook and **fails the build** if any bundled native
binary needs a newer glibc/libstdc++ than the floor provides. This is the model
the other two platforms should reach.

## Status of enforcement

| Platform | Floor declared | Written policy | Drift caught in CI | On the user's machine                       |
| -------- | -------------- | -------------- | ------------------ | ------------------------------------------- |
| macOS    | Yes            | Yes            | Yes                | Blocked — `LSMinimumSystemVersion`          |
| Windows  | Yes            | Yes            | Yes                | Blocked — NSIS `customInit`                 |
| Linux    | Yes            | Yes            | Yes                | Blocked — packaging gate                    |

[`config/scripts/verify-os-support-floor.mjs`](../../config/scripts/verify-os-support-floor.mjs)
runs in PR CI and fails when any of these drift apart:

1. Electron is bumped to a major with no recorded platform floor — the upgrade
   must record the new floor rather than inherit it silently
2. `minimumSystemVersion` is missing from the mac block
3. The declared macOS floor is below what Electron requires
4. The config and the table at the top of this page disagree
5. The Windows floor is below what Electron requires
6. The Linux row drifts from `linux-glibc-compatibility.md`, which is the doc
   that actually enforces it

The Electron floors live in a deliberately **manual** table inside that script.
Bumping Electron therefore fails CI until a human reads the new version's
platform-support section and records it — which is the point: the floor becomes
a decision instead of a side effect.

## The runtime warning

[`src/main/startup/os-support-floor.ts`](../../src/main/startup/os-support-floor.ts)
checks the running OS at `app.whenReady()` and, below the floor, logs and shows a
dialog naming the requirement and what was detected. Two deliberate choices:

**It warns and continues rather than blocking.** An unsupported OS is not
necessarily a broken one, and silently refusing to start would be a worse
experience than the confusing failures it replaces. Escalating to a hard block is
a one-line change at the call site in `src/main/index.ts` — a product decision,
not a technical one.

**It fails open.** An unparseable release string reports supported. A false
positive nags a user whose OS is fine, which is worse than staying quiet about an
OS we cannot identify.

Windows 11 reports NT `10.0`, the same major as Windows 10 — it is distinguished
by build number — so the Windows floor is `NT major >= 10` and accepts both.
Linux is not checked at runtime: its floor is glibc, which the kernel release
string says nothing about, and a too-old glibc fails at native-module load before
this code runs.

## The Windows installer check

[`config/nsis/installer-hooks.nsh`](../../config/nsis/installer-hooks.nsh)
defines a `customInit` macro that aborts installation below Windows 10, using
`${AtLeastWin10}` from NSIS's `WinVer.nsh`. That macro is version-number based
and Windows 11 reports NT 10.0, so it admits 10, 11, and anything newer, and
rejects only 8.1 and older.

It blocks where the runtime check only warns, and the difference is deliberate:
refusing to *install* on an unsupported OS is the normal installer contract and
strands nobody, whereas refusing to *start* would strand an existing install.

> **Not yet verified on Windows.** This was written without access to a Windows
> machine or an NSIS toolchain, so it has never been compiled or run. A missing
> `WinVer.nsh` or a bad `!include` path surfaces as a build failure in the
> Windows release job rather than as a broken installer, but the runtime
> behaviour of the version comparison has not been observed. Smoke-test an
> installer build before relying on it.

## Upgrading Electron

The floor is downstream of Electron, so a major bump is the moment it moves.
`verify:os-support-floor` fails on an unrecorded major and will tell you this;
the checklist is what to do about it.

1. **Read the new floor from primary source.** The "Platform support" section of
   `https://raw.githubusercontent.com/electron/electron/v<VERSION>/README.md` at
   the exact tag — not a search result, and not the `latest` docs, which describe
   whatever version is current rather than the one being pinned.
2. **Record it** in `ELECTRON_PLATFORM_FLOORS` in
   [`config/scripts/verify-os-support-floor.mjs`](../../config/scripts/verify-os-support-floor.mjs).
3. **If the floor rose**, update in the same commit: the table at the top of this
   page, `minimumSystemVersion` in the builder config, `${AtLeastWin10}` (or its
   successor) in the NSIS hook, the constants in
   [`src/main/startup/os-support-floor.ts`](../../src/main/startup/os-support-floor.ts),
   and the summary line in `AGENTS.md`. Re-run `pnpm verify:os-support-floor`.
4. **Re-check the architecture matrix.** A major can drop an architecture as well
   as an OS version. Orca ships x64 and arm64 only; confirm both still have
   prebuilt binaries.
5. **Note it in the release notes** if a floor rose. Raising a floor drops users,
   and they should find out before the update rather than when it fails to launch.
6. **Confirm Orca's own constraints** have not become the stricter side. The
   floor is the tighter of Electron's and Orca's native dependencies — on Linux
   node-pty is already the binding constraint, not Electron.

## Audit notes

Findings from the audit that produced this document, recorded so they are not
re-investigated:

- **Keybindings are correctly abstracted.** There are 513 `metaKey` references in
  `src/`, none of them violations of the `AGENTS.md` rule. Platform decisions are
  centralized in [`src/shared/keybindings.ts`](../../src/shared/keybindings.ts)
  behind `getKeybindingPlatform`, `isMac`, and a `mod` abstraction. The bare
  `!event.metaKey` sites in the terminal policies are modifier *guards* ("this
  key is unmodified"), which are correct on every platform.
- **Git legacy handling is sound**, with a stated 2.25 baseline and host-scoped
  capability caching. See [`git-compatibility.md`](./git-compatibility.md).
- **`os.release()` is telemetry only.** All eight call sites are crash reporting
  and diagnostics; none gates behavior on OS version.

The Electron platform-support figures above were read from the
`electron/electron` README at the pinned `v43.1.0` tag, not from a search
summary. Re-read that file at the new tag when upgrading — the numbers in this
table are only as current as the pinned version.
