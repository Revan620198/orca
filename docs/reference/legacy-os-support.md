# Legacy OS Support — Audit

**Status:** findings only, no code changed
**Scope:** where Orca's OS support floor lives, what enforces it, and where it can move without anyone noticing

---

## Summary

Orca has a mature, enforced compatibility story for **Linux** and for the **Git binary**, and a well-abstracted keybinding layer. The gap is not sloppy platform code — the platform code is good. The gap is **structural asymmetry**:

> Linux has a declared floor, a written policy, and a build gate that fails packaging when the floor is breached. macOS and Windows have none of the three. Their floor is whatever Electron happens to ship that month.

That means an Electron major upgrade can raise the macOS or Windows requirement, drop users on the previous OS, and produce **no failing check, no doc change, and no in-app explanation**. The Linux floor cannot regress silently. The other two can only regress silently.

| Platform | Floor declared? | Written policy? | Enforced at build? |
| -------- | --------------- | --------------- | ------------------ |
| Linux    | Yes — glibc 2.31 / Ubuntu 20.04 | [`linux-glibc-compatibility.md`](./linux-glibc-compatibility.md) | Yes — `afterPack` gate |
| macOS    | **No**          | **No**          | **No**             |
| Windows  | **No**          | **No**          | **No**             |

---

## Findings

### F1 — macOS and Windows have no declared OS floor · High

`minimumSystemVersion` does not appear anywhere in the repository. The `mac` block of
[`config/electron-builder.config.cjs`](../../config/electron-builder.config.cjs) sets icon, entitlements, and `extendInfo` keys, but never a minimum system version, so `LSMinimumSystemVersion` is inherited from whatever Electron's own `Info.plist` carries. Windows has no equivalent declaration either.

The effective floor today comes from Electron 43 (`electron: ^43.1.0`):

- **macOS Monterey (12) and up**
- **Windows 10 and up**

Nothing in the repo states this, asserts it, or tests it.

**Why it matters:** the floor is a side effect of a dependency version. `^43.1.0` allows minor upgrades automatically, and a future major bump is routine maintenance. When Electron raises its own floor, Orca's floor rises with it — silently. The first signal would be a user on the dropped OS reporting a broken install.

This is the same class of failure as the node-pty glibc incident in v1.4.150 that broke launch on Ubuntu 20.04 ([#9902](https://github.com/stablyai/orca/issues/9902)). That one is now guarded. The macOS and Windows equivalents are not.

### F2 — The floor is inherited rather than asserted, so it cannot be verified · Medium

There is no single place to answer "what OS versions does Orca support?" for macOS or Windows. The Linux answer is one line at the top of `linux-glibc-compatibility.md`; the macOS answer requires reading the Electron release notes for whichever version the lockfile resolved to.

Consequence: the support matrix cannot be tested, cannot be cited in a release note, and cannot be checked in review. A reviewer looking at an Electron bump has nothing to compare against.

### F3 — No runtime guard for an unsupported OS · Medium

`os.release()` appears in eight places, all of them **telemetry**: crash reporting, diagnostic bundles, and process-gone records. It is never used as a gate.

The one OS-version branch that exists,
[`src/main/window/macos-tahoe-release.ts:5`](../../src/main/window/macos-tahoe-release.ts), checks `isMacosTahoeOrNewer` — an *upper* branch for newer macOS behavior. The pattern for version-aware branching is therefore already established and tested; it has simply never been pointed downward at the floor.

So a user below the floor gets whatever the OS loader does — on macOS typically a refusal to launch, on Windows a less predictable failure — with no message naming the requirement.

### F4 — 32-bit sunset does **not** affect Orca · Verified, no action

Electron 43.x is the last series shipping prebuilt 32-bit binaries (`win32-ia32`, `linux-armv7l`); those platforms end support when the v43 line reaches EOL in **January 2027**.

I checked whether Orca ships either. It does not:

- macOS packaging accepts only x64 and arm64 — `architectureByEnum = { 1: 'x64', 3: 'arm64' }` throws on anything else (`electron-builder.config.cjs:189`)
- Linux release builds are explicitly `--x64` and `--arm64` (`release-cut.yml:984,990`)
- Windows release builds pass a bare `--win`, which defaults to x64
- The only `ia32`/`armv7l` mention is an arch-enum lookup table (`electron-builder.config.cjs:212-214`), not a build target

Recorded so this is not re-investigated when the January 2027 date approaches.

### F5 — Keybinding platform handling is correct · Verified, no action

`AGENTS.md` forbids hardcoded `e.metaKey`. There are 513 `metaKey` references in `src/`, which looks alarming and is not.

Platform decisions are centralized in [`src/shared/keybindings.ts`](../../src/shared/keybindings.ts) via `getKeybindingPlatform`, an `isMac` derivation, and a `mod` abstraction that resolves to Cmd on Darwin and Ctrl elsewhere (`keybindings.ts:1144, 1733-1768, 1893-1896`). The remaining bare `!event.metaKey` sites — in `terminal-shortcut-policy.ts`, `xterm-bypass-policy.ts`, `agent-interrupt-inference.ts` and similar — are *modifier guards* ("this key is unmodified"), which are correct on every platform. Component-level sites normalize into the shared `meta` field rather than branching on it.

No violations found.

### F6 — Git legacy handling is sound · Verified, no action

[`docs/reference/git-compatibility.md`](./git-compatibility.md) declares a Git 2.25 baseline with explicit degradation rules, and `src/shared/git-capability-cache.ts` implements host-scoped capability caching. This is the model the OS floor should copy: a stated baseline, a documented rule for exceeding it, and a mechanism that degrades instead of crashing.

---

## What I could not verify

- **Electron 43's exact floor** was taken from Electron's published release information via web search; `electronjs.org` is blocked by this environment's egress proxy, so I could not read the primary support page directly. Confirm against Electron's docs before writing the numbers into a policy doc.
- **Runtime behavior below the floor** was not observed — no macOS 11 or Windows 8.1 machine was available. The claim that there is no in-app message is from code reading (F3), which is solid; the claim about what the OS itself does is general knowledge, not measured.
- `node_modules` is not installed in this checkout, so no binary was inspected. F4's conclusion rests on build configuration and CI, not on shipped artifacts.

---

## Proposed plan

Ordered by value per unit of risk. Nothing here is started.

**1. Declare the floors.** Add `minimumSystemVersion` to the `mac` block and record the Windows minimum, then write `docs/reference/os-support-floor.md` in the style of the existing Linux and Git compatibility pages — one authoritative table, plus the rule for when the floor may move. Small, no behavior change, and it makes everything below possible.

**2. Gate the floor in CI.** A check in the idiom of `verify-linux-glibc-floor.cjs` and the repo's `check-*` scripts: read the declared floor from the doc/config, read what Electron actually requires, and fail when they disagree. This turns an Electron bump from a silent floor change into a build failure that forces a deliberate decision.

**3. Add a runtime guard with a real message.** Reuse the `macos-tahoe-release.ts` pattern in the downward direction: on startup, if the OS is below the declared floor, show which version is required rather than failing opaquely. Worth doing only after step 1, since it needs a number to compare against.

**4. Document the Electron-upgrade checklist.** A short section in the OS-support doc listing what to re-check on a major bump — floor, arch matrix, 32-bit status. Cheap, and it captures the reasoning in this audit so it does not have to be redone.

Steps 1 and 2 together close F1 and F2. Step 3 closes F3. Step 4 is insurance against this audit going stale.
