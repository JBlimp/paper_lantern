# Paper Lantern PC 프로그램 (Windows)

라이브러리 창과 트레이는 하나의 프로그램입니다. 이 프로그램이 로컬 서비스와 Codex app-server의 수명을 관리합니다.

## 설치와 실행

1. Node.js 22.17 이상과 Codex를 설치하고 ChatGPT 계정으로 로그인합니다.
2. Chrome에 Paper Lantern 확장을 로드합니다.
3. `install.cmd`를 실행합니다. 확장 ID는 자동 탐지하며 관리자 권한은 필요하지 않습니다.
4. 시작 메뉴의 **Paper Lantern** 또는 `start.vbs`를 실행합니다.

확장 ID 자동 등록이 어려우면 PC 프로그램의 **수동 연결**에 ID를 붙여넣습니다. 이 버튼은 연결 등록만 변경하며 PC 프로그램을 재설치하거나 재시작하지 않습니다. Codex 실행 경로를 지정하려면 다음 명령을 사용할 수 있습니다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -ExtensionId "확장프로그램ID" -CodexPath "C:\경로\codex.exe"
```

## 시작과 종료

- 라이브러리 창의 X는 창을 트레이로 숨깁니다.
- 트레이의 **라이브러리 열기** 또는 더블클릭으로 같은 창을 다시 엽니다.
- **Paper Lantern 종료**는 서비스와 Codex까지 종료합니다.
- **Codex 연결 다시 시작**은 PC 프로그램이 소유한 서비스만 다시 시작합니다.
- Chrome은 PC 프로그램을 자동으로 실행하지 않습니다. PC 프로그램이 꺼져 있으면 확장에 실행 안내를 표시합니다.
- Windows 자동 시작은 등록하지 않습니다.

## 내부 구조

```text
Paper Lantern (라이브러리 창 + 트레이)
  └─ 소유 서비스 (app-service.mjs)
       └─ Codex app-server (요청이 들어오면 시작)

Chrome 확장 → Native Messaging 중계 (host.mjs) → 실행 중인 PC 서비스
```

중계는 Windows named pipe로 전달만 합니다. PC 프로그램이나 Codex를 시작할 권한·로직이 없으며, 모든 Chrome 프로필은 같은 서비스를 공유합니다. 서비스는 PC 프로그램이 소유한 표준입력 파이프가 닫히면 종료합니다. 상태 파일은 화면 표시용이고 시작·종료를 제어하지 않습니다. 로컬 HTTP 서버나 포트를 열지 않습니다.

프로그램은 `%LOCALAPPDATA%\PaperLantern\companion`, 보관한 PDF와 분류는 `library`, 진단 상태는 `runtime`에 있습니다. 기존 PDF·분류·확장의 번역 및 대화 기록은 업데이트 시 유지합니다.

Codex 번역·질문은 로그인한 계정의 온라인 모델을 이용합니다. Chrome 번역은 로컬에서 실행됩니다. 질문에는 논문 전체 텍스트, 그림 질문에는 선택 이미지도 함께 전달합니다. 문서 전체 OCR은 지원하지 않습니다.

## 업데이트

새 패키지의 `install.cmd`를 실행한 뒤 확장과 PDF 탭을 새로고침합니다. 설치 프로그램이 이전 PC 프로그램과 연결 프로세스를 정리하므로 진행 중인 작업을 끝낸 뒤 실행하세요. 연결 등록만 변경하려면 PC 프로그램의 자동·수동 연결 버튼을 사용합니다.

`상태 보기`에서 실행 버전과 설치 경로를 확인할 수 있습니다. 설치 등록 제거는 다음 명령으로 수행합니다.

```powershell
Remove-Item -LiteralPath 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.paperlantern.codex'
```
