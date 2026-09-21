param([Parameter(Mandatory=$true)][string]$SourcePath,[Parameter(Mandatory=$true)][string]$LibraryRoot)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object Text.UTF8Encoding $false
. (Join-Path $PSScriptRoot 'library-store.ps1')
try { $store=Open-LibraryStore $LibraryRoot; $paper=Import-LibraryPaper $store $SourcePath; @{id=$paper.id;title=$paper.title} | ConvertTo-Json -Compress }
catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }
