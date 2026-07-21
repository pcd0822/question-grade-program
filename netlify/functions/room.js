// 모둠 공간: 상점 카탈로그 / 공간 상태 / 아이템 구매·이동·판매.
// 구매·이동·판매는 학생 인증 + 본인 모둠만. 조회는 공개(다른 모둠 구경 가능).
import {
  admin,
  json,
  parseBody,
  verifyStudent,
  sumSeedByStudent,
  isMissingFunction,
  pgErrorName,
} from '../lib/admin.js'
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

/** 공간 내 위치를 0~100(%) 범위로 정리. 값이 이상하면 기본값을 쓴다. */
function clampPct(value, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.round(Math.min(100, Math.max(0, n)) * 100) / 100
}

/**
 * 009 미적용 환경용 구매 폴백. 실패 사유 문자열을 반환하고, 성공하면 null.
 * 경합에 취약하므로(동시 구매 시 차감 유실) 마이그레이션을 꼭 실행할 것.
 */
async function buyFallback(groupId, itemType, price, x, y) {
  const { wallet } = await groupWallet(groupId)
  if (wallet < price) return `보유 새싹이 부족해요. (필요 ${price}, 보유 ${wallet})`

  const { data: g } = await admin.from('groups').select('spent_seeds').eq('id', groupId).maybeSingle()
  await admin.from('groups').update({ spent_seeds: (g?.spent_seeds || 0) + price }).eq('id', groupId)
  await admin.from('room_items').insert({ group_id: groupId, item_type: itemType, x, y })
  return null
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' })
  const body = parseBody(event)

  try {
    switch (body.action) {
      case 'catalog':
        return json(200, { shop: SHOP, cols: GRID_COLS, rows: GRID_ROWS })

      // 다른 모둠도 구경할 수 있지만, 모둠원 실명·아바타가 담기므로
      // 로그인한 학생에게만 준다(예전엔 무인증 공개라 group id 만 알면 명단이 새어나갔다).
      case 'state': {
        if (!body.groupId) return json(400, { error: 'groupId 누락' })
        const viewer = await verifyStudent(body.studentNo, body.code)
        if (!viewer) return json(401, { error: '학생 인증 실패' })
        return json(200, await roomState(body.groupId))
      }

      // 같은 모둠원이 동시에 사도 지갑 차감이 유실되지 않도록(공짜 아이템 방지)
      // 모둠 행을 잠근 채 [지갑 확인 → 빈 칸 찾기 → 배치 → 차감]을 한 트랜잭션으로 처리한다.
      case 'buy': {
        const me = await verifyStudent(body.studentNo, body.code)
        if (!me) return json(401, { error: '학생 인증 실패' })
        if (!me.group_id) return json(400, { error: '모둠에 배정된 후 이용할 수 있어요.' })
        const price = priceOf(body.itemType)
        if (price == null) return json(400, { error: '없는 아이템입니다.' })

        // 놓을 위치(공간 내 비율 0~100). 안 주면 바닥 가운데쯤에 놓인다.
        const bx = clampPct(body.x, 50)
        const by = clampPct(body.y, 72)

        const { error } = await admin.rpc('room_buy', {
          p_group: me.group_id,
          p_item: body.itemType,
          p_price: price,
          p_x: bx,
          p_y: by,
        })
        if (error) {
          if (isMissingFunction(error)) {
            const fb = await buyFallback(me.group_id, body.itemType, price, bx, by)
            if (fb) return json(400, { error: fb })
            return json(200, await roomState(me.group_id))
          }
          const name = pgErrorName(error)
          if (name.includes('insufficient_seeds')) {
            const { wallet } = await groupWallet(me.group_id)
            return json(400, { error: `보유 새싹이 부족해요. (필요 ${price}, 보유 ${wallet})` })
          }
          if (name.includes('room_full')) return json(400, { error: '공간이 가득 찼어요.' })
          if (name.includes('group_not_found')) return json(404, { error: '모둠을 찾을 수 없습니다.' })
          throw error
        }
        return json(200, await roomState(me.group_id))
      }

      case 'move': {
        const me = await verifyStudent(body.studentNo, body.code)
        if (!me) return json(401, { error: '학생 인증 실패' })
        const { data: item } = await admin.from('room_items').select('*').eq('id', body.itemId).maybeSingle()
        if (!item) return json(404, { error: '아이템을 찾을 수 없습니다.' })
        if (item.group_id !== me.group_id) return json(403, { error: '우리 모둠 공간만 꾸밀 수 있어요.' })
        // 자유 배치: 공간 내 비율(0~100). 겹쳐 놓는 것도 허용한다.
        const x = clampPct(body.x, item.x)
        const y = clampPct(body.y, item.y)
        const { error: mvErr } = await admin.from('room_items').update({ x, y }).eq('id', item.id)
        if (mvErr) {
          // 22P02 = 좌표 컬럼이 아직 integer (마이그레이션 009/010 미적용)
          if (mvErr.code === '22P02')
            return json(503, { error: '공간 꾸미기가 아직 준비되지 않았어요. (마이그레이션 010 필요)' })
          throw mvErr
        }
        return json(200, await roomState(me.group_id))
      }

      case 'remove': {
        const me = await verifyStudent(body.studentNo, body.code)
        if (!me) return json(401, { error: '학생 인증 실패' })
        const { data: item } = await admin.from('room_items').select('*').eq('id', body.itemId).maybeSingle()
        if (!item) return json(404, { error: '아이템을 찾을 수 없습니다.' })
        if (item.group_id !== me.group_id) return json(403, { error: '우리 모둠 공간만 꾸밀 수 있어요.' })

        // 판매 = 가격 환불(spent 감소). 구매와 같은 이유로 모둠 행을 잠그고 처리한다.
        const price = priceOf(item.item_type) || 0
        const { error } = await admin.rpc('room_sell', {
          p_group: me.group_id,
          p_item: item.id,
          p_price: price,
        })
        if (error) {
          if (isMissingFunction(error)) {
            const { data: g } = await admin.from('groups').select('spent_seeds').eq('id', me.group_id).maybeSingle()
            await admin
              .from('groups')
              .update({ spent_seeds: Math.max(0, (g?.spent_seeds || 0) - price) })
              .eq('id', me.group_id)
            await admin.from('room_items').delete().eq('id', item.id)
            return json(200, await roomState(me.group_id))
          }
          // 다른 모둠원이 먼저 팔았으면 조용히 현재 상태만 돌려준다.
          if (pgErrorName(error).includes('item_not_found')) return json(200, await roomState(me.group_id))
          throw error
        }
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
