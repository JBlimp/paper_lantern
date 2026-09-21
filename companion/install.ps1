param([string]$ExtensionId, [string]$CodexPath)
$ErrorActionPreference = 'Stop'
if (!$ExtensionId) { $ExtensionId = Read-Host 'Paper Lantern extension ID (chrome://extensions)' }
if ($ExtensionId -notmatch '^[a-p]{32}$') { throw 'Invalid Chrome extension ID.' }
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
if (!$CodexPath) {
  $nativeCodex = Get-Command codex.exe -ErrorAction SilentlyContinue
  if ($nativeCodex) { $CodexPath = $nativeCodex.Source }
}
if (!$CodexPath) {
  $candidates = @(
    Get-ChildItem -Path "$env:LOCALAPPDATA/OpenAI/Codex/bin/*/codex.exe" -ErrorAction SilentlyContinue
    Get-ChildItem -Path "$env:APPDATA/npm/node_modules/@openai/codex/node_modules/@openai/codex-win32-*/vendor/*/codex/codex.exe" -ErrorAction SilentlyContinue
    Get-ChildItem -Path "$env:APPDATA/npm/node_modules/@openai/codex/node_modules/@openai/codex-win32-*/vendor/*/bin/codex.exe" -ErrorAction SilentlyContinue
  )
  $CodexPath = ($candidates | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
}
if (!$CodexPath -or !(Test-Path -LiteralPath $CodexPath -PathType Leaf) -or [IO.Path]::GetExtension($CodexPath) -ne '.exe') { throw 'Install Codex first, or pass -CodexPath with the full path to codex.exe.' }
$targetDir = Join-Path $env:LOCALAPPDATA 'PaperLantern/companion'
New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
foreach ($file in @('host.mjs', 'codex.mjs', 'tasks.mjs')) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination $targetDir -Force }
@{ codex = (Resolve-Path -LiteralPath $CodexPath).Path } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $targetDir 'config.json') -Encoding utf8
# Strip the UTF-8 BOM for Node JSON.parse (Windows PowerShell 5.1 writes one).
$utf8 = New-Object System.Text.UTF8Encoding $false
[IO.File]::WriteAllText((Join-Path $targetDir 'config.json'), (@{ codex = (Resolve-Path -LiteralPath $CodexPath).Path } | ConvertTo-Json), $utf8)
$launcher = Join-Path $targetDir 'host.cmd'
[IO.File]::WriteAllText($launcher, "@echo off`r`nchcp 65001 >nul`r`n`"$nodePath`" `"$targetDir\host.mjs`"`r`n", $utf8)
$manifestPath = Join-Path $targetDir 'com.paperlantern.codex.json'
$origins = @("chrome-extension://$ExtensionId/")
if (Test-Path -LiteralPath $manifestPath) {
  $previous = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  $origins = @($previous.allowed_origins) + $origins | Select-Object -Unique
}
$manifest = @{ name = 'com.paperlantern.codex'; description = 'Paper Lantern Codex companion'; path = $launcher; type = 'stdio'; allowed_origins = @($origins) }
[IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json), $utf8)
$reg = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.paperlantern.codex'
New-Item -Path $reg -Force | Out-Null
Set-Item -Path $reg -Value $manifestPath
Write-Host 'Installed. Open Paper Lantern and click Codex connect.'
