$ErrorActionPreference = 'Stop'
$Node = 'C:\Users\polar\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
# Received CSV/page proof only. No GemRate acquisition, PSA login or browser bypass.
# An isolated Git index queues only the two validated compact reference files.
& $Node (Join-Path $PSScriptRoot 'run_gemrate_worker.js')
exit $LASTEXITCODE
