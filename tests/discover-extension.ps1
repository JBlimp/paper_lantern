$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../companion/discover-extension.ps1')
$root=Join-Path $PSScriptRoot ('../artifacts/discovery-'+[Guid]::NewGuid().ToString('N'));$profile=Join-Path $root 'Default';$extension=Join-Path $root 'unpacked';[IO.Directory]::CreateDirectory($profile)|Out-Null;[IO.Directory]::CreateDirectory($extension)|Out-Null
$utf8=New-Object Text.UTF8Encoding $false
[IO.File]::WriteAllText((Join-Path $extension 'manifest.json'),' {"name":"Paper Lantern","permissions":["nativeMessaging"]}', $utf8)
$id='abcdefghijklmnopabcdefghijklmnop'
$data=@{extensions=@{settings=@{$id=@{path=[IO.Path]::GetFullPath($extension)}; 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'=@{manifest=@{name='Other extension';permissions=@('nativeMessaging')}}}}}
[IO.File]::WriteAllText((Join-Path $profile 'Secure Preferences'),($data|ConvertTo-Json -Depth 10),$utf8)
$ids=@(Get-PaperLanternExtensionIds $root)
if($ids.Count-ne1-or$ids[0]-ne$id){throw 'unpacked discovery failed'}
[IO.File]::WriteAllText((Join-Path $profile 'Preferences'),($data|ConvertTo-Json -Depth 10),$utf8)
if(@(Get-PaperLanternExtensionIds $root).Count-ne1){throw 'dedup failed'}
Write-Output 'PASS: unpacked extension manifest, unrelated extension exclusion and duplicate profile records.'
