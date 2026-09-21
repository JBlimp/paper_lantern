export type ChatMessage = { role: 'user' | 'assistant'; text: string; pages?: number[] };
export type SavedSession = {
  id: string; name: string; updatedAt: number; schema: 1;
  provider: string; mode: 'auto' | 'single' | 'double'; page: number;
  translations: Record<string, string>; completedPages: number;
  messages: ChatMessage[]; translationOpen: boolean; chatOpen: boolean;
};
const databaseName = 'paper-lantern-sessions';
let opening: Promise<IDBDatabase> | null = null;
function database() {
  if (!opening) opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('sessions', { keyPath: 'id' });
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('다른 리더 탭을 닫고 다시 시도해 주세요.'));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); opening = null; };
      resolve(db);
    };
  }).catch(error => { opening = null; throw error; });
  return opening;
}
export async function fileIdentity(data: ArrayBuffer) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function loadSession(id: string): Promise<SavedSession | null> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction('sessions').objectStore('sessions').get(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const session = request.result as SavedSession | undefined;
      if (!session || session.schema !== 1 || !['chrome', 'codex'].includes(session.provider) || !['auto', 'single', 'double'].includes(session.mode) || !session.translations || !Array.isArray(session.messages)) { resolve(null); return; }
      resolve(session);
    };
  });
}
export async function saveSession(session: SavedSession) {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('sessions', 'readwrite');
    tx.objectStore('sessions').put(session);
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
}
