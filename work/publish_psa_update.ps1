param([int]$Retries = 3, [switch]$PendingOnly)
$ErrorActionPreference = 'Stop'
$Node = 'C:\Users\polar\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$env:PATH = 'C:\Program Files\Git\cmd;' + $env:PATH
if (-not $PendingOnly) {
  & $Node (Join-Path $PSScriptRoot 'psa_handoff.js') --enqueue
  if ($LASTEXITCODE -ne 0) { throw 'PSA saved-data handoff failed. Source files retained.' }
}
& $Node (Join-Path $PSScriptRoot 'psa_handoff.js')
if ($LASTEXITCODE -ne 0) { throw 'PSA publication pending. Retry publication only; immutable packet retained.' }
