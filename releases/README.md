# 설치용 패키지

[Paper Lantern v0.3.0 다운로드](https://github.com/JBlimp/paper_lantern/raw/refs/heads/main/releases/paper-lantern-0.3.0.zip)

ZIP을 압축 해제한 뒤 Chrome의 `chrome://extensions`에서 **압축해제된 확장 프로그램을 로드합니다**를 선택하세요. 로컬 PDF는 확장 세부정보에서 **파일 URL에 대한 액세스 허용**을 켠 뒤 `Ctrl+O`로 엽니다.

패키지는 빌드된 확장 파일, README, PDF.js 리소스, 의존성 라이선스와 Codex 연결 프로그램을 포함합니다. 개발 도구, 테스트 PDF, 브라우저 프로필은 포함하지 않습니다.

Codex 기능은 선택 사항입니다. Node.js와 Codex를 설치·로그인한 뒤 `companion/install.cmd`에 자신의 확장 ID를 등록하고, 리더에서 **Codex 연결**을 누르세요. 기존 Chrome 로컬 번역은 연결 프로그램 없이 사용할 수 있습니다.

v0.2.0 사용자는 확장 새로고침과 함께 `companion/install.cmd`도 다시 실행해야 시스템 프롬프트 설정을 사용할 수 있습니다.

`SHA256SUMS`에는 배포 ZIP의 SHA-256 체크섬이 있습니다. Windows PowerShell에서 다음 명령으로 확인할 수 있습니다.

```powershell
Get-FileHash -Algorithm SHA256 .\paper-lantern-0.3.0.zip
```
