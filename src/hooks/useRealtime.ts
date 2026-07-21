import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

// 한 번의 변경 알림에 모든 학생 기기가 "동시에" 다시 불러오면(30명 × 여러 쿼리)
// 순간적으로 요청이 몰려 느려지거나 실패한다. 그래서
//   ① 디바운스로 연속 변경을 한 번으로 합치고
//   ② 기기마다 무작위 지연(지터)을 더해 요청 시점을 흩뿌리고
//   ③ 화면이 안 보이는 동안에는 아예 다시 불러오지 않는다(다시 보일 때 한 번).
const DEBOUNCE_MS = 400
const JITTER_MS = 700

export function useRealtime(tables: string[], onChange: () => void) {
  const cbRef = useRef(onChange)
  // 렌더 중 ref 를 쓰면 동시성 모드에서 어긋날 수 있어 커밋 후에 갱신한다.
  useEffect(() => {
    cbRef.current = onChange
  })
  const key = tables.join(',')

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    let pendingWhileHidden = false

    const run = () => {
      timer = null
      if (document.visibilityState === 'hidden') {
        // 보이지 않는 탭은 지금 불러와도 의미가 없다. 돌아올 때 한 번만 불러온다.
        pendingWhileHidden = true
        return
      }
      cbRef.current()
    }

    const fire = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(run, DEBOUNCE_MS + Math.random() * JITTER_MS)
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible' && pendingWhileHidden) {
        pendingWhileHidden = false
        fire()
      }
    }
    document.addEventListener('visibilitychange', onVisible)

    // 채널 이름이 겹치면 한쪽 구독이 무시될 수 있어 고유 번호를 붙인다.
    const channel = supabase.channel(`rt:${key}:${nextChannelId()}`)
    for (const table of key.split(',')) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, fire)
    }
    channel.subscribe()

    return () => {
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      supabase.removeChannel(channel)
    }
  }, [key])
}

let channelSeq = 0
function nextChannelId() {
  channelSeq += 1
  return channelSeq
}
