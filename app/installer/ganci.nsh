; Ganci dell'installatore (bundle.windows.nsis.installerHooks).

; Disinstallando si toglie tutta la cartella del codice: i pacchetti (node_modules) li installa l'app dopo e l'elenco dei file
; dell'installatore non li conosce. Con /UPDATE l'installatore aggiorna sopra la versione che c'e': i pacchetti restano.
; I dati dell'app (%LOCALAPPDATA%\dev.mango.animation) non si toccano.
!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    RMDir /r "$INSTDIR\codice"
    RMDir "$INSTDIR"
  ${EndIf}
!macroend
