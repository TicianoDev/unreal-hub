; =====================================================================
;  Unreal Hub 2.1.0 - Windows installer
; =====================================================================
Unicode true
ManifestDPIAware true
SetCompressor /SOLID lzma
RequestExecutionLevel user

!define APPNAME     "Unreal Hub"
!define APPEXE      "Unreal Hub.exe"
!define VERSION     "2.1.0"
!define PUBLISHER   "jsTici & Zorac"
!define REGKEY      "Software\Microsoft\Windows\CurrentVersion\Uninstall\UnrealHub"
!ifndef SRC
!define SRC "..\dist\win-unpacked"
!endif

Name "${APPNAME} ${VERSION}"
OutFile "..\dist\UnrealHub-Setup-${VERSION}.exe"
InstallDir "$LOCALAPPDATA\Programs\${APPNAME}"
InstallDirRegKey HKCU "${REGKEY}" "InstallLocation"
BrandingText "${APPNAME} ${VERSION}  ·  ${PUBLISHER}"
ShowInstDetails show
ShowUninstDetails show

; ---- File properties of the setup .exe (Details tab)
VIProductVersion "2.1.0.0"
VIFileVersion "2.1.0.0"
VIAddVersionKey /LANG=1033 "ProductName" "${APPNAME}"
VIAddVersionKey /LANG=1033 "CompanyName" "${PUBLISHER}"
VIAddVersionKey /LANG=1033 "FileDescription" "${APPNAME} Setup"
VIAddVersionKey /LANG=1033 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1033 "ProductVersion" "${VERSION}"
VIAddVersionKey /LANG=1033 "LegalCopyright" "Copyright (c) 2026 ${PUBLISHER}"
VIAddVersionKey /LANG=1033 "OriginalFilename" "UnrealHub-Setup-${VERSION}.exe"
VIAddVersionKey /LANG=1033 "Comments" "Installer for Unreal Hub, a launcher for Unreal Engine projects. Developed by jsTici & Zorac"

!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"

!define MUI_ICON "..\src\assets\icon.ico"
!define MUI_UNICON "..\src\assets\icon.ico"
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_RIGHT
!define MUI_HEADERIMAGE_BITMAP "installerHeader.bmp"
!define MUI_HEADERIMAGE_UNBITMAP "installerHeader.bmp"
!define MUI_WELCOMEFINISHPAGE_BITMAP "installerSidebar.bmp"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "installerSidebar.bmp"
!define MUI_ABORTWARNING
!define MUI_COMPONENTSPAGE_SMALLDESC
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APPEXE}"
!define MUI_FINISHPAGE_RUN_TEXT "$(RunApp)"
!define MUI_FINISHPAGE_LINK "$(AboutLink)"
!define MUI_FINISHPAGE_LINK_LOCATION "https://github.com/TicianoDev/unreal-hub"
!define MUI_LANGDLL_REGISTRY_ROOT HKCU
!define MUI_LANGDLL_REGISTRY_KEY "Software\jsTici\UnrealHub"
!define MUI_LANGDLL_REGISTRY_VALUENAME "InstallerLanguage"
!define MUI_LANGDLL_ALLLANGUAGES

!define MUI_WELCOMEPAGE_TITLE "$(WelcomeTitle)"
!define MUI_WELCOMEPAGE_TEXT "$(WelcomeText)"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "license.txt"
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_WELCOME
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "Spanish"
!insertmacro MUI_RESERVEFILE_LANGDLL

; ---- Strings
LangString WelcomeTitle ${LANG_ENGLISH} "Welcome to Unreal Hub ${VERSION}"
LangString WelcomeTitle ${LANG_SPANISH} "Bienvenido a Unreal Hub ${VERSION}"
LangString WelcomeText ${LANG_ENGLISH} "This wizard will install Unreal Hub, a fast and beautiful launcher for all your Unreal Engine projects.$\r$\n$\r$\nDeveloped by jsTici & Zorac$\r$\n$\r$\n- Works 100% offline: no data is collected or sent.$\r$\n- Installs only for your user (no administrator rights needed).$\r$\n- Can be fully removed from Windows Settings > Apps.$\r$\n$\r$\nClick Next to continue."
LangString WelcomeText ${LANG_SPANISH} "Este asistente instalará Unreal Hub, un lanzador rápido y bonito para todos tus proyectos de Unreal Engine.$\r$\n$\r$\nDesarrollado por jsTici y Zorac$\r$\n$\r$\n- Funciona 100% sin conexión: no recopila ni envía datos.$\r$\n- Se instala solo para tu usuario (sin permisos de administrador).$\r$\n- Se puede desinstalar por completo desde Configuración > Aplicaciones.$\r$\n$\r$\nPulsa Siguiente para continuar."
LangString RunApp ${LANG_ENGLISH} "Launch Unreal Hub"
LangString RunApp ${LANG_SPANISH} "Abrir Unreal Hub"
LangString AboutLink ${LANG_ENGLISH} "Unreal Hub by jsTici y Zorac"
LangString AboutLink ${LANG_SPANISH} "Unreal Hub por jsTici y Zorac"
LangString SecApp ${LANG_ENGLISH} "Unreal Hub (required)"
LangString SecApp ${LANG_SPANISH} "Unreal Hub (obligatorio)"
LangString SecDesk ${LANG_ENGLISH} "Desktop shortcut"
LangString SecDesk ${LANG_SPANISH} "Acceso directo en el escritorio"
LangString SecMenu ${LANG_ENGLISH} "Start Menu shortcut"
LangString SecMenu ${LANG_SPANISH} "Acceso directo en el menú Inicio"
LangString SecStart ${LANG_ENGLISH} "Start with Windows (in the tray)"
LangString SecStart ${LANG_SPANISH} "Iniciar con Windows (en la bandeja)"
LangString DescApp ${LANG_ENGLISH} "Program files of Unreal Hub."
LangString DescApp ${LANG_SPANISH} "Archivos del programa Unreal Hub."
LangString DescDesk ${LANG_ENGLISH} "Create an Unreal Hub icon on your desktop."
LangString DescDesk ${LANG_SPANISH} "Crea un icono de Unreal Hub en tu escritorio."
LangString DescMenu ${LANG_ENGLISH} "Add Unreal Hub to the Start Menu."
LangString DescMenu ${LANG_SPANISH} "Añade Unreal Hub al menú Inicio."
LangString DescStart ${LANG_ENGLISH} "Open Unreal Hub minimized in the system tray when you sign in."
LangString DescStart ${LANG_SPANISH} "Abre Unreal Hub minimizado en la bandeja al iniciar sesión."
LangString AskData ${LANG_ENGLISH} "Do you also want to delete your Unreal Hub settings (favorites, tags, notes, history)?$\r$\n$\r$\nYour Unreal projects are NEVER deleted."
LangString AskData ${LANG_SPANISH} "¿Quieres borrar también tus ajustes de Unreal Hub (favoritos, etiquetas, notas, historial)?$\r$\n$\r$\nTus proyectos de Unreal NUNCA se borran."
LangString Closing ${LANG_ENGLISH} "Unreal Hub is running. Please close it and click Retry."
LangString Closing ${LANG_SPANISH} "Unreal Hub está abierto. Ciérralo y pulsa Reintentar."

!macro CheckRunning
  retry:
  ClearErrors
  FileOpen $0 "$INSTDIR\${APPEXE}" a
  ${If} ${Errors}
    ${If} ${FileExists} "$INSTDIR\${APPEXE}"
      MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(Closing)" IDRETRY retry
      Abort
    ${EndIf}
  ${Else}
    FileClose $0
  ${EndIf}
!macroend

Function .onInit
  !insertmacro MUI_LANGDLL_DISPLAY
FunctionEnd

Section "!$(SecApp)" SEC_APP
  SectionIn RO
  !insertmacro CheckRunning
  SetOutPath "$INSTDIR"
  RMDir /r "$INSTDIR\resources"
  File /r "${SRC}\*.*"
  File "license.txt"
  WriteUninstaller "$INSTDIR\Uninstall Unreal Hub.exe"

  WriteRegStr HKCU "${REGKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${REGKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${REGKEY}" "Publisher" "${PUBLISHER}"
  WriteRegStr HKCU "${REGKEY}" "DisplayIcon" "$INSTDIR\${APPEXE},0"
  WriteRegStr HKCU "${REGKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${REGKEY}" "UninstallString" '"$INSTDIR\Uninstall Unreal Hub.exe"'
  WriteRegStr HKCU "${REGKEY}" "QuietUninstallString" '"$INSTDIR\Uninstall Unreal Hub.exe" /S'
  WriteRegStr HKCU "${REGKEY}" "URLInfoAbout" "https://github.com/TicianoDev/unreal-hub"
  WriteRegStr HKCU "${REGKEY}" "Comments" "Launcher for Unreal Engine projects. Developed by jsTici & Zorac"
  WriteRegDWORD HKCU "${REGKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${REGKEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKCU "${REGKEY}" "EstimatedSize" "$0"
SectionEnd

Section "$(SecDesk)" SEC_DESK
  CreateShortcut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\${APPEXE}" "" "$INSTDIR\${APPEXE}" 0 SW_SHOWNORMAL "" "${APPNAME} - jsTici & Zorac"
SectionEnd

Section "$(SecMenu)" SEC_MENU
  CreateShortcut "$SMPROGRAMS\${APPNAME}.lnk" "$INSTDIR\${APPEXE}" "" "$INSTDIR\${APPEXE}" 0 SW_SHOWNORMAL "" "${APPNAME} - jsTici & Zorac"
SectionEnd

Section /o "$(SecStart)" SEC_START
  ; read by the app on first run so its own setting stays in sync
  WriteRegDWORD HKCU "Software\jsTici\UnrealHub" "OpenAtLogin" 1
SectionEnd

!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_APP} "$(DescApp)"
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_DESK} "$(DescDesk)"
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_MENU} "$(DescMenu)"
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_START} "$(DescStart)"
!insertmacro MUI_FUNCTION_DESCRIPTION_END

Function un.onInit
  !insertmacro MUI_UNGETLANGUAGE
FunctionEnd

Section "Uninstall"
  !insertmacro CheckRunning
  Delete "$DESKTOP\${APPNAME}.lnk"
  Delete "$SMPROGRAMS\${APPNAME}.lnk"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${APPNAME}"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.jstici.unrealhub"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${REGKEY}"
  ${IfNot} ${Silent}
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "$(AskData)" IDNO keep
    RMDir /r "$APPDATA\${APPNAME}"
    RMDir /r "$APPDATA\unreal-hub"
    DeleteRegKey HKCU "Software\jsTici\UnrealHub"
    keep:
  ${EndIf}
SectionEnd
