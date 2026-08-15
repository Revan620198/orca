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

| Platform | Floor declared | Written policy | Enforced automatically |
| -------- | -------------- | -------------- | ---------------------- |
| macOS    | Yes            | Yes            | **No**                 |
| Windows  | Doc only       | Yes            | **No**                 |
| Linux    | Yes            | Yes            | Yes — packaging gate   |

Declaring the floors closes the "nobody knows what we support" problem. It does
**not** yet close the "it can move without anyone noticing" problem: nothing
compares the declared macOS floor against what Electron actually requires, so an
Electron bump can still make this document quietly wrong.

Remaining work, in order of value:

- **A CI check** in the idiom of `verify-linux-glibc-floor.cjs`: read the
  declared floor, read what Electron requires, fail when they disagree. This
  turns an Electron bump from a silent floor change into a forced decision.
- **A runtime guard** that names the requirement instead of failing opaquely.
  [`src/main/window/macos-tahoe-release.ts`](../../src/main/window/macos-tahoe-release.ts)
  already establishes the OS-version-branching pattern — it just points upward at
  the newest macOS rather than downward at the floor.
- **An NSIS version check** so the Windows floor is enforced rather than stated.
- **An Electron-upgrade checklist** capturing floor, arch matrix, and 32-bit
  status as things to re-verify on every major bump.

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
