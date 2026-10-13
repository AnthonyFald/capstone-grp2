$ErrorActionPreference = 'Stop'
$demoRoot = Split-Path -Parent $PSScriptRoot
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }
if (-not (Test-Path -LiteralPath $nodePath)) { Write-Host 'Node.js is needed to serve the local AI demo. Install the free LTS release from https://nodejs.org, or open index.html for basic extraction.'; exit 1 }
Write-Host 'Starting the free local demo. Open http://127.0.0.1:4175/demo-1/ in Chrome or Edge.'
Write-Host 'Keep this window open while using the app.'
& $nodePath (Join-Path $demoRoot '../scripts/serve.mjs')
