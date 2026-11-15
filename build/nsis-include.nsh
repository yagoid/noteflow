; NoteFlow NSIS customization — adds/removes the CLI from the user PATH, and registers NoteFlow
; as an app that can open .md / .markdown / .txt ("Open with NoteFlow").
!include "WordFunc.nsh"

; ── "Open with NoteFlow" ────────────────────────────────────────────────────
; Written by hand instead of with build.fileAssociations: electron-builder's stock macro
; (APP_ASSOCIATE) sets the DEFAULT value of Software\Classes\.<ext>, which makes NoteFlow the
; default app for .txt / .md wherever the user never picked one (no UserChoice) — and its
; uninstall leaves that value pointing at a deleted ProgID. Here NoteFlow is only OFFERED:
;   - ProgIDs NoteFlow.md / NoteFlow.txt (icon = the app's, open → NoteFlow.exe "%1");
;   - .<ext>\OpenWithProgids → listed in Explorer's "Open with";
;   - Applications\NoteFlow.exe (+ SupportedTypes) → in "Choose another app";
;   - Capabilities + RegisteredApplications → in Settings > Apps > Default apps.
; The .<ext> default value is never written: Windows (UserChoice) and the user decide.
; SHELL_CONTEXT = HKCU for the per-user install (HKLM if per-machine). See release.md.
!macro noteflowRegisterFileTypes
  WriteRegStr SHELL_CONTEXT "Software\Classes\NoteFlow.md" "" "Markdown document"
  WriteRegStr SHELL_CONTEXT "Software\Classes\NoteFlow.md\DefaultIcon" "" "$appExe,0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\NoteFlow.md\shell\open\command" "" '"$appExe" "%1"'
  WriteRegStr SHELL_CONTEXT "Software\Classes\NoteFlow.txt" "" "Text document"
  WriteRegStr SHELL_CONTEXT "Software\Classes\NoteFlow.txt\DefaultIcon" "" "$appExe,0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\NoteFlow.txt\shell\open\command" "" '"$appExe" "%1"'

  WriteRegNone SHELL_CONTEXT "Software\Classes\.md\OpenWithProgids" "NoteFlow.md"
  WriteRegNone SHELL_CONTEXT "Software\Classes\.markdown\OpenWithProgids" "NoteFlow.md"
  WriteRegNone SHELL_CONTEXT "Software\Classes\.txt\OpenWithProgids" "NoteFlow.txt"

  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}" "FriendlyAppName" "${PRODUCT_NAME}"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\DefaultIcon" "" "$appExe,0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\shell\open\command" "" '"$appExe" "%1"'
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".md" ""
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".markdown" ""
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".txt" ""

  WriteRegStr SHELL_CONTEXT "Software\NoteFlow\Capabilities" "ApplicationName" "${PRODUCT_NAME}"
  WriteRegStr SHELL_CONTEXT "Software\NoteFlow\Capabilities" "ApplicationDescription" "Fast notes for software engineers"
  WriteRegStr SHELL_CONTEXT "Software\NoteFlow\Capabilities\FileAssociations" ".md" "NoteFlow.md"
  WriteRegStr SHELL_CONTEXT "Software\NoteFlow\Capabilities\FileAssociations" ".markdown" "NoteFlow.md"
  WriteRegStr SHELL_CONTEXT "Software\NoteFlow\Capabilities\FileAssociations" ".txt" "NoteFlow.txt"
  WriteRegStr SHELL_CONTEXT "Software\RegisteredApplications" "${PRODUCT_NAME}" "Software\NoteFlow\Capabilities"

  ; Tell Explorer the associations changed (SHCNE_ASSOCCHANGED).
  System::Call 'shell32::SHChangeNotify(i, i, i, i) v (0x08000000, 0, 0, 0)'
!macroend

; Removes exactly what noteflowRegisterFileTypes wrote (never another app's ProgID nor the
; .<ext> default value). Skipped on an update: the new version writes it again, and a user who
; made NoteFlow the default keeps a UserChoice pointing at a ProgID that never disappears.
!macro noteflowUnregisterFileTypes
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.md\OpenWithProgids" "NoteFlow.md"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.markdown\OpenWithProgids" "NoteFlow.md"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.txt\OpenWithProgids" "NoteFlow.txt"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\NoteFlow.md"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\NoteFlow.txt"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}"
  DeleteRegValue SHELL_CONTEXT "Software\RegisteredApplications" "${PRODUCT_NAME}"
  DeleteRegKey SHELL_CONTEXT "Software\NoteFlow\Capabilities"
  DeleteRegKey /ifempty SHELL_CONTEXT "Software\NoteFlow"
  System::Call 'shell32::SHChangeNotify(i, i, i, i) v (0x08000000, 0, 0, 0)'
!macroend

!macro customInstall
  ; Add resources\cli to user PATH so 'noteflow' works in any terminal
  ReadRegStr $0 HKCU "Environment" "PATH"
  StrCpy $1 "$INSTDIR\resources\cli"
  ${If} $0 != ""
    WriteRegExpandStr HKCU "Environment" "PATH" "$1;$0"
  ${Else}
    WriteRegExpandStr HKCU "Environment" "PATH" "$1"
  ${EndIf}
  ; Notify open shells that the environment changed
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000

  !insertmacro noteflowRegisterFileTypes
!macroend

!macro customUnInstall
  ; Remove resources\cli from user PATH on uninstall
  ReadRegStr $0 HKCU "Environment" "PATH"
  StrCpy $1 "$INSTDIR\resources\cli;"
  ${WordReplace} $0 "$1" "" "+" $0
  StrCpy $1 ";$INSTDIR\resources\cli"
  ${WordReplace} $0 "$1" "" "+" $0
  WriteRegExpandStr HKCU "Environment" "PATH" "$0"
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000

  ${ifNot} ${isUpdated}
    !insertmacro noteflowUnregisterFileTypes
  ${endIf}
!macroend
