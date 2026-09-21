# Codex 연결 프로그램 (Windows)

1. Node.js 22.17 이상과 Codex를 설치합니다. Codex 앱 또는 CLI에서 ChatGPT 계정으로 로그인합니다. API 키는 필요하지 않습니다.
2. Chrome의 `chrome://extensions`에서 Paper Lantern의 **ID**를 복사합니다.
3. `install.cmd`를 실행하고 ID를 붙여넣습니다. 관리자 권한은 필요하지 않습니다.
4. Paper Lantern에서 **Codex 질문 → Codex 연결**을 누릅니다.

Codex 실행 파일을 찾지 못하면 PowerShell에서 경로를 지정할 수 있습니다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -ExtensionId "확장프로그램ID" -CodexPath "C:\경로\codex.exe"
```

확장 ID가 바뀌거나 Codex 앱 업데이트 후 실행 파일 경로가 바뀌면 설치를 다시 실행하세요. 파일은 `%LOCALAPPDATA%\PaperLantern\companion`에 복사되고, 현재 사용자 Chrome Native Messaging 호스트로 등록됩니다. Chrome이 연결할 때만 실행되며, 별도 HTTP 서버나 포트를 열지 않습니다.

Codex 번역과 질문은 Codex 계정의 온라인 모델과 사용량을 이용합니다. Chrome 번역은 기존처럼 로컬에서 실행됩니다. Paper Lantern은 번역·대화를 파일이나 브라우저 저장소에 보관하지 않으며, Codex 요청은 ephemeral thread로 처리합니다. Codex의 로그인 정보는 Codex가 관리합니다.

질문에는 추출한 텍스트와 캡션을 사용합니다. 그림 이미지 자체와 OCR은 아직 지원하지 않습니다. 긴 논문은 질문과 관련된 본문 일부를 골라 전달하므로 답변의 페이지 근거를 함께 확인하세요.

연결은 탭별로 실행됩니다. 질문 패널의 **연결 해제** 버튼이나 PDF 탭 종료 시 해당 연결 프로그램과 app-server를 종료합니다. 패널만 닫으면 연결은 유지됩니다. 시스템 프롬프트는 설정 화면에서 편집하며, 다음 요청의 Codex developer instructions로 전달합니다. 설치 등록을 제거하려면 다음 명령을 실행합니다. 설치 파일은 필요하면 위 폴더에서 직접 삭제할 수 있습니다.

```powershell
Remove-Item -LiteralPath 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.paperlantern.codex'
```
