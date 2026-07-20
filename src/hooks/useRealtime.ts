import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

/**
 * 주어진 테이블들의 변경을 구독하고, 변경이 있을 때 onChange 를 호출한다.
 * (짧게 디바운스해서 연속 변경 시 과도한 refetch 를 막는다)
 */
export function useRealtime(tables: string[], onChange: () => void) {
  const cbRef = useRef(onChange)
  cbRef.current = onChange
  const key = tables.join(',')

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const fire = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => cbRef.current(), 150)
    }

    const channel = supabase.channel(`rt:${key}`)
    for (const table of key.split(',')) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, fire)
    }
    channel.subscribe()

    return () => {
      if (timer) clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [key])
}
