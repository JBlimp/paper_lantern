import { useEffect, useRef, useState } from 'react';
import { defaultPrompts, type Prompts } from './settings';
import type { CodexModel } from './codex';

export function CodexSettings({ value, models, onSave, onClose }: { value: Prompts; models: CodexModel[]; onSave: (value: Prompts) => void; onClose: () => void }) {
  const [draft, setDraft] = useState({ ...value });
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog className="settings-dialog" ref={dialog} aria-labelledby="settings-title" onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose(); } }}>
    <form onSubmit={e => { e.preventDefault(); onSave(draft); }}>
      <header><h2 id="settings-title">Codex 설정</h2><button type="button" onClick={onClose} aria-label="설정 닫기">×</button></header>
      <p>저장한 프롬프트는 다음 번역 요청과 질문부터 적용됩니다.</p>
      <div className="model-preferences">{(['translation', 'question'] as const).map(kind => {
        const key = `${kind}Model` as const;
        return <label key={kind}>{kind === 'translation' ? '번역 기본 모델' : '질문 기본 모델'}<select value={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.value })}>
          <option value="">Codex 계정 기본값</option>
          {draft[key] && !models.some(m => m.id === draft[key]) && <option value={draft[key]}>{draft[key]} (목록 확인 필요)</option>}
          {models.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}
        </select></label>;
      })}</div>
      <label>번역 시스템 프롬프트<textarea value={draft.translation} maxLength={8000} onChange={e => setDraft({ ...draft, translation: e.target.value })}/></label>
      <label>질문 시스템 프롬프트<textarea value={draft.question} maxLength={8000} onChange={e => setDraft({ ...draft, question: e.target.value })}/></label>
      <footer><button type="button" onClick={() => setDraft({ ...defaultPrompts })}>기본값 복원</button><div><button type="button" onClick={onClose}>취소</button><button type="submit" className="primary">저장</button></div></footer>
    </form>
  </dialog>;
}
