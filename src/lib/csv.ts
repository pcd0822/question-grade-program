// CSV 생성·다운로드 공용 헬퍼.
// 엑셀(한글 Windows)에서 바로 열리도록 UTF-8 BOM + CRLF 로 만든다.

/** UTF-8 BOM. 없으면 엑셀에서 한글이 깨진다. */
const BOM = '﻿'

/** 셀 하나를 CSV 로 안전하게 감싼다(따옴표 이스케이프). */
function cell(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

/** 2차원 배열 → CSV 문자열 */
export function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(cell).join(',')).join('\r\n')
}

/** CSV 문자열을 파일로 내려받는다. */
export function downloadCsv(filename: string, rows: unknown[][]) {
  const blob = new Blob([BOM + toCsv(rows)], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** 파일명에 붙일 날짜 (YYYY-MM-DD, 로컬 기준) */
export function todayStamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 내역 표기용 일시 (YYYY-MM-DD HH:MM, 로컬 기준) */
export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
