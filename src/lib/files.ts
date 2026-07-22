// 임의 파일을 base64 dataURL 로 읽는다 (수업 자료 업로드용).
// 서버(netlify/functions/lessons.js)가 base64 를 디코드해 Storage 에 올린다.

// 함수 요청 본문(base64 포함 ~6MB) 제한에 맞춘 이진 파일 상한. 서버와 같은 값.
export const MAX_FILE_BYTES = 4 * 1024 * 1024

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'))
    reader.onload = () => resolve(reader.result as string)
    reader.readAsDataURL(file)
  })
}

/** 사람이 읽기 좋은 파일 크기 (예: 1.2MB) */
export function formatBytes(bytes: number): string {
  if (!bytes) return '0B'
  const kb = bytes / 1024
  if (kb < 1024) return `${Math.round(kb)}KB`
  return `${(kb / 1024).toFixed(1)}MB`
}
