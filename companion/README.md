# Codex 연결 프로그램 (Windows)

1. Node.js 22.17 이상과 Codex를 설치합니다. Codex 앱 또는 CLI에서 ChatGPT 계정으로 로그인합니다. API 키는 필요하지 않습니다.
2. Chrome에 Paper Lantern 확장을 로드합니다.
3. `install.cmd`를 실행합니다. 확장 ID를 자동으로 찾아 등록합니다. 관리자 권한은 필요하지 않습니다.
4. Paper Lantern을 열면 자동으로 연결됩니다. **설정**에서 번역·질문 모델과 프롬프트를 각각 지정할 수 있습니다.

Codex 실행 파일을 찾지 못하면 PowerShell에서 경로를 지정할 수 있습니다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -ExtensionId "확장프로그램ID" -CodexPath "C:\경로\codex.exe"
```

확장 ID가 바뀌거나 Codex 앱 업데이트 후 실행 파일 경로가 바뀌면 설치를 다시 실행하세요. 파일은 `%LOCALAPPDATA%\PaperLantern\companion`에 복사되고, 현재 사용자 Chrome Native Messaging 호스트로 등록됩니다. Chrome이 연결할 때만 실행되며, 별도 HTTP 서버나 포트를 열지 않습니다.

Codex 번역과 질문은 Codex 계정의 온라인 모델과 사용량을 이용합니다. Chrome 번역은 기존처럼 로컬에서 실행됩니다. Paper Lantern은 이어 읽기를 위해 번역·대화를 확장 프로그램의 IndexedDB에 저장하며, Codex 요청은 ephemeral thread로 처리합니다. Codex의 로그인 정보는 Codex가 관리합니다.

질문에는 논문 전체 텍스트와 캡션을 전달합니다. 이미지 설명으로 영역을 선택한 대화에는 선택 영역의 JPEG 이미지도 함께 전달합니다. 문서 전체의 OCR은 지원하지 않습니다. 입력 한도를 넘으면 자동 발췌 대신 오류를 표시합니다.

하나의 Chrome 프로필에서 연결 프로그램과 app-server 하나를 모든 PDF 탭이 공유합니다. 탭의 **연결 해제**는 해당 탭의 요청만 중단합니다. 마지막 PDF 탭을 닫아도 서버를 유지하며, Chrome 종료 또는 확장 새로고침 시 종료됩니다. 이전 버전에서 업데이트할 때는 install.cmd도 다시 실행하세요. 시스템 프롬프트는 설정 화면에서 편집하며, 다음 요청의 Codex developer instructions로 전달합니다. 설치 등록을 제거하려면 다음 명령을 실행합니다. 설치 파일은 필요하면 위 폴더에서 직접 삭제할 수 있습니다.

```powershell
Remove-Item -LiteralPath 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.paperlantern.codex'
```

## 트레이에서 관리

설치 후 시작 메뉴의 **Paper Lantern** 또는 `start.vbs`를 실행하면 트레이에 아이콘이 표시됩니다. Chrome 연결 시에도 트레이를 시작합니다. 아이콘을 더블클릭하거나 우클릭 메뉴의 **라이브러리 열기**를 누르면 라이브러리를 엽니다. 우클릭 메뉴에는 상태 보기·서버 재시작·연결 프로그램 종료도 있습니다. 서버는 PDF 탭의 연결 요청이 들어올 때 시작합니다.

종료는 Paper Lantern 서버에만 적용됩니다. 종료 후에는 프로그램을 다시 실행해야 새 연결을 허용합니다. 재시작 또는 재실행 후 리더는 자동으로 재연결합니다. **모델 목록 다시 불러오기**로 즉시 연결할 수도 있습니다. 라이브러리 창의 X는 창만 닫으며 연결을 종료하지 않습니다. Windows 자동 시작은 등록하지 않습니다.

실행 상태 파일에는 PID, 연결 상태, 모델 수, 처리 중 요청 수만 기록하며 논문 내용이나 로그인 정보는 기록하지 않습니다.

라이브러리의 **확장 자동 연결**로 등록을 다시 확인하거나 **수동 연결**에 확장 ID를 입력할 수 있습니다. 리더는 연결 중에도 5초 간격으로 상태를 확인하고 10초 응답 제한을 적용합니다.

재설치 시 파일 교체 후 해당 설치본의 기존 트레이·연결 프로세스를 정리합니다. 실행 중이던 트레이는 새 버전으로 다시 열고, 종료해 둔 상태는 유지합니다. 진행 중인 Codex 요청은 중단되므로 작업이 끝난 뒤 업데이트하세요. 다른 Codex 앱 프로세스는 종료하지 않습니다.
