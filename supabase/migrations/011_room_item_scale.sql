-- ═══════════════════════════════════════════════════════════════════
--  011 — 모둠 공간 아이템 크기 조절 + 회전
--
--  아이템마다 배율(scale)과 각도(rotation)를 둬서 학생이 드래그로
--  크기와 방향을 바꿀 수 있게 한다.
--  화면에 그려지는 최종 크기 = 깊이에 따른 배율(depthScale) × scale.
--  여러 번 실행해도 안전하다(이미 돌렸다면 회전 컬럼만 추가된다).
-- ═══════════════════════════════════════════════════════════════════

alter table public.room_items
  add column if not exists scale numeric(4,2) not null default 1;

alter table public.room_items
  add column if not exists rotation numeric(5,2) not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'room_items_scale_range') then
    alter table public.room_items
      add constraint room_items_scale_range check (scale >= 0.5 and scale <= 2.5);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'room_items_rotation_range') then
    alter table public.room_items
      add constraint room_items_rotation_range check (rotation >= 0 and rotation < 360);
  end if;
end
$$;
