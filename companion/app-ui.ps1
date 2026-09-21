# Dot-sourced by library.ps1: the library window and tray share one UI lifetime.
function Show-AppLibrary {
  $form.WindowState = 'Normal'; $form.Show(); $form.BringToFront(); $form.Activate()
}
function Start-AppService {
  if ($script:appService -and !$script:appService.HasExited) { return }
  $configPath = Join-Path $PSScriptRoot 'config.json'
  if (!(Test-Path -LiteralPath $configPath)) { throw '먼저 companion/install.cmd로 Paper Lantern을 설치해 주세요.' }
  $config = [IO.File]::ReadAllText($configPath) | ConvertFrom-Json
  $node = if ($config.node) { $config.node } else { (Get-Command node.exe -ErrorAction Stop).Source }
  $info = New-Object Diagnostics.ProcessStartInfo
  $info.FileName = $node; $info.Arguments = '"' + (Join-Path $PSScriptRoot 'app-service.mjs') + '"'
  $info.UseShellExecute = $false; $info.CreateNoWindow = $true
  $info.RedirectStandardInput = $true; $info.RedirectStandardError = $true
  $script:appService = [Diagnostics.Process]::Start($info)
  $script:appServiceError = $script:appService.StandardError.ReadToEndAsync()
}
function Stop-AppService {
  if (!$script:appService) { return }
  if (!$script:appService.HasExited) {
    $script:appService.StandardInput.Close()
    if (!$script:appService.WaitForExit(6000)) {
      $null = Start-Process -FilePath "$env:WINDIR\System32\taskkill.exe" -ArgumentList @('/PID', $script:appService.Id, '/T', '/F') -WindowStyle Hidden -Wait
    }
  }
  $script:appService.Dispose(); $script:appService = $null
}
function Initialize-AppController {
  Start-AppService
  $script:appTray = New-Object Windows.Forms.NotifyIcon
  $script:appTray.Icon = [Drawing.SystemIcons]::Application
  $script:appTray.Text = 'Paper Lantern v0.6.1'
  $script:appMenu = New-Object Windows.Forms.ContextMenuStrip
  $item = $appMenu.Items.Add('라이브러리 열기'); $item.add_Click({ Show-AppLibrary })
  $item = $appMenu.Items.Add('상태 보기'); $item.add_Click({
    Refresh-ConnectionState
    [Windows.Forms.MessageBox]::Show($form, ('Paper Lantern v0.6.1' + "`r`n" + $connectionLabel.Text + "`r`n설치: " + $PSScriptRoot), 'Paper Lantern', 'OK', 'Information') | Out-Null
  })
  $item = $appMenu.Items.Add('Codex 연결 다시 시작'); $item.add_Click({
    try { Stop-AppService; Start-AppService; Refresh-ConnectionState } catch { Report-Error $_ }
  })
  $null = $appMenu.Items.Add('-')
  $item = $appMenu.Items.Add('Paper Lantern 종료'); $item.add_Click({ $script:exitApp = $true; $form.Close() })
  $appTray.ContextMenuStrip = $appMenu
  $appTray.add_DoubleClick({ Show-AppLibrary })
  $appTray.Visible = $true
  $form.add_FormClosing({ param($sender,$e)
    if (!$script:exitApp -and $e.CloseReason -eq [Windows.Forms.CloseReason]::UserClosing) {
      $e.Cancel = $true; $sender.Hide()
    }
  })
}
function Close-AppController {
  if ($script:appTray) { $script:appTray.Visible = $false; $script:appTray.Dispose() }
  if ($script:appMenu) { $script:appMenu.Dispose() }
  Stop-AppService
}
