# 설치용 패키지

[Paper Lantern v0.6.1 다운로드](https://github.com/JBlimp/paper_lantern/raw/refs/heads/main/releases/paper-lantern-0.6.1.zip)

ZIP을 압축 해제한 뒤 Chrome의 `chrome://extensions`에서 **압축해제된 확장 프로그램을 로드합니다**를 선택하세요. 로컬 PDF는 확장 세부정보에서 **파일 URL에 대한 액세스 허용**을 켠 뒤 `Ctrl+O`로 엽니다.

패키지는 빌드된 확장 파일, README, PDF.js 리소스, 의존성 라이선스와 Codex 연결 프로그램을 포함합니다. 개발 도구, 테스트 PDF, 브라우저 프로필은 포함하지 않습니다.

Codex 기능은 선택 사항입니다. Node.js와 Codex를 설치·로그인한 뒤 `companion/install.cmd`로 확장을 자동 등록하고, 시작 메뉴에서 Paper Lantern을 실행하면 리더가 연결됩니다. 기존 Chrome 로컬 번역은 연결 프로그램 없이 사용할 수 있습니다.

이전 버전 사용자는 확장 새로고침과 함께 `companion/install.cmd`도 다시 실행해야 자동 연결·공유 서버 기능을 사용할 수 있습니다.

v0.5.0은 논문 전체 Codex 번역, 선택 영역·그림 팝업 채팅, Markdown 답변, 로컬 논문 라이브러리, 트레이 관리, 확장 자동·수동 연결과 실시간 연결 상태 확인을 포함합니다.

v0.5.1은 모델 목록과 별도로 연결 상태를 확인하고, 이전 연결 프로그램은 업데이트가 필요하다고 표시합니다. 모델 목록을 새로 불러와도 진행 중인 질문·번역은 유지합니다.

v0.5.2는 재설치 시 이전 트레이와 연결 프로세스를 정리해 새 코드로 실행합니다. 트레이의 상태 보기에서 버전도 확인할 수 있습니다. 업데이트하면 진행 중인 Codex 요청은 중단됩니다.

v0.6.0은 PC 프로그램 하나로 라이브러리·트레이·Codex 서버 관리를 통합합니다. Chrome은 실행 중인 PC 프로그램에만 연결합니다. 0.5.x에서 업데이트할 때는 install.cmd를 다시 실행하고 시작 메뉴에서 Paper Lantern을 실행하세요.

`SHA256SUMS`에는 배포 ZIP의 SHA-256 체크섬이 있습니다. Windows PowerShell에서 다음 명령으로 확인할 수 있습니다.

```powershell
Get-FileHash -Algorithm SHA256 .\paper-lantern-0.6.1.zip
```

v0.6.1은 Codex 질문 답변을 생성 중에도 Markdown으로 표시합니다. 적용하려면 확장과 PC 연결 프로그램을 모두 업데이트하세요.
