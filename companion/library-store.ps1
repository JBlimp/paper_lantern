# Local library data. Folders are collections; PDF bytes are stored once by SHA-256.
function Open-LibraryStore([string]$Root) {
  $Root = [IO.Path]::GetFullPath($Root)
  [IO.Directory]::CreateDirectory($Root) | Out-Null
  $path = Join-Path $Root 'index.json'
  $data = [pscustomobject]@{ version = 1; folders = @(); papers = @() }
  if (Test-Path -LiteralPath $path) {
    $data = [IO.File]::ReadAllText($path) | ConvertFrom-Json
    if ($data.version -ne 1 -or $null -eq $data.folders -or $null -eq $data.papers) { throw '라이브러리 목록 형식이 올바르지 않습니다. index.json.bak 백업을 확인해 주세요.' }
  }
  return [pscustomobject]@{ Root = $Root; Data = $data }
}
function Save-LibraryStore($Store) {
  $path = Join-Path $Store.Root 'index.json'; $temp = $path + '.tmp'
  [IO.File]::WriteAllText($temp, ($Store.Data | ConvertTo-Json -Depth 12), (New-Object Text.UTF8Encoding $false))
  if ([IO.File]::Exists($path)) { [IO.File]::Replace($temp, $path, ($path + '.bak')) }
  else { [IO.File]::Move($temp, $path) }
}
function Test-LibraryFolder($Store, [string]$Id) {
  if ($Id -and !(@($Store.Data.folders | Where-Object id -eq $Id).Count)) { throw '폴더를 찾을 수 없습니다.' }
}
function Add-LibraryFolderCore($Store, [string]$Name, [string]$Parent = '') {
  Test-LibraryFolder $Store $Parent
  $Name = $Name.Trim(); if (!$Name -or $Name.Length -gt 100) { throw '폴더 이름은 1~100자로 입력하세요.' }
  if (@($Store.Data.folders | Where-Object { $_.parent -eq $Parent -and $_.name -eq $Name }).Count) { throw '같은 위치에 같은 이름의 폴더가 있습니다.' }
  $folder = [pscustomobject]@{ id = [Guid]::NewGuid().ToString(); name = $Name; parent = $Parent }
  $Store.Data.folders = @($Store.Data.folders) + @($folder); Save-LibraryStore $Store; return $folder
}
function Rename-LibraryFolderCore($Store, [string]$Id, [string]$Name) {
  Test-LibraryFolder $Store $Id; $folder = $Store.Data.folders | Where-Object id -eq $Id
  $Name = $Name.Trim(); if (!$Name -or $Name.Length -gt 100) { throw '폴더 이름은 1~100자로 입력하세요.' }
  if (@($Store.Data.folders | Where-Object { $_.id -ne $Id -and $_.parent -eq $folder.parent -and $_.name -eq $Name }).Count) { throw '같은 위치에 같은 이름의 폴더가 있습니다.' }
  $folder.name = $Name; Save-LibraryStore $Store
}
function Remove-LibraryFolderCore($Store, [string]$Id) {
  Test-LibraryFolder $Store $Id
  $ids = New-Object 'System.Collections.Generic.HashSet[string]'; $null = $ids.Add($Id)
  do { $before = $ids.Count; foreach ($folder in $Store.Data.folders) { if ($ids.Contains($folder.parent)) { $null = $ids.Add($folder.id) } } } while ($ids.Count -ne $before)
  $Store.Data.folders = @($Store.Data.folders | Where-Object { !$ids.Contains($_.id) })
  foreach ($paper in $Store.Data.papers) { $paper.folders = @($paper.folders | Where-Object { !$ids.Contains($_) }) }
  Save-LibraryStore $Store
}
function Get-LibraryPaperPath($Store, $Paper) {
  if ($Paper.id -notmatch '^[a-f0-9]{64}$' -or [IO.Path]::GetFileName($Paper.fileName) -ne $Paper.fileName -or $Paper.fileName -notmatch '(?i)\.pdf$') { throw '보관 파일 경로가 올바르지 않습니다.' }
  return Join-Path (Join-Path (Join-Path $Store.Root 'files') $Paper.id) $Paper.fileName
}
function Import-LibraryPaperCore($Store, [string]$Path, [string]$Folder = '') {
  Test-LibraryFolder $Store $Folder
  $source = Get-Item -LiteralPath $Path -ErrorAction Stop
  if ($source.PSIsContainer -or $source.Extension -ine '.pdf' -or $source.Length -gt 100MB) { throw '100MB 이하 PDF만 추가할 수 있습니다.' }
  $stream = [IO.File]::OpenRead($source.FullName)
  try {
    $head = New-Object byte[] 1024; $n = $stream.Read($head,0,$head.Length)
    if (![Text.Encoding]::ASCII.GetString($head,0,$n).Contains('%PDF-')) { throw 'PDF 파일 형식이 아닙니다.' }
    $stream.Position = 0; $sha = [Security.Cryptography.SHA256]::Create()
    try { $id = ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-','').ToLowerInvariant() } finally { $sha.Dispose() }
    $paper = $Store.Data.papers | Where-Object id -eq $id | Select-Object -First 1
    if (!$paper) {
      $paper = [pscustomobject]@{ id = $id; title = $source.BaseName; fileName = $source.Name; addedAt = [DateTime]::UtcNow.ToString('o'); folders = @(); trashed = $false }
    }
    $target = Get-LibraryPaperPath $Store $paper
    if (![IO.File]::Exists($target)) {
      [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target)) | Out-Null
      $temp = $target + '.' + [Guid]::NewGuid().ToString('N') + '.tmp'
      $stream.Position = 0; $dest = [IO.File]::Create($temp)
      try { $stream.CopyTo($dest); $dest.Flush() } finally { $dest.Dispose() }
      [IO.File]::Move($temp,$target)
    }
  } finally { $stream.Dispose() }
  if (!(@($Store.Data.papers | Where-Object id -eq $id).Count)) { $Store.Data.papers = @($Store.Data.papers) + @($paper) }
  $paper.trashed = $false
  if ($Folder -and $Folder -notin $paper.folders) { $paper.folders = @($paper.folders) + @($Folder) }
  Save-LibraryStore $Store; return $paper
}
function Set-LibraryMembershipCore($Store, [string[]]$Ids, [string]$Folder, [switch]$Remove) {
  Test-LibraryFolder $Store $Folder; if (!$Folder) { throw '분류할 폴더를 선택하세요.' }
  foreach ($paper in $Store.Data.papers | Where-Object { $_.id -in $Ids }) {
    if ($Remove) { $paper.folders = @($paper.folders | Where-Object { $_ -ne $Folder }) }
    elseif ($Folder -notin $paper.folders) { $paper.folders = @($paper.folders) + @($Folder) }
  }
  Save-LibraryStore $Store
}
function Set-LibraryTrashCore($Store, [string[]]$Ids, [bool]$Trashed) {
  foreach ($paper in $Store.Data.papers | Where-Object { $_.id -in $Ids }) { $paper.trashed = $Trashed }
  Save-LibraryStore $Store
}
function Rename-LibraryPaperCore($Store, [string]$Id, [string]$Title) {
  $Title = $Title.Trim(); if (!$Title -or $Title.Length -gt 500) { throw '제목은 1~500자로 입력하세요.' }
  $paper = $Store.Data.papers | Where-Object id -eq $Id; if (!$paper) { throw '논문을 찾을 수 없습니다.' }
  $paper.title = $Title; Save-LibraryStore $Store
}

function Invoke-LibraryWrite($Store, [scriptblock]$Action) {
  $hash = [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($Store.Root))).Replace('-','')
  $lock = New-Object Threading.Mutex($false, "Local\PaperLanternData-$hash")
  $held = $false
  try {
    try { $held = $lock.WaitOne(120000) } catch [Threading.AbandonedMutexException] { $held = $true }
    if (!$held) { throw '라이브러리가 사용 중입니다. 잠시 후 다시 시도하세요.' }
    $Store.Data = (Open-LibraryStore $Store.Root).Data
    & $Action
  } finally { if ($held) { $lock.ReleaseMutex() }; $lock.Dispose() }
}
function Add-LibraryFolder($Store,[string]$Name,[string]$Parent='') { Invoke-LibraryWrite $Store { Add-LibraryFolderCore $Store $Name $Parent } }
function Rename-LibraryFolder($Store,[string]$Id,[string]$Name) { Invoke-LibraryWrite $Store { Rename-LibraryFolderCore $Store $Id $Name } }
function Remove-LibraryFolder($Store,[string]$Id) { Invoke-LibraryWrite $Store { Remove-LibraryFolderCore $Store $Id } }
function Import-LibraryPaper($Store,[string]$Path,[string]$Folder='') { Invoke-LibraryWrite $Store { Import-LibraryPaperCore $Store $Path $Folder } }
function Set-LibraryMembership($Store,[string[]]$Ids,[string]$Folder,[switch]$Remove) { Invoke-LibraryWrite $Store { Set-LibraryMembershipCore $Store $Ids $Folder -Remove:$Remove } }
function Set-LibraryTrash($Store,[string[]]$Ids,[bool]$Trashed) { Invoke-LibraryWrite $Store { Set-LibraryTrashCore $Store $Ids $Trashed } }
function Rename-LibraryPaper($Store,[string]$Id,[string]$Title) { Invoke-LibraryWrite $Store { Rename-LibraryPaperCore $Store $Id $Title } }
