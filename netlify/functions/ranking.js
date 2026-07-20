// 학생용 모둠 랭킹(공개): 모둠명 + 누적/보유 새싹 + 순위 + 학급 전체 합계.
// 개인 이름은 노출하지 않는다(모둠 단위 집계만).
import { admin, json, sumSeedByStudent } from '../lib/admin.js'

export async function handler(event) {
  if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET')
    return json(405, { error: 'Method Not Allowed' })
  try {
    const [{ data: groups }, { data: students }, totals] = await Promise.all([
      admin.from('groups').select('id, name, spent_seeds').order('created_at'),
      admin.from('students').select('id, group_id'),
      sumSeedByStudent(),
    ])

    const byGroup = new Map()
    for (const s of students || []) {
      if (!s.group_id) continue
      byGroup.set(s.group_id, (byGroup.get(s.group_id) || 0) + (totals.get(s.id) || 0))
    }

    const ranking = (groups || [])
      .map((g) => {
        const cumulative = byGroup.get(g.id) || 0
        return { id: g.id, name: g.name, cumulative_seeds: cumulative, wallet: cumulative - (g.spent_seeds || 0) }
      })
      .sort((a, b) => b.cumulative_seeds - a.cumulative_seeds)

    let classTotal = 0
    for (const v of totals.values()) classTotal += v

    return json(200, { ranking, classTotal })
  } catch (e) {
    console.error('[ranking]', e)
    return json(500, { error: '서버 오류가 발생했습니다.' })
  }
}
