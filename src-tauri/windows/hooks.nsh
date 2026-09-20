; Up to 0.10.8 the product was `t4-git-ui`, and NSIS keys an install on that name: without this
; the renamed installer lands beside the old copy. The old uninstaller keeps the app data under /S.
!macro NSIS_HOOK_PREINSTALL
  ReadRegStr $R8 SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\t4-git-ui" "UninstallString"
  ReadRegStr $R9 SHCTX "${MANUKEY}\t4-git-ui" ""
  ${If} $R8 != ""
  ${AndIf} $R9 != ""
    ; Ask before the silent uninstaller kills it unasked. Uses $0 and $R0-$R3.
    !insertmacro CheckIfAppIsRunning "${MAINBINARYNAME}.exe" "${PRODUCTNAME}"
    ClearErrors
    ExecWait '$R8 /S _?=$R9' $R7
    ${IfNot} ${Errors}
    ${AndIf} $R7 = 0
      Delete "$R9\uninstall.exe" ; `_?=` runs it in place, so it can't delete itself
      RMDir "$R9"
      DeleteRegKey SHCTX "${MANUKEY}\t4-git-ui" ; the remembered install dir, which an uninstall keeps
    ${EndIf}
    ; An update creates no shortcuts, and the old ones are gone (or point at the old copy).
    StrCpy $UpdateMode 0
  ${EndIf}
!macroend
