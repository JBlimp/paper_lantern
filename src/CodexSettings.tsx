import { ExtensionId } from './ExtensionId';
import { useEffect, useRef, useState } from 'react';
import { defaultPrompts, type Prompts } from './settings';
import type { CodexModel } from './codex';

export function CodexSettings({
  value,
  models,
  connected,
  connecting,
  connectionError,
  onConnect,
  onSave,
  onClose,
}: {
  value: Prompts;
  models: CodexModel[];
  connected: boolean;
  connecting: boolean;
  connectionError: string;
  onConnect: () => void;
  onSave: (value: Prompts) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState({ ...value });
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      className="settings-dialog"
      ref={dialog}
      aria-labelledby="settings-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
            onClose();
        }
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(draft);
        }}
      >
        <header>
          <h2 id="settings-title">Codex 설정</h2>
          <button type="button" onClick={onClose} aria-label="설정 닫기">
            ×
          </button>
        </header>
        <p>저장한 프롬프트는 다음 번역 요청과 질문부터 적용됩니다.</p>
        <section className="connection-status" aria-live="polite">
          <div>
            <strong>
              {connecting
                ? 'Codex 연결 확인 중…'
                : connected
                  ? `연결됨 · 모델 ${models.length}개`
                  : 'Codex 연결 안 됨'}
            </strong>
            <button type="button" disabled={connecting} onClick={onConnect}>
              {connecting ? '불러오는 중…' : '모델 목록 다시 불러오기'}
            </button>
          </div>
          {!connected && (
            <p>{connectionError || 'PC 연결 프로그램을 실행한 뒤 모델 목록을 불러와 주세요.'}</p>
          )}
          <ExtensionId />
          {!connected && (
            <small>
              로컬 프로그램을 실행하면 확장을 자동으로 찾아 연결합니다. 트레이에서 종료했다면 Paper Lantern을
              다시 실행하세요.
            </small>
          )}
        </section>
        <div className="model-preferences">
          {(['translation', 'question'] as const).map((kind) => {
            const key = `${kind}Model` as const;
            return (
              <label key={kind}>
                {kind === 'translation' ? '번역 기본 모델' : '질문 기본 모델'}
                <select value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}>
                  <option value="">
                    {models.find((m) => m.isDefault)
                      ? `Codex 계정 기본값 (${models.find((m) => m.isDefault)!.name})`
                      : 'Codex 계정 기본값 (연결 후 확인)'}
                  </option>
                  {draft[key] && !models.some((m) => m.id === draft[key]) && (
                    <option value={draft[key]}>{draft[key]} (목록 확인 필요)</option>
                  )}
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
        </div>
        <label>
          번역 시스템 프롬프트
          <textarea
            value={draft.translation}
            maxLength={8000}
            onChange={(e) => setDraft({ ...draft, translation: e.target.value })}
          />
        </label>
        <label>
          질문 시스템 프롬프트
          <textarea
            value={draft.question}
            maxLength={8000}
            onChange={(e) => setDraft({ ...draft, question: e.target.value })}
          />
        </label>
        <footer>
          <button type="button" onClick={() => setDraft({ ...defaultPrompts })}>
            기본값 복원
          </button>
          <div>
            <button type="button" onClick={onClose}>
              취소
            </button>
            <button type="submit" className="primary">
              저장
            </button>
          </div>
        </footer>
      </form>
    </dialog>
  );
}
