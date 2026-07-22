// 수업 목록 정렬(최신순 / 오래된 순) 공용 로직.
export type SortOrder = 'newest' | 'oldest'

/** created_at 기준으로 정렬한 새 배열을 돌려준다(원본 불변). */
export function sortByCreated<T extends { created_at: string }>(items: T[], order: SortOrder): T[] {
  return [...items].sort((a, b) =>
    order === 'newest'
      ? b.created_at.localeCompare(a.created_at)
      : a.created_at.localeCompare(b.created_at),
  )
}
