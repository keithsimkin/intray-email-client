; Intray assisted installer copy. electron-builder inserts these macros
; before the NSIS pages are built.

!macro customHeader
  BrandingText "Intray"
!macroend

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Install Intray"
  !define MUI_WELCOMEPAGE_TEXT "Intray keeps every inbox in one window.$\r$\n$\r$\nChoose who this copy is for, and where it goes. Mail and keys stay on this PC. Uninstall does not delete them."
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customUnWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Uninstall Intray"
  !define MUI_WELCOMEPAGE_TEXT "Intray will be removed from this PC.$\r$\n$\r$\nDownloaded mail and saved keys stay in your user profile."
  !insertmacro MUI_UNPAGE_WELCOME
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Clients\Mail\Intray"
  DeleteRegKey HKCU "Software\Classes\Intray.mailto"
  DeleteRegValue HKCU "Software\RegisteredApplications" "Intray"
  ClearErrors
!macroend
