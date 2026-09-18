export type LocalTranslator = { translate(text: string, options?: { signal?: AbortSignal }): Promise<string>; destroy(): void };
type TranslatorFactory = {
  availability(options: { sourceLanguage: string; targetLanguage: string }): Promise<string>;
  create(options: { sourceLanguage: string; targetLanguage: string; monitor(monitor: EventTarget): void }): Promise<LocalTranslator>;
};
declare global { interface Window { Translator?: TranslatorFactory } }
export const languages = { sourceLanguage: 'en', targetLanguage: 'ko' };
export async function availability() {
  if (!window.Translator) return 'missing';
  return window.Translator.availability(languages);
}
export function createTranslator(progress: (percent: number) => void) {
  if (!window.Translator) throw new Error('이 Chrome 환경에서 Translator API를 사용할 수 없습니다. 최신 데스크톱 Chrome에서 열어 주세요.');
  return window.Translator.create({ ...languages, monitor(m) {
    m.addEventListener('downloadprogress', event => progress(Math.round((event as Event & { loaded: number }).loaded * 100)));
  } });
}
export function errorMessage(error: unknown) {
  if (error instanceof Error) {
    if (error.name === 'NotSupportedError') return '이 기기 또는 Chrome 설정에서 영한 번역 모델을 지원하지 않습니다. Chrome 업데이트와 조직 정책을 확인해 주세요.';
    if (error.name === 'NotAllowedError') return 'Chrome이 자동 모델 시작을 허용하지 않았습니다. 번역 이어서 버튼을 눌러 주세요. 계속 실패하면 Chrome 설정·조직 정책을 확인해 주세요.';
    if (error.name === 'QuotaExceededError') return '입력이 번역 모델의 처리 한도를 넘었습니다. 다른 페이지나 읽기 순서를 선택해 주세요.';
    if (error.name === 'PasswordException') return '암호로 보호된 PDF입니다. 암호가 해제된 파일을 열어 주세요.';
    return error.message;
  }
  return String(error);
}
