$ErrorActionPreference = 'Stop'
$taskRepo = $PSScriptRoot
$taskSource = Join-Path $taskRepo 'demo-3\runner\CapstoneApp.cs'
$taskOutput = Join-Path $taskRepo 'desktop-build\demo3\Capstone Demo 3.exe'
$taskCompiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (!(Test-Path -LiteralPath $taskCompiler)) { throw 'The built-in Windows desktop compiler is unavailable.' }
$taskNode = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if ($taskNode) {
  $env:CAPSTONE_NODE_EXECUTABLE = $taskNode.Source
} elseif (!(Test-Path -LiteralPath (Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'))) {
  throw 'Install Node.js 22 or later, then reopen this launcher. See demo-3/docs/setup.txt.'
}
New-Item -ItemType Directory -Path (Split-Path -Parent $taskOutput) -Force | Out-Null
$taskState = Join-Path $taskRepo '.capstone-local'
New-Item -ItemType Directory -Path $taskState -Force | Out-Null
$taskIdentity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $taskState /inheritance:r /grant:r "${taskIdentity}:(OI)(CI)F" | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not protect the Capstone local data folder.' }
$taskSourceHash = (Get-FileHash -LiteralPath $taskSource -Algorithm SHA256).Hash
$taskHashFile = $taskOutput + '.source-sha256'
$taskPreviousHash = if (Test-Path -LiteralPath $taskHashFile) { (Get-Content -LiteralPath $taskHashFile -Raw).Trim() } else { '' }
if (!(Test-Path -LiteralPath $taskOutput) -or $taskPreviousHash -ne $taskSourceHash) {
  & $taskCompiler /nologo /target:winexe /platform:x64 /optimize+ /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll "/out:$taskOutput" $taskSource
  if ($LASTEXITCODE -ne 0) { throw 'The Capstone desktop app could not be built. Close any existing Capstone window, then try again.' }
  Set-Content -LiteralPath $taskHashFile -Value $taskSourceHash -Encoding ASCII
}
# Opens only the visible app, initially OFF. No model, queue polling, startup
# registration, or service is launched here. Runtime prerequisites are separate.
Start-Process -FilePath $taskOutput -ArgumentList ('"' + $taskRepo + '"') -WorkingDirectory $taskRepo -WindowStyle Normal | Out-Null
