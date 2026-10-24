$ErrorActionPreference = 'Stop'
$Node = 'C:\Users\polar\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
# Offline inbox only; independent of PSA authentication and never publishes.
& $Node (Join-Path $PSScriptRoot 'gemrate_private_inbox.js')
exit $LASTEXITCODE
