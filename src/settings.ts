export const defaultPrompts = {
  translation: '영어 논문을 자연스럽고 정확한 한국어로 번역하세요. 전문 용어, 알고리즘과 방법 이름, 약어, 수학 기호는 원문의 영어 표기를 유지하세요. 수치와 논리 관계를 빠뜨리지 말고, 불필요한 설명을 덧붙이지 마세요.',
  question: '논문을 함께 읽는 연구 조교처럼 한국어로 답하세요. 전문 용어는 영어로 유지하고 핵심부터 명확하게 설명하세요. 논문에 있는 근거와 해석을 구분하고, 근거가 부족하면 솔직히 말하세요.',
};
export type Prompts = typeof defaultPrompts;
export const settingsKey = 'paper-lantern-preferences-v1';
export function readPrompts(): Prompts {
  try {
    const saved = JSON.parse(localStorage.getItem(settingsKey) || '{}');
    return Object.fromEntries(Object.entries(defaultPrompts).map(([key, fallback]) => [key, typeof saved[key] === 'string' && saved[key].length <= 8000 ? saved[key] : fallback])) as Prompts;
  } catch { return { ...defaultPrompts }; }
}
