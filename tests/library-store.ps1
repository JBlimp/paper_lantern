$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../companion/library-store.ps1')
$root=Join-Path $PSScriptRoot ('../artifacts/library-test-'+[Guid]::NewGuid().ToString('N'))
$store=Open-LibraryStore $root
function Assert($condition,$message){if(!$condition){throw $message}}
$a=Add-LibraryFolder $store 'ANN';$b=Add-LibraryFolder $store 'Graph' $a.id
$p=Import-LibraryPaper $store (Join-Path $PSScriptRoot '../artifacts/sample-paper.pdf') $a.id
$sourceHash=(Get-FileHash -LiteralPath (Join-Path $PSScriptRoot '../artifacts/sample-paper.pdf')).Hash
Assert (Test-Path -LiteralPath (Get-LibraryPaperPath $store $p)) 'copy missing'
Assert ($p.id-eq$sourceHash.ToLowerInvariant()) 'identity mismatch'
$second=Open-LibraryStore $root
$q=Import-LibraryPaper $second (Join-Path $PSScriptRoot '../artifacts/sample-paper.pdf') $b.id
Assert ($second.Data.papers.Count-eq1) 'duplicate copy'
# Stale UI snapshots must merge with an import performed by another process.
Rename-LibraryPaper $store $p.id 'Graph ANN paper'
Assert ($store.Data.papers[0].folders.Count-eq2) 'concurrent membership lost'
Set-LibraryMembership $store @($p.id) $a.id -Remove
Assert ($store.Data.papers[0].folders.Count-eq1) 'remove membership failed'
Rename-LibraryFolder $store $a.id 'Search'
Set-LibraryTrash $store @($p.id) $true
Assert ($store.Data.papers[0].trashed) 'trash failed'
Set-LibraryTrash $store @($p.id) $false
Remove-LibraryFolder $store $a.id
Assert ($store.Data.folders.Count-eq0) 'folder descendants remain'
Assert ($store.Data.papers[0].folders.Count-eq0) 'orphan membership'
Assert (Test-Path -LiteralPath (Get-LibraryPaperPath $store $p)) 'folder removal deleted PDF'
Assert ((Get-FileHash -LiteralPath (Join-Path $PSScriptRoot '../artifacts/sample-paper.pdf')).Hash-eq$sourceHash) 'source changed'
Assert (Test-Path -LiteralPath (Join-Path $root 'index.json.bak')) 'backup absent'
Assert ((Open-LibraryStore $root).Data.papers[0].title-eq'Graph ANN paper') 'restore failed'
$a=Add-LibraryFolder $store 'Graph ANN';$b=Add-LibraryFolder $store 'Disk-based' $a.id;Set-LibraryMembership $store @($p.id) $b.id
Write-Output "PASS: explicit copy, duplicate detection, nested folders, concurrent updates, trash/restore, original preservation."
Write-Output ([IO.Path]::GetFullPath($root))
