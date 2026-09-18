// Migration only: never open, read, or write the former translation database.
export function removeLegacyCache(report: (message: string) => void) {
  const request = indexedDB.deleteDatabase('paper-lantern');
  request.onblocked = () => report('이전 버전의 리더 탭을 닫으면 기존에 저장된 번역 데이터가 삭제됩니다.');
  request.onerror = () => report('이전 버전의 번역 데이터 삭제에 실패했습니다. Chrome의 확장 프로그램 사이트 데이터를 확인해 주세요.');
}
