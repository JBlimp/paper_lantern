param([string]$DataRoot = (Join-Path $env:LOCALAPPDATA 'PaperLantern/library'), [switch]$CheckOnly, [switch]$CheckDialog, [string]$ScreenshotPath)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
. (Join-Path $PSScriptRoot 'library-store.ps1')
. (Join-Path $PSScriptRoot 'discover-extension.ps1')
[Windows.Forms.Application]::EnableVisualStyles()
$created = $false
$hash = [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes([IO.Path]::GetFullPath($DataRoot)))).Replace('-','')
$mutex = New-Object Threading.Mutex($true, "Local\PaperLanternLibrary-$hash", [ref]$created)
if (!$created) { [IO.File]::WriteAllText((Join-Path $DataRoot 'show-window'), 'show'); $mutex.Dispose(); exit }
try {
  $script:store = Open-LibraryStore $DataRoot
  $script:group = 'all'
  $form = New-Object Windows.Forms.Form
  $form.Text = 'Paper Lantern - Library'; $form.Size = New-Object Drawing.Size(1180,760); $form.MinimumSize = New-Object Drawing.Size(900,580); $form.StartPosition = 'CenterScreen'; $form.BackColor = [Drawing.Color]::White
  $form.Font = New-Object Drawing.Font('Segoe UI',10)
  $form.AllowDrop = $true
  $toolbar = New-Object Windows.Forms.FlowLayoutPanel; $toolbar.Dock = 'Top'; $toolbar.Height = 56; $toolbar.Padding = New-Object Windows.Forms.Padding(12,10,8,8); $toolbar.BackColor = [Drawing.Color]::FromArgb(248,249,251)
  function Button([string]$Text) { $b = New-Object Windows.Forms.Button; $b.Text = $Text; $b.AutoSize = $true; $b.Height = 32; $b.FlatStyle = 'Flat'; $b.FlatAppearance.BorderColor = [Drawing.Color]::FromArgb(220,224,230); $b.BackColor = [Drawing.Color]::White; $b.Margin = New-Object Windows.Forms.Padding(0,0,8,0); $toolbar.Controls.Add($b); return $b }
  $import = Button 'PDF 추가'; $newFolder = Button '새 폴더'; $open = Button '논문 열기'; $rename = Button '제목 수정'; $remove = Button '폴더에서 빼기'; $trash = Button '휴지통'; $restore = Button '복원'; $setup = Button '확장 자동 연결'; $manual = Button '수동 연결'
  $split = New-Object Windows.Forms.SplitContainer; $split.Dock = 'Fill'; $split.Size = New-Object Drawing.Size(1100,620); $split.Panel1MinSize = 170; $split.SplitterDistance = 220; $split.Panel1.BackColor = [Drawing.Color]::FromArgb(248,249,251)
  $tree = New-Object Windows.Forms.TreeView; $tree.Dock = 'Fill'; $tree.BorderStyle = 'None'; $tree.FullRowSelect = $true; $tree.HideSelection = $false; $tree.ItemHeight = 32; $tree.Indent = 18; $tree.BackColor = $split.Panel1.BackColor; $tree.AllowDrop = $true; $split.Panel1.Controls.Add($tree)
  $right = New-Object Windows.Forms.Panel; $right.Dock = 'Fill'; $right.Padding = New-Object Windows.Forms.Padding(16,12,16,8); $split.Panel2.Controls.Add($right)
  $searchPanel = New-Object Windows.Forms.Panel; $searchPanel.Dock = 'Top'; $searchPanel.Height = 44
  $searchLabel = New-Object Windows.Forms.Label; $searchLabel.Text = '검색'; $searchLabel.Location = New-Object Drawing.Point(0,6); $searchLabel.AutoSize = $true
  $search = New-Object Windows.Forms.TextBox; $search.Location = New-Object Drawing.Point(48,2); $search.Width = 360; $search.Anchor = 'Top,Left,Right'; $searchPanel.Controls.AddRange(@($searchLabel,$search))
  $list = New-Object Windows.Forms.ListView; $list.Dock = 'Fill'; $list.View = 'Details'; $list.FullRowSelect = $true; $list.MultiSelect = $true; $list.HideSelection = $false; $list.BorderStyle = 'None'; $list.AllowDrop = $true
  $null = $list.Columns.Add('논문',430); $null = $list.Columns.Add('폴더',190); $null = $list.Columns.Add('추가 날짜',105)
  $right.Controls.Add($list); $right.Controls.Add($searchPanel)
  $status = New-Object Windows.Forms.Label; $status.Dock = 'Bottom'; $status.Height = 36; $status.Padding = New-Object Windows.Forms.Padding(14,8,0,0); $status.ForeColor = [Drawing.Color]::FromArgb(95,105,120)
  $connectionLabel = New-Object Windows.Forms.Label; $connectionLabel.Dock='Bottom'; $connectionLabel.Height=30; $connectionLabel.Padding=New-Object Windows.Forms.Padding(14,5,0,0); $connectionLabel.ForeColor=[Drawing.Color]::FromArgb(80,100,130); $connectionLabel.Text='연결 상태 확인 중'
  $form.Controls.Add($split); $form.Controls.Add($toolbar); $form.Controls.Add($connectionLabel); $form.Controls.Add($status)
  function Report-Error($ErrorRecord) { [Windows.Forms.MessageBox]::Show($form, $ErrorRecord.Exception.Message, 'Paper Lantern', 'OK', 'Error') | Out-Null }
  function Selected-Ids { return @($list.SelectedItems | ForEach-Object { [string]$_.Tag }) }
  function Ask-Text([string]$Title, [string]$Value) {
    $dialog = New-Object Windows.Forms.Form; $dialog.Text=$Title; $dialog.Size=New-Object Drawing.Size(470,165); $dialog.StartPosition='CenterParent'; $dialog.FormBorderStyle='FixedDialog'; $dialog.MaximizeBox=$false; $dialog.MinimizeBox=$false; $dialog.Font=$form.Font
    $nameBox = New-Object Windows.Forms.TextBox; $nameBox.Name='nameBox'; $nameBox.Text=$Value; $nameBox.Location=New-Object Drawing.Point(16,18); $nameBox.Width=420
    $ok=New-Object Windows.Forms.Button; $ok.Text='저장'; $ok.Location=New-Object Drawing.Point(265,62); $ok.DialogResult='OK'
    $cancel=New-Object Windows.Forms.Button; $cancel.Text='취소'; $cancel.Location=New-Object Drawing.Point(350,62); $cancel.DialogResult='Cancel'
    $dialog.Controls.AddRange(@($nameBox,$ok,$cancel)); $dialog.AcceptButton=$ok; $dialog.CancelButton=$cancel; $dialog.add_Shown({ param($sender,$eventArgs); $box=$sender.Controls.Find('nameBox',$false)[0]; if($box){$box.SelectAll();$null=$box.Focus()} })
    try { if ($dialog.ShowDialog($form) -eq 'OK') { return $nameBox.Text } return $null } finally { $dialog.Dispose() }
  }
  function Refresh-List {
    $list.BeginUpdate(); $list.Items.Clear()
    $papers = @($store.Data.papers | Where-Object {
      $visible = if ($group -eq 'trash') { $_.trashed } elseif ($_.trashed) { $false } elseif ($group -eq 'all') { $true } elseif ($group -eq 'unfiled') { !@($_.folders).Count } else { $group -in $_.folders }
      $visible -and (!$search.Text -or $_.title.IndexOf($search.Text,[StringComparison]::OrdinalIgnoreCase) -ge 0 -or $_.fileName.IndexOf($search.Text,[StringComparison]::OrdinalIgnoreCase) -ge 0)
    } | Sort-Object addedAt -Descending)
    foreach ($paper in $papers) {
      $item=New-Object Windows.Forms.ListViewItem($paper.title); $item.Tag=$paper.id
      $names=@($store.Data.folders | Where-Object { $_.id -in $paper.folders } | ForEach-Object name)
      $null=$item.SubItems.Add(($names -join ', ')); $null=$item.SubItems.Add(([DateTime]::Parse($paper.addedAt).ToLocalTime().ToString('yyyy-MM-dd'))); $null=$list.Items.Add($item)
    }
    $list.EndUpdate(); $status.Text="$($papers.Count)편  ·  PDF를 이 창에 놓아 추가 · 논문을 왼쪽 폴더로 드래그하여 분류"
    $restore.Visible=($group -eq 'trash'); $trash.Visible=($group -ne 'trash'); $remove.Visible=($group -notin @('all','unfiled','trash'))
  }
  function Refresh-Tree {
    $tree.BeginUpdate(); $tree.Nodes.Clear()
    foreach ($pair in @(@('전체 논문','all'),@('미분류','unfiled'),@('휴지통','trash'))) { $node=$tree.Nodes.Add($pair[0]); $node.Tag=$pair[1] }
    function Add-Nodes($ParentNodes,[string]$Parent) {
      foreach($folder in @($store.Data.folders | Where-Object parent -eq $Parent | Sort-Object name)) { $node=$ParentNodes.Add($folder.name); $node.Tag=$folder.id; Add-Nodes $node.Nodes $folder.id }
    }
    Add-Nodes $tree.Nodes ''; $tree.ExpandAll()
    function Find-Node($Nodes) { foreach($node in $Nodes) { if($node.Tag -eq $script:group){return $node}; $found=Find-Node $node.Nodes; if($found){return $found} } }
    $found=Find-Node $tree.Nodes; if(!$found){$found=$tree.Nodes[0]}; $tree.SelectedNode=$found; $tree.EndUpdate(); Refresh-List
  }
  function Import-Paths([string[]]$Paths) {
    $folder=if($group -in @('all','unfiled','trash')){''}else{$group}; $failures=@(); $count=0
    $form.UseWaitCursor=$true
    try { foreach($path in $Paths) { try { $null=Import-LibraryPaper $store $path $folder; $count++ } catch { $failures += ([IO.Path]::GetFileName($path)+': '+$_.Exception.Message) } }; Refresh-List; $status.Text="$count 편을 라이브러리에 추가했습니다." }
    finally { $form.UseWaitCursor=$false }
    if($failures.Count){[Windows.Forms.MessageBox]::Show($form,($failures -join "`r`n"),'추가하지 못한 파일','OK','Warning')|Out-Null}
  }
  function Open-Selected {
    foreach($id in (Selected-Ids)) {
      $paper=$store.Data.papers | Where-Object id -eq $id; $path=Get-LibraryPaperPath $store $paper
      if(!(Test-Path -LiteralPath $path)){throw '보관된 PDF를 찾을 수 없습니다.'}
      $chrome=$null
      foreach($key in @('HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe','HKLM:\Software\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe')){if(Test-Path $key){$chrome=(Get-ItemProperty $key).'(default)';if($chrome){break}}}
      if(!$chrome){foreach($candidate in @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe","${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe","$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe")){if(Test-Path -LiteralPath $candidate){$chrome=$candidate;break}}}
      if(!$chrome){throw 'Chrome을 설치한 뒤 다시 시도해 주세요.'}
      $url=(New-Object Uri($path)).AbsoluteUri
      Start-Process -FilePath $chrome -ArgumentList @('--new-tab', ('"'+$url+'"')) -WindowStyle Normal
    }
  }
  function Connect-Extension([switch]$Interactive) {
    try {
      $ids=@(Get-PaperLanternExtensionIds)
      if (!$ids.Count) { if($Interactive){throw 'Paper Lantern 확장을 Chrome에 먼저 로드해 주세요. 설치 후 자동으로 연결합니다.'}; return }
      $manifestPath=Join-Path $env:LOCALAPPDATA 'PaperLantern/companion/com.paperlantern.codex.json'
      $registered=@()
      if(Test-Path -LiteralPath $manifestPath){$registered=@((Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json).allowed_origins)}
      $missing=@($ids | Where-Object { "chrome-extension://$_/" -notin $registered })
      $registryPath='HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.paperlantern.codex'
      $registeredPath=if(Test-Path $registryPath){(Get-Item $registryPath).GetValue('')}else{''}
      if($missing.Count -or $registeredPath -ne $manifestPath -or $Interactive){
        $setup.Enabled=$false
        try { $null=& (Join-Path $PSScriptRoot 'install.ps1') -AutoDetect }
        finally {$setup.Enabled=$true}
      }
      if($Interactive -or $missing.Count){$connectionLabel.Text="확장 $($ids.Count)개 연결 등록 완료 · 리더가 자동으로 다시 연결합니다."}
    } catch { if($Interactive){Report-Error $_}else{$connectionLabel.Text='자동 등록 확인 필요 · 수동 연결에서 확장 ID를 입력할 수 있습니다.'} }
  }
  function Refresh-ConnectionState {
    $runtime=Join-Path $env:LOCALAPPDATA 'PaperLantern/runtime'
    if(Test-Path -LiteralPath (Join-Path $runtime 'paused')){$connectionLabel.Text='연결 프로그램이 중지되어 있습니다 · 자동 연결 또는 수동 연결을 눌러 주세요.';return}
    $records=@(Get-ChildItem -LiteralPath $runtime -Filter 'host-*.json' -ErrorAction SilentlyContinue | ForEach-Object {try{$record=[IO.File]::ReadAllText($_.FullName)|ConvertFrom-Json;if(([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()-$record.updatedAt)-lt5000){$record}}catch{}})
    $ready=@($records | Where-Object state -eq 'ready')
    if($ready.Count){$connectionLabel.Text="리더 연결됨 · 모델 $($ready[0].models)개";return}
    if(@($records | Where-Object state -eq 'error').Count){$connectionLabel.Text='리더 연결 오류 · 확장 프로그램 설정의 오류 내용을 확인해 주세요.';return}
    $manifest=Join-Path $env:LOCALAPPDATA 'PaperLantern/companion/com.paperlantern.codex.json'
    if(Test-Path -LiteralPath $manifest){$connectionLabel.Text='확장 ID 등록됨 · 리더 연결 대기 (PDF 탭 또는 확장 프로그램을 열어 주세요)'}else{$connectionLabel.Text='연결 등록 필요 · 자동 연결 또는 수동 연결을 눌러 주세요.'}
  }
  function Resume-Connection {
    $paused=Join-Path $env:LOCALAPPDATA 'PaperLantern/runtime/paused'
    if(Test-Path -LiteralPath $paused){Remove-Item -LiteralPath $paused}
  }
  $manual.add_Click({
    try {
      $previousId='';$manifest=Join-Path $env:LOCALAPPDATA 'PaperLantern/companion/com.paperlantern.codex.json'
      if(Test-Path -LiteralPath $manifest){$origin=@((Get-Content -LiteralPath $manifest -Raw|ConvertFrom-Json).allowed_origins)|Select-Object -Last 1;if($origin-match'^chrome-extension://([a-p]{32})/$'){$previousId=$Matches[1]}}
      $extensionId=Ask-Text '수동 연결 - 확장 ID 붙여넣기' $previousId
      if($null-eq$extensionId){return};$extensionId=$extensionId.Trim()
      if($extensionId-cnotmatch'^[a-p]{32}$'){throw '확장 프로그램 설정에서 복사한 ID(a~p 소문자 32자)를 입력해 주세요.'}
      $manual.Enabled=$false;$form.UseWaitCursor=$true
      try{$null=& (Join-Path $PSScriptRoot 'install.ps1') -ExtensionId $extensionId;Resume-Connection}finally{$manual.Enabled=$true;$form.UseWaitCursor=$false}
      Refresh-ConnectionState
      [Windows.Forms.MessageBox]::Show($form,'ID를 등록했습니다. 확장 프로그램 설정에서 모델 목록 다시 불러오기를 눌러 연결을 확인하세요.','수동 연결','OK','Information')|Out-Null
    } catch {Report-Error $_}
  })
  $setup.add_Click({Resume-Connection;Connect-Extension -Interactive;Refresh-ConnectionState})
  if(!$CheckOnly){$form.add_Shown({param($sender,$eventArgs);$sender.WindowState='Normal';$sender.BringToFront();$sender.Activate();Connect-Extension})}
  $import.add_Click({$dialog=New-Object Windows.Forms.OpenFileDialog;$dialog.Filter='PDF (*.pdf)|*.pdf';$dialog.Multiselect=$true;try{if($dialog.ShowDialog($form)-eq'OK'){Import-Paths $dialog.FileNames}}catch{Report-Error $_}finally{$dialog.Dispose()}})
  $newFolder.add_Click({try{$name=Ask-Text '새 폴더' '';if($null-ne$name){$parent=if($group-in@('all','unfiled','trash')){''}else{$group};$folder=Add-LibraryFolder $store $name $parent;$script:group=$folder.id;Refresh-Tree}}catch{Report-Error $_}})
  $tree.add_AfterSelect({$script:group=[string]$tree.SelectedNode.Tag;Refresh-List})
  $search.add_TextChanged({Refresh-List})
  $open.add_Click({try{Open-Selected}catch{Report-Error $_}});$list.add_DoubleClick({try{Open-Selected}catch{Report-Error $_}})
  $rename.add_Click({try{$ids=@(Selected-Ids);if(@($ids).Count-ne1){return};$paper=$store.Data.papers|Where-Object id -eq $ids[0];$title=Ask-Text '논문 제목' $paper.title;if($null-ne$title){Rename-LibraryPaper $store $paper.id $title;Refresh-List}}catch{Report-Error $_}})
  $remove.add_Click({try{Set-LibraryMembership $store (Selected-Ids) $group -Remove;Refresh-List}catch{Report-Error $_}})
  $trash.add_Click({try{Set-LibraryTrash $store (Selected-Ids) $true;Refresh-List}catch{Report-Error $_}})
  $restore.add_Click({try{Set-LibraryTrash $store (Selected-Ids) $false;Refresh-List}catch{Report-Error $_}})
  $folderMenu=New-Object Windows.Forms.ContextMenuStrip;$folderRename=$folderMenu.Items.Add('폴더 이름 변경');$folderDelete=$folderMenu.Items.Add('폴더 삭제');$tree.ContextMenuStrip=$folderMenu
  $tree.add_NodeMouseClick({param($sender,$e);$tree.SelectedNode=$e.Node})
  $folderMenu.add_Opening({param($sender,$e);$e.Cancel=($group-in@('all','unfiled','trash'))})
  $folderRename.add_Click({try{$folder=$store.Data.folders|Where-Object id -eq $group;$name=Ask-Text '폴더 이름' $folder.name;if($null-ne$name){Rename-LibraryFolder $store $group $name;Refresh-Tree}}catch{Report-Error $_}})
  $folderDelete.add_Click({try{if([Windows.Forms.MessageBox]::Show($form,'이 폴더와 하위 폴더의 분류를 지웁니다. 논문 파일은 전체 논문에 남습니다.','폴더 삭제','OKCancel','Question')-eq'OK'){Remove-LibraryFolder $store $group;$script:group='all';Refresh-Tree}}catch{Report-Error $_}})
  $list.add_ItemDrag({if($list.SelectedItems.Count){$data=New-Object Windows.Forms.DataObject;$data.SetData('PaperLanternIds',((Selected-Ids)-join','));$null=$list.DoDragDrop($data,[Windows.Forms.DragDropEffects]::Copy)}})
  $externalDrag={param($sender,$e);if($e.Data.GetDataPresent([Windows.Forms.DataFormats]::FileDrop)){$e.Effect=[Windows.Forms.DragDropEffects]::Copy}}
  $externalDrop={param($sender,$e);if($e.Data.GetDataPresent([Windows.Forms.DataFormats]::FileDrop)){try{Import-Paths $e.Data.GetData([Windows.Forms.DataFormats]::FileDrop)}catch{Report-Error $_}}}
  foreach($control in @($form,$list)){$control.add_DragEnter($externalDrag);$control.add_DragDrop($externalDrop)}
  $tree.add_DragOver({param($sender,$e);$node=$tree.GetNodeAt($tree.PointToClient((New-Object Drawing.Point($e.X,$e.Y))));if($node-and$node.Tag-notin@('all','unfiled','trash')-and($e.Data.GetDataPresent('PaperLanternIds')-or$e.Data.GetDataPresent([Windows.Forms.DataFormats]::FileDrop))){$e.Effect=[Windows.Forms.DragDropEffects]::Copy}else{$e.Effect=[Windows.Forms.DragDropEffects]::None}})
  $tree.add_DragDrop({param($sender,$e);try{$node=$tree.GetNodeAt($tree.PointToClient((New-Object Drawing.Point($e.X,$e.Y))));if(!$node-or$node.Tag-in@('all','unfiled','trash')){return};if($e.Data.GetDataPresent('PaperLanternIds')){Set-LibraryMembership $store ([string]$e.Data.GetData('PaperLanternIds')).Split(',') $node.Tag;$tree.SelectedNode=$node;Refresh-List}else{$tree.SelectedNode=$node;Import-Paths $e.Data.GetData([Windows.Forms.DataFormats]::FileDrop)}}catch{Report-Error $_}})
  $timer=New-Object Windows.Forms.Timer;$timer.Interval=700;$timer.add_Tick({Refresh-ConnectionState;if(!$CheckOnly -and (!$script:lastDiscovery -or ([DateTime]::UtcNow-$script:lastDiscovery).TotalSeconds -gt 15)){$script:lastDiscovery=[DateTime]::UtcNow;Connect-Extension};$index=Join-Path $DataRoot 'index.json';if(Test-Path -LiteralPath $index){$stamp=(Get-Item -LiteralPath $index).LastWriteTimeUtc.Ticks;if($stamp-ne$script:lastStamp){$script:lastStamp=$stamp;$script:store=Open-LibraryStore $DataRoot;Refresh-Tree}};$signal=Join-Path $DataRoot 'show-window';if(Test-Path -LiteralPath $signal){Remove-Item -LiteralPath $signal;$form.WindowState='Normal';$form.Show();$form.BringToFront();$form.Activate()}})
  Refresh-Tree
  if($CheckOnly){$form.Show();[Windows.Forms.Application]::DoEvents();
    if($CheckDialog){
      $dialogTimer=New-Object Windows.Forms.Timer;$dialogTimer.Interval=150
      $dialogTimer.add_Tick({foreach($window in [Windows.Forms.Application]::OpenForms){if($window.Text-eq'Input regression test'){$box=$window.Controls.Find('nameBox',$false)[0];if($box){$box.Text='Verified';$window.DialogResult='OK';break}}}})
      $dialogTimer.Start()
      try{$result=Ask-Text 'Input regression test' 'Preset';if($result-ne'Verified'){throw 'Input dialog regression failed'}}finally{$dialogTimer.Stop();$dialogTimer.Dispose()}
    }
if($ScreenshotPath){$bitmap=New-Object Drawing.Bitmap($form.Width,$form.Height);$form.DrawToBitmap($bitmap,(New-Object Drawing.Rectangle(0,0,$form.Width,$form.Height)));$bitmap.Save($ScreenshotPath);$bitmap.Dispose()};$form.Close()}
  else{$timer.Start();[Windows.Forms.Application]::Run($form)}
} catch { if($CheckOnly){throw};[Windows.Forms.MessageBox]::Show($_.Exception.Message,'Paper Lantern','OK','Error')|Out-Null }
finally{if($timer){$timer.Stop();$timer.Dispose()};if($form){$form.Dispose()};$mutex.ReleaseMutex();$mutex.Dispose()}
