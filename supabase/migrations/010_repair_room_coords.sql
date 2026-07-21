-- ═══════════════════════════════════════════════════════════════════
--  010 — 009 의 "모둠 공간 자유 배치" 부분 복구
--
--  009 를 실행했지만 group_chat 만 만들어지고 좌표 컬럼 변환·room_buy 교체는
--  적용되지 않은 상태가 확인됐다(중간에 어떤 문장에서 멈춘 것으로 보인다).
--  그래서 아이템을 옮길 때마다 소수 좌표를 정수 컬럼에 쓰려다 실패했다.
--      ERROR: invalid input syntax for type integer: "41.37"
--
--  이 파일은 **이미 적용된 부분은 건너뛴다.** 몇 번을 실행해도 안전하다.
--  (009 를 다시 돌릴 필요는 없다)
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. 한 칸에 하나 제약 해제 ───────────────────────────────────
drop index if exists public.uq_roomitems_cell;

-- ── 2. 좌표를 정수 격자 → 비율(0~100)로 (아직 정수일 때만) ─────
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'room_items'
       and column_name = 'x'
       and data_type = 'integer'
  ) then
    -- 기존 8열×5행 격자 기준으로 각 칸의 중심 위치로 환산한다
    alter table public.room_items
      alter column x type numeric(6,2) using round(((x + 0.5) * 100.0 / 8)::numeric, 2),
      alter column y type numeric(6,2) using round(((y + 0.5) * 100.0 / 5)::numeric, 2);
    raise notice '좌표 컬럼을 numeric 으로 변환했습니다.';
  else
    raise notice '좌표 컬럼은 이미 numeric 입니다. 건너뜁니다.';
  end if;
end
$$;

-- ── 3. 범위 제약 (없을 때만) ───────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'room_items_xy_range'
  ) then
    alter table public.room_items
      add constraint room_items_xy_range
      check (x >= 0 and x <= 100 and y >= 0 and y <= 100);
  end if;
end
$$;

create index if not exists idx_roomitems_group_y on public.room_items(group_id, y);

-- ── 4. 구매 함수: 격자 대신 지정 좌표에 놓는 버전으로 교체 ─────
drop function if exists public.room_buy(uuid, text, integer, integer, integer);
drop function if exists public.room_buy(uuid, text, integer, numeric, numeric);

create function public.room_buy(
  p_group uuid,
  p_item  text,
  p_price integer,
  p_x     numeric,
  p_y     numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_spent integer;
  v_cum   bigint;
begin
  select g.spent_seeds into v_spent
    from public.groups g where g.id = p_group
     for update;                                  -- ← 동시 구매 직렬화
  if not found then
    raise exception 'group_not_found';
  end if;

  select coalesce(sum(sl.amount), 0) into v_cum
    from public.seed_log sl
    join public.students s on s.id = sl.student_id
   where s.group_id = p_group;

  if v_cum - v_spent < p_price then
    raise exception 'insufficient_seeds';
  end if;

  insert into public.room_items(group_id, item_type, x, y)
  values (
    p_group,
    p_item,
    least(100, greatest(0, coalesce(p_x, 50))),
    least(100, greatest(0, coalesce(p_y, 72)))
  );

  update public.groups set spent_seeds = spent_seeds + p_price where id = p_group;
end
$$;

revoke all on function public.room_buy(uuid, text, integer, numeric, numeric)
  from public, anon, authenticated;
grant execute on function public.room_buy(uuid, text, integer, numeric, numeric)
  to service_role;
