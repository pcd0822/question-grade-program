-- ═══════════════════════════════════════════════════════════════════
--  006 — 동시 접속(학급 30명) 안정화
--  Supabase 대시보드 → SQL Editor 에서 한 번 실행.
--
--  [문제] 지금까지의 쓰기는 전부 "읽고 → 계산하고 → 쓰기"를 애플리케이션에서
--  나눠 했다. 한 명씩 쓸 때는 문제가 없지만, 학생 30명이 동시에 하트를 누르고
--  댓글을 달고 지우면 아래가 실제로 깨진다.
--
--   ① setSeed: (삭제 → 삽입) 사이에 다른 요청이 끼어들면 같은 (source, ref_id)
--      로그가 두 줄 생겨 새싹이 두 배로 쌓인다.
--   ② toggle-heart: 하트 수를 센 뒤 보너스를 쓰는데, 그 사이 다른 학생이 하트를
--      눌러도 앞선 요청이 옛날 숫자로 덮어쓴다. 동시 삽입 시 unique 위반 500도 난다.
--   ③ room buy/sell: spent_seeds 를 읽어서 더한 값을 쓰므로 같은 모둠원이 동시에
--      사면 차감 하나가 통째로 사라진다(공짜 아이템).
--   ④ 한 칸에 아이템 두 개가 겹칠 수 있다.
--
--  [해결] 경합이 일어나는 단위(질문 행 / 모둠 행)를 DB에서 잠그고 한 트랜잭션
--  안에서 처리하는 함수로 옮긴다. 여기에 더해 유니크 제약으로 "애초에 불가능"하게 만든다.
-- ═══════════════════════════════════════════════════════════════════

-- ── 0. 기존 중복 데이터 정리 (유니크 인덱스를 걸기 전에) ────────
-- 같은 (source, ref_id) 로그가 여러 줄이면 가장 오래된 하나만 남긴다.
delete from public.seed_log a
 using public.seed_log b
 where a.ref_id is not null
   and a.source = b.source
   and a.ref_id = b.ref_id
   and (a.created_at, a.id) > (b.created_at, b.id);

-- 한 칸에 겹쳐 있는 아이템도 하나만 남긴다.
delete from public.room_items a
 using public.room_items b
 where a.group_id = b.group_id
   and a.x = b.x and a.y = b.y
   and (a.created_at, a.id) > (b.created_at, b.id);

-- ── 1. 유니크 제약 ──────────────────────────────────────────────
-- 새싹 로그: (경로, 대상) 당 최대 한 줄. setSeed 를 upsert 로 만들 수 있게 한다.
create unique index if not exists uq_seedlog_source_ref
  on public.seed_log(source, ref_id) where ref_id is not null;

-- 로그인 코드 중복 방지(지금까지는 앱에서만 확인해 경합 시 뚫릴 수 있었다).
create unique index if not exists uq_students_code on public.students(code);

-- 모둠 공간: 한 칸에 아이템 하나.
create unique index if not exists uq_roomitems_cell on public.room_items(group_id, x, y);

-- 집계 성능
create index if not exists idx_seedlog_source_ref on public.seed_log(source, ref_id);
create index if not exists idx_hearts_student on public.hearts(student_id);

-- ── 2. 새싹 합계는 DB 에서 집계 ─────────────────────────────────
-- 예전에는 seed_log 전체를 앱으로 끌어와 더했다(PostgREST 기본 1000행 상한에 걸릴 위험).
create or replace function public.seed_totals()
returns table (student_id uuid, total bigint)
language sql
stable
security definer
set search_path = public
as $$
  select sl.student_id, sum(sl.amount)::bigint
    from public.seed_log sl
   group by sl.student_id
$$;

-- ── 3. 하트 토글(원자적) ────────────────────────────────────────
-- 질문 행을 잠가 같은 질문에 대한 동시 요청을 줄 세운다.
-- 다른 질문에 대한 하트는 서로 막지 않는다.
create or replace function public.toggle_heart(
  p_question   uuid,
  p_student    uuid,
  p_per_heart  integer default 1
)
returns table (hearted boolean, heart_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
  v_lesson uuid;
  v_cap    integer;
  v_count  integer;
  v_bonus  integer;
begin
  select q.author_id, q.lesson_id
    into v_author, v_lesson
    from public.questions q
   where q.id = p_question
     for update;                                  -- ← 직렬화 지점

  if v_author is null then
    raise exception 'question_not_found';
  end if;
  if v_author = p_student then
    raise exception 'own_question';
  end if;

  select coalesce(l.heart_bonus_cap, 3) into v_cap
    from public.lessons l where l.id = v_lesson;
  v_cap := coalesce(v_cap, 3);

  delete from public.hearts h
   where h.question_id = p_question and h.student_id = p_student;

  if found then
    hearted := false;
  else
    insert into public.hearts(question_id, student_id) values (p_question, p_student);
    hearted := true;
  end if;

  select count(*) into v_count from public.hearts where question_id = p_question;
  v_bonus := least(v_count, v_cap) * greatest(p_per_heart, 0);

  -- 보너스는 질문당 로그 한 줄로 유지(재조정)
  if v_bonus > 0 then
    insert into public.seed_log(student_id, lesson_id, source, ref_id, amount, granted_by)
    values (v_author, v_lesson, 'heart', p_question, v_bonus, 'system')
    on conflict (source, ref_id) where ref_id is not null
    do update set amount = excluded.amount,
                  student_id = excluded.student_id,
                  lesson_id = excluded.lesson_id;
  else
    delete from public.seed_log where source = 'heart' and ref_id = p_question;
  end if;

  heart_count := v_count;
  return next;
end
$$;

-- ── 4. 새싹 재조정(원자적) ──────────────────────────────────────
-- 교사의 지급/취소/반려, 학생의 댓글 삭제가 모두 이걸 쓴다.
create or replace function public.set_seed(
  p_student    uuid,
  p_lesson     uuid,
  p_source     text,
  p_ref        uuid,
  p_amount     integer,
  p_granted_by text default 'teacher'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_amount is null or p_amount <= 0 then
    delete from public.seed_log where source = p_source and ref_id = p_ref;
    return;
  end if;

  -- ref_id 가 없는 수동 조정은 유니크 인덱스(부분 인덱스)의 대상이 아니므로 그냥 넣는다.
  if p_ref is null then
    insert into public.seed_log(student_id, lesson_id, source, ref_id, amount, granted_by)
    values (p_student, p_lesson, p_source, null, p_amount, p_granted_by);
    return;
  end if;

  insert into public.seed_log(student_id, lesson_id, source, ref_id, amount, granted_by)
  values (p_student, p_lesson, p_source, p_ref, p_amount, p_granted_by)
  on conflict (source, ref_id) where ref_id is not null
  do update set amount     = excluded.amount,
                student_id = excluded.student_id,
                lesson_id  = excluded.lesson_id,
                granted_by = excluded.granted_by;
end
$$;

-- ── 5. 모둠 공간 구매/판매(원자적) ──────────────────────────────
-- 모둠 행을 잠가 같은 모둠원의 동시 구매를 줄 세운다.
-- 지갑(보유) = 모둠원 seed_log 합계 − spent_seeds 를 잠근 상태에서 다시 계산한다.
create or replace function public.room_buy(
  p_group uuid,
  p_item  text,
  p_price integer,
  p_cols  integer,
  p_rows  integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_spent  integer;
  v_cum    bigint;
  v_x      integer;
  v_y      integer;
begin
  select g.spent_seeds into v_spent
    from public.groups g where g.id = p_group
     for update;                                  -- ← 직렬화 지점
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

  -- 왼쪽 위부터 첫 빈 칸
  select c.cx, c.cy into v_x, v_y
    from (
      select gx.x as cx, gy.y as cy
        from generate_series(0, p_rows - 1) as gy(y)
        cross join generate_series(0, p_cols - 1) as gx(x)
    ) c
   where not exists (
      select 1 from public.room_items ri
       where ri.group_id = p_group and ri.x = c.cx and ri.y = c.cy
   )
   order by c.cy, c.cx
   limit 1;

  if v_x is null then
    raise exception 'room_full';
  end if;

  insert into public.room_items(group_id, item_type, x, y)
  values (p_group, p_item, v_x, v_y);

  update public.groups set spent_seeds = spent_seeds + p_price where id = p_group;
end
$$;

create or replace function public.room_sell(
  p_group uuid,
  p_item  uuid,
  p_price integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_spent integer;
begin
  select g.spent_seeds into v_spent
    from public.groups g where g.id = p_group
     for update;
  if not found then
    raise exception 'group_not_found';
  end if;

  delete from public.room_items where id = p_item and group_id = p_group;
  if not found then
    raise exception 'item_not_found';
  end if;

  update public.groups
     set spent_seeds = greatest(0, spent_seeds - p_price)
   where id = p_group;
end
$$;

-- ── 6. 실행 권한: 서버(service_role)만 ──────────────────────────
-- 이 함수들은 security definer 라 RLS 를 우회한다. anon 에게 절대 주지 않는다.
revoke all on function public.seed_totals()                                   from public, anon, authenticated;
revoke all on function public.toggle_heart(uuid, uuid, integer)               from public, anon, authenticated;
revoke all on function public.set_seed(uuid, uuid, text, uuid, integer, text) from public, anon, authenticated;
revoke all on function public.room_buy(uuid, text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.room_sell(uuid, uuid, integer)                  from public, anon, authenticated;

grant execute on function public.seed_totals()                                   to service_role;
grant execute on function public.toggle_heart(uuid, uuid, integer)               to service_role;
grant execute on function public.set_seed(uuid, uuid, text, uuid, integer, text) to service_role;
grant execute on function public.room_buy(uuid, text, integer, integer, integer) to service_role;
grant execute on function public.room_sell(uuid, uuid, integer)                  to service_role;
