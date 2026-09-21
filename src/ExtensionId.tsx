import { useState } from 'react';
export function ExtensionId() {
  const id = globalThis.chrome?.runtime?.id;
  const [status, setStatus] = useState('');
  async function copy() {
    if (!id) return;
    // PDF readers run in an iframe where Clipboard API policy may be restricted.
    // Copy synchronously during the click, with the permission-backed API as fallback.
    const previous = document.activeElement as HTMLElement | null;
    const field = document.createElement('textarea');
    field.value = id;
    field.setAttribute('readonly', '');
    field.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0';
    (previous?.closest('dialog') || document.body).appendChild(field);
    let copied = false;
    try {
      field.focus();
      field.select();
      copied = document.execCommand('copy');
    } catch {
    } finally {
      field.remove();
      previous?.focus();
    }
    if (copied) {
      setStatus('복사됨');
      return;
    }
    try {
      await navigator.clipboard.writeText(id);
      setStatus('복사됨');
    } catch {
      setStatus('복사하지 못했습니다. ID를 선택해 복사해 주세요.');
    }
  }
  return (
    <div className="extension-id">
      <span>확장 ID</span>
      <code>{id || '확장 프로그램에서 열어 주세요'}</code>
      <button type="button" disabled={!id} onClick={() => void copy()} aria-label="확장 ID 복사">
        복사
      </button>
      <span role="status">{status}</span>
    </div>
  );
}
