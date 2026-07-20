// 모둠 공간: 상점 카탈로그 / 공간 상태 / 아이템 구매·이동·판매.
// 구매·이동·판매는 학생 인증 + 본인 모둠만. 조회는 공개(다른 모둠 구경 가능).
import { admin, json, parseBody, verifyStudent, sumSeedByStudent } from '../lib/admin.js'
import { SHOP, GRID_COLS, GRID_ROWS, priceOf } from '../lib/shop.js'

async function groupWallet(groupId) {
  const [{ data: members }, { data: group }, totals] = await Promise.all([
    admin.from('students').select('id, name, avatar_url').eq('group_id', groupId),
    admin.from('groups').select('id, name, spent_seeds').eq('id', groupId).maybeSingle(),
    sumSeedByStudent(),
  ])
  const cumulative = (members || []).reduce((s, m) => s + (totals.get(m.id) || 0), 0)
  const spent = group?.spent_seeds || 0
  return { group, members: members || [], cumulative, spent, wallet: cumulative - spent }
}

async function roomState(groupId) {
  const { group, members, cumulative, wallet } = await groupWallet(groupId)
  const { data: items } = await admin
    .from('room_items')
    .select('*')
    .eq('group_id', groupId)
    .order('created_at')
  // 모둠 배지 전시
  const memberIds = members.map((m) => m.id)
  let badges = []
  if (memberIds.length) {
    const { data: sb } = await admin
      .from('student_badges')
      .select('student_id, badges(id, name, image_url)')
      .in('student_id', memberIds)
    const nameOf = new Map(members.map((m) => [m.id, m.name]))
    badges = (sb || [])
      .filter((r) => r.badges)
      .map((r) => ({ ...r.badges, student_name: nameOf.get(r.student_id) || '' }))
  }
  return {
    group: group ? { id: group.id, name: group.name } : null,
    cumulative,
    wallet,
    items: items || [],
    members,
    badges,
  }
}

function firstFreeCell(items) {
  const taken = new Set(items.map((i) => `${i.x},${i.y}`))
  for (let y = 0; y < GRID_ROWS; y++)
    for (let x = 0; x < GRID_COLS; x++) if (!taken.has(`${x},${y}`)) return { x, y }
  return null
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' })
  const body = parseBody(event)

  try {
    switch (body.action) {
      case 'catalog':
        return json(200, { shop: SHOP, cols: GRID_COLS, rows: GRID_ROWS })

      case 'state': {
        if (!body.groupId) return json(400, { error: 'groupId 누락' })
        return json(200, await roomState(body.groupId))
      }

      case 'buy': {
        const me = await verifyStudent(body.studentNo, body.code)
        if (!me) return json(401, { error: '학생 인증 실패' })
        if (!me.group_id) return json(400, { error: '모둠에 배정된 후 이용할 수 있어요.' })
        const price = priceOf(body.itemType)
        if (price == null) return json(400, { error: '없는 아이템입니다.' })

        const { wallet } = await groupWallet(me.group_id)
        if (wallet < price) return json(400, { error: `보유 새싹이 부족해요. (필요 ${price}, 보유 ${wallet})` })

        const { data: items } = await admin.from('room_items').select('x, y').eq('group_id', me.group_id)
        const cell = firstFreeCell(items || [])
        if (!cell) return json(400, { error: '공간이 가득 찼어요.' })

        // 지갑 차감 = spent 증가
        const { data: g } = await admin.from('groups').select('spent_seeds').eq('id', me.group_id).maybeSingle()
        await admin.from('groups').update({ spent_seeds: (g?.spent_seeds || 0) + price }).eq('id', me.group_id)
        await admin.from('room_items').insert({ group_id: me.group_id, item_type: body.itemType, x: cell.x, y: cell.y })
        return json(200, await roomState(me.group_id))
      }

      case 'move': {
        const me = await verifyStudent(body.studentNo, body.code)
        if (!me) return json(401, { error: '학생 인증 실패' })
        const { data: item } = await admin.from('room_items').select('*').eq('id', body.itemId).maybeSingle()
        if (!item) return json(404, { error: '아이템을 찾을 수 없습니다.' })
        if (item.group_id !== me.group_id) return json(403, { error: '우리 모둠 공간만 꾸밀 수 있어요.' })
        const x = Math.max(0, Math.min(GRID_COLS - 1, +body.x))
        const y = Math.max(0, Math.min(GRID_ROWS - 1, +body.y))
        // 이미 다른 아이템이 있는 칸이면 무시
        const { data: occ } = await admin
          .from('room_items')
          .select('id')
          .eq('group_id', me.group_id)
          .eq('x', x)
          .eq('y', y)
          .neq('id', item.id)
          .maybeSingle()
        if (occ) return json(400, { error: '이미 아이템이 있는 칸이에요.' })
        await admin.from('room_items').update({ x, y }).eq('id', item.id)
        return json(200, await roomState(me.group_id))
      }

      case 'remove': {
        const me = await verifyStudent(body.studentNo, body.code)
        if (!me) return json(401, { error: '학생 인증 실패' })
        const { data: item } = await admin.from('room_items').select('*').eq('id', body.itemId).maybeSingle()
        if (!item) return json(404, { error: '아이템을 찾을 수 없습니다.' })
        if (item.group_id !== me.group_id) return json(403, { error: '우리 모둠 공간만 꾸밀 수 있어요.' })
        // 판매 = 가격 환불(spent 감소)
        const price = priceOf(item.item_type) || 0
        const { data: g } = await admin.from('groups').select('spent_seeds').eq('id', me.group_id).maybeSingle()
        await admin.from('groups').update({ spent_seeds: Math.max(0, (g?.spent_seeds || 0) - price) }).eq('id', me.group_id)
        await admin.from('room_items').delete().eq('id', item.id)
        return json(200, await roomState(me.group_id))
      }

      default:
        return json(400, { error: '알 수 없는 action' })
    }
  } catch (e) {
    console.error('[room]', e)
    return json(500, { error: '서버 오류가 발생했습니다.' })
  }
}
