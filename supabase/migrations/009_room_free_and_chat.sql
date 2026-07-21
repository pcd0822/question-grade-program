-- ═══════════════════════════════════════════════════════════════════
--  009 — 모둠 공간 자유 배치(3D) + 모둠 채팅
--
--  1) 아이템을 8×5 격자 칸이 아니라 바닥 위 아무 곳에나 놓을 수 있게 한다.
--     좌표를 "격자 인덱스(정수)" → "공간 내 비율(0~100, 소수 둘째 자리)"로 바꾼다.
--     기존 아이템은 격자 중심 좌표로 환산해 그대로 보이게 한다.
--  2) 모둠원끼리 대화할 수 있는 group_chat 테이블을 만든다.
--     댓글과 같은 방식으로 이름·아바타를 비정규화 저장한다
--     (students 는 anon 차단이라 조인할 수 없기 때문).
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. 아이템 자유 배치 ─────────────────────────────────────────
-- 한 칸에 하나 제약 해제 (이제 원하는 곳에 겹쳐 놓을 수 있다)
drop index if exists public.uq_roomitems_cell;

-- 정수 격자 → 비율(%) 변환. 기존 8열×5행 기준 각 칸의 중심으로 옮긴다.
alter table public.room_items
  alter column x type numeric(6,2) using round(((x + 0.5) * 100.0 / 8)::numeric, 2),
  alter column y type numeric(6,2) using round(((y + 0.5) * 100.0 / 5)::numeric, 2);

-- 바닥 밖으로 나가지 않도록
alter table public.room_items
  add constraint room_items_xy_range
  check (x >= 0 and x <= 100 and y >= 0 and y <= 100);

-- 겹쳐 놓을 때 나중에 놓은 것이 앞에 오도록 정렬용
create index if not exists idx_roomitems_group_y on public.room_items(group_id, y);

-- ── 2. 구매 함수 교체: 격자 대신 지정 좌표에 놓는다 ────────────
drop function if exists public.room_buy(uuid, text, integer, integer, integer);

create or replace function public.room_buy(
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
    least(100, greatest(0, coalesce(p_y, 70)))
  );

  update public.groups set spent_seeds = spent_seeds + p_price where id = p_group;
end
$$;

revoke all on function public.room_buy(uuid, text, integer, numeric, numeric)
  from public, anon, authenticated;
grant execute on function public.room_buy(uuid, text, integer, numeric, numeric)
  to service_role;

-- ── 3. 모둠 채팅 ────────────────────────────────────────────────
create table if not exists public.group_chat (
  id                uuid primary key default gen_random_uuid(),
  group_id          uuid not null references public.groups(id) on delete cascade,
  student_id        uuid references public.students(id) on delete set null,
  -- 댓글과 같은 이유로 비정규화 저장(anon 은 students 를 못 읽는다)
  author_name       text not null,
  author_avatar_url text,
  text              text not null,
  created_at        timestamptz not null default now()
);

create index if not exists idx_groupchat_group on public.group_chat(group_id, created_at);

alter table public.group_chat enable row level security;

-- 학생 화면이 직접 읽고 Realtime 으로 구독한다(쓰기는 서버 함수만).
drop policy if exists "anon read group_chat" on public.group_chat;
create policy "anon read group_chat" on public.group_chat for select to anon using (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'group_chat'
  ) then
    alter publication supabase_realtime add table public.group_chat;
  end if;
end
$$;
