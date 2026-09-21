function Get-PaperLanternExtensionIds([string]$ChromeRoot = (Join-Path $env:LOCALAPPDATA 'Google/Chrome/User Data')) {
  $ids = New-Object 'System.Collections.Generic.HashSet[string]'
  if (!(Test-Path -LiteralPath $ChromeRoot)) { return @() }
  foreach ($profile in @(Get-ChildItem -LiteralPath $ChromeRoot -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq 'Default' -or $_.Name -match '^Profile \d+$' })) {
    foreach ($file in @('Preferences','Secure Preferences')) {
      $path=Join-Path $profile.FullName $file
      if (!(Test-Path -LiteralPath $path)) { continue }
      try {
        $prefs=[IO.File]::ReadAllText($path) | ConvertFrom-Json
        foreach($property in $prefs.extensions.settings.PSObject.Properties) {
          $entry=$property.Value
          $extensionManifest=$entry.manifest
          if (!$extensionManifest -and $entry.path) {
            $extensionPath=if([IO.Path]::IsPathRooted($entry.path)){$entry.path}else{Join-Path $profile.FullName $entry.path}
            $extensionManifestPath=Join-Path $extensionPath 'manifest.json'
            if(Test-Path -LiteralPath $extensionManifestPath){try{$extensionManifest=[IO.File]::ReadAllText($extensionManifestPath)|ConvertFrom-Json}catch{}}
          }
          if($property.Name -cmatch '^[a-p]{32}$' -and $extensionManifest.name -eq 'Paper Lantern' -and 'nativeMessaging' -in @($extensionManifest.permissions)) { $null=$ids.Add($property.Name) }
        }
      } catch { # Chrome may be replacing its preferences file; retry on the next scan.
      }
    }
  }
  return @($ids | Sort-Object)
}
