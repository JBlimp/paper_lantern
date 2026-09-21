param([string]$ExtensionId, [string]$CodexPath, [switch]$AutoDetect)
$ErrorActionPreference = 'Stop'
$extensionIds = @()
if ($AutoDetect -or !$ExtensionId) {
  . (Join-Path $PSScriptRoot 'discover-extension.ps1')
  $extensionIds = @(Get-PaperLanternExtensionIds)
}
if ($ExtensionId) { $extensionIds += $ExtensionId }
if (!$extensionIds.Count) { throw 'Paper Lantern 확장을 Chrome에 먼저 로드하고 자동 연결을 다시 눌러 주세요.' }
foreach ($id in $extensionIds) { if ($id -cnotmatch '^[a-p]{32}$') { throw 'Invalid Chrome extension ID.' } }
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
if (!$CodexPath -and (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'config.json'))) {
  $savedConfig = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'config.json') -Raw | ConvertFrom-Json
  if ($savedConfig.codex -and (Test-Path -LiteralPath $savedConfig.codex)) { $CodexPath = $savedConfig.codex }
}
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
foreach ($file in @('host.mjs', 'codex.mjs', 'tasks.mjs', 'queue.mjs', 'runtime.mjs', 'documentTranslation.mjs', 'start.vbs', 'library.mjs', 'install.ps1', 'install.cmd')) {
  $sourceFile = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot $file))
  $targetFile = [IO.Path]::GetFullPath((Join-Path $targetDir $file))
  if ($sourceFile -ine $targetFile) { Copy-Item -LiteralPath $sourceFile -Destination $targetFile -Force }
}
# Node JSON.parse requires UTF-8 without BOM, unlike PowerShell scripts.
$utf8 = New-Object System.Text.UTF8Encoding $false
[IO.File]::WriteAllText((Join-Path $targetDir 'config.json'), (@{ codex = (Resolve-Path -LiteralPath $CodexPath).Path } | ConvertTo-Json), $utf8)
$launcher = Join-Path $targetDir 'host.cmd'
[IO.File]::WriteAllText($launcher, "@echo off`r`nchcp 65001 >nul`r`n`"$nodePath`" `"$targetDir\host.mjs`"`r`n", $utf8)
$manifestPath = Join-Path $targetDir 'com.paperlantern.codex.json'
$origins = @($extensionIds | ForEach-Object { "chrome-extension://$_/" })
if (Test-Path -LiteralPath $manifestPath) {
  $previous = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  $origins = @($previous.allowed_origins) + $origins | Select-Object -Unique
}
$manifest = @{ name = 'com.paperlantern.codex'; description = 'Paper Lantern Codex companion'; path = $launcher; type = 'stdio'; allowed_origins = @($origins) }
[IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json), $utf8)
$reg = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.paperlantern.codex'
New-Item -Path $reg -Force | Out-Null
Set-Item -Path $reg -Value $manifestPath
Write-Host 'Installed. Reload Paper Lantern. PDF tabs connect to the shared Codex host automatically.'

foreach ($scriptFile in @('library.ps1','library-store.ps1','library-import.ps1','discover-extension.ps1')) {
  [IO.File]::WriteAllText((Join-Path $targetDir $scriptFile), [IO.File]::ReadAllText((Join-Path $PSScriptRoot $scriptFile)), (New-Object System.Text.UTF8Encoding $true))
}
# Windows PowerShell 5.1 requires BOM for Korean menu text.
[IO.File]::WriteAllText((Join-Path $targetDir 'tray.ps1'), [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'tray.ps1')), (New-Object System.Text.UTF8Encoding $true))
$programsDir = [Environment]::GetFolderPath('Programs')
$shellLink = New-Object -ComObject WScript.Shell
$shortcut = $shellLink.CreateShortcut((Join-Path $programsDir 'Paper Lantern.lnk'))
$shortcut.TargetPath = Join-Path $env:WINDIR 'System32/wscript.exe'
$shortcut.Arguments = '"' + (Join-Path $targetDir 'start.vbs') + '"'
$shortcut.WorkingDirectory = $targetDir
$shortcut.Description = 'Paper Lantern connection manager'
$shortcut.Save()
