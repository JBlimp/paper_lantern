# Compatibility entry point. There is no separate tray process anymore.
param([switch]$Resume, [switch]$CheckOnly, [switch]$CheckLibraryLaunch)
& (Join-Path $PSScriptRoot 'library.ps1') -CheckOnly:$CheckOnly
