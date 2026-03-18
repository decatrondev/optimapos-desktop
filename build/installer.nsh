!macro customInstall
  ; Refresh Windows icon cache after install/update
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0x0000, p 0, p 0)'
!macroend
