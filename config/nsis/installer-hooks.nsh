; Aggregate NSIS customization for the Orca Windows installer.
;
; electron-builder's `nsis.include` accepts a single path, so this file is the
; one entry point and pulls in the per-concern scripts beside it. Add a new
; concern as its own .nsh and !include it here rather than growing this file.
;
; daemon-host-uninstall.nsh is included rather than merged so it keeps the
; filename that src/main/daemon/daemon-host-relocation.ts cross-references.

!include WinVer.nsh
!include "${__FILEDIR__}\daemon-host-uninstall.nsh"

; Block installation below the declared Windows floor.
;
; Why: electron-builder has no `minimumSystemVersion` for Windows — the macOS
; equivalent is enforced by LSMinimumSystemVersion and Linux by the packaging
; glibc gate, but Windows had nothing, so an unsupported user could install and
; then hit undefined behaviour with nothing naming the requirement. The floor is
; Windows 10; see docs/reference/legacy-os-support.md, which is the support
; matrix of record and must be updated in the same change if this moves.
;
; ${AtLeastWin10} is version-number based, and Windows 11 reports NT 10.0 (it is
; distinguished by build number, not NT major), so this correctly admits 10, 11,
; and anything newer — only 8.1 and older are rejected.
;
; The app also warns at runtime (src/main/startup/os-support-floor.ts) for
; installs that predate this check. That one warns and continues; this one
; blocks, because refusing to install on an unsupported OS is the normal
; installer contract and there is no existing install to strand.
!macro customInit
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_OK|MB_ICONSTOP "Orca requires Windows 10 or later.$\r$\n$\r$\nThis computer is running an older version of Windows, which Orca does not support. Installation cannot continue."
    Abort
  ${EndIf}
!macroend
