-- ═══════════════════════════════════════════════════════════════════
--  질문 프로그램 (question-grade-program) — Supabase 스키마
--  Supabase 대시보드 → SQL Editor 에 붙여넣고 "Run" 한 번 실행.
--
--  보안 원칙:
--   - 쓰기(새싹 지급/반려/학생·수업 관리/답변·하트)는 전부 Netlify Functions
--     (service_role 키) 를 통해서만 수행 → service_role 은 RLS 를 우회한다.
--   - 브라우저(anon)는 "읽기 + Realtime 구독"만 한다.
--   - students 테이블은 로그인 코드(code)·학번을 담으므로 anon 접근을 전면 차단한다.
--     학생 이름은 어디서도 anon 에 노출하지 않아 질문 익명성이 보장된다.
-- ═══════════════════════════════════════════════════════════════════

-- ── 모둠 ──────────────────────────────────────────────────────────
create table if not exists public.groups (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  -- 랭킹/지갑 표시를 anon 이 실시간으로 읽을 수 있도록 그룹 단위로 비정규화해 둔다.
  cumulative_seeds integer not null default 0,  -- 모둠 누적 새싹(랭킹 기준, 감소 안 함)
  spent_seeds      integer not null default 0,  -- 아이템 구매로 차감된 누적치
  created_at       timestamptz not null default now()
);
-- 보유(지갑) 새싹 = cumulative_seeds - spent_seeds

-- ── 학생 (민감: code, student_no) ────────────────────────────────
create table if not exists public.students (
  id               uuid primary key default gen_random_uuid(),
  student_no       text not null,               -- 학번
  name             text not null,
  code             text not null,               -- 6자리 개별 로그인 코드 (영문+숫자)
  group_id         uuid references public.groups(id) on delete set null,
  cumulative_seeds integer not null default 0,  -- 개인 누적 새싹(랭킹 합산 기준, 감소 안 함)
  created_at       timestamptz not null default now(),
  unique (student_no)
);

-- ── 수업(차시) ────────────────────────────────────────────────────
create table if not exists public.lessons (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  period_label    text,                         -- 차시 정보 (예: "1차시")
  content         text not null default '',     -- 수업 내용 / 제시문
  task            text not null default '',     -- 과제 설명
  stage           text not null default 'factual'
                    check (stage in ('factual','divergent','meta','creative')),
  stage_guide     text,                         -- 신호어 등 안내문
  heart_bonus_cap integer not null default 3,   -- 질문당 하트 보너스 상한
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

-- ── 질문 ──────────────────────────────────────────────────────────
create table if not exists public.questions (
  id           uuid primary key default gen_random_uuid(),
  lesson_id    uuid not null references public.lessons(id) on delete cascade,
  author_id    uuid not null references public.students(id) on delete cascade,
  text         text not null,
  seed_granted boolean not null default false,  -- 교사가 이 질문에 새싹 지급했는지
  created_at   timestamptz not null default now()
);

-- ── 답변 (한 학생당 한 질문에 하나) ──────────────────────────────
create table if not exists public.answers (
  id               uuid primary key default gen_random_uuid(),
  question_id      uuid not null references public.questions(id) on delete cascade,
  author_id        uuid not null references public.students(id) on delete cascade,
  text             text not null,
  status           text not null default 'submitted'
                     check (status in ('submitted','approved','rejected')),
  teacher_feedback text,                         -- 반려 시 교사 대댓글
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (question_id, author_id)               -- 1인 1답변
);

-- ── 하트(동료 추천) — 질문당 1인 1회 ────────────────────────────
create table if not exists public.hearts (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  student_id  uuid not null references public.students(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (question_id, student_id)
);

-- ── 배지 (수업별) ────────────────────────────────────────────────
create table if not exists public.badges (
  id         uuid primary key default gen_random_uuid(),
  lesson_id  uuid references public.lessons(id) on delete cascade,
  name       text not null,
  image_url  text,                              -- Supabase Storage 공개 URL
  condition  text not null default '',          -- 부여 조건(텍스트)
  created_at timestamptz not null default now()
);

-- ── 학생 배지 (교사 수동 부여) ──────────────────────────────────
create table if not exists public.student_badges (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  badge_id   uuid not null references public.badges(id) on delete cascade,
  granted_at timestamptz not null default now(),
  unique (student_id, badge_id)
);

-- ── 새싹 지급 로그 (형성평가 증빙 · CSV) ────────────────────────
create table if not exists public.seed_log (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  lesson_id  uuid references public.lessons(id) on delete set null,
  source     text not null check (source in ('question','answer','heart','manual')),
  ref_id     uuid,                              -- 관련 질문/답변 id
  amount     integer not null,                  -- 지급 새싹 수(취소 시 음수 기록)
  granted_by text not null default 'teacher',   -- 'teacher' | 'system'
  created_at timestamptz not null default now()
);

-- ── 모둠 공간 아이템 ─────────────────────────────────────────────
create table if not exists public.room_items (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  item_type  text not null,                     -- 상점 카탈로그 키
  x          integer not null default 0,
  y          integer not null default 0,
  created_at timestamptz not null default now()
);

-- ── 인덱스 ────────────────────────────────────────────────────────
create index if not exists idx_students_group    on public.students(group_id);
create index if not exists idx_questions_lesson   on public.questions(lesson_id);
create index if not exists idx_answers_question    on public.answers(question_id);
create index if not exists idx_hearts_question     on public.hearts(question_id);
create index if not exists idx_seedlog_student     on public.seed_log(student_id);
create index if not exists idx_studentbadge_student on public.student_badges(student_id);
create index if not exists idx_roomitems_group     on public.room_items(group_id);

-- ═══════════════════════════════════════════════════════════════════
--  RLS (Row Level Security)
--  모든 테이블 RLS on. 쓰기는 service_role(RLS 우회)로만.
--  anon 에는 필요한 읽기 정책만 부여한다.
-- ═══════════════════════════════════════════════════════════════════
alter table public.groups         enable row level security;
alter table public.students       enable row level security;
alter table public.lessons        enable row level security;
alter table public.questions      enable row level security;
alter table public.answers        enable row level security;
alter table public.hearts         enable row level security;
alter table public.badges         enable row level security;
alter table public.student_badges enable row level security;
alter table public.seed_log       enable row level security;
alter table public.room_items     enable row level security;

-- students: anon 정책 없음 → 로그인 코드/학번/이름 전면 비공개(익명성 보장).
--           서버(service_role)만 접근한다. (정책을 만들지 않으면 anon 은 전부 거부됨)

-- 나머지 테이블: anon SELECT 허용 (이름 등 개인정보는 담기지 않음)
create policy "anon read groups"        on public.groups         for select to anon using (true);
create policy "anon read lessons"       on public.lessons        for select to anon using (true);
create policy "anon read questions"     on public.questions      for select to anon using (true);
create policy "anon read answers"       on public.answers        for select to anon using (true);
create policy "anon read hearts"        on public.hearts         for select to anon using (true);
create policy "anon read badges"        on public.badges         for select to anon using (true);
create policy "anon read student_badges" on public.student_badges for select to anon using (true);
create policy "anon read seed_log"      on public.seed_log       for select to anon using (true);
create policy "anon read room_items"    on public.room_items     for select to anon using (true);

-- ═══════════════════════════════════════════════════════════════════
--  Realtime — 브라우저가 구독할 테이블을 publication 에 추가
--  (RLS 를 존중하므로 students 는 넣지 않는다)
-- ═══════════════════════════════════════════════════════════════════
alter publication supabase_realtime add table public.groups;
alter publication supabase_realtime add table public.lessons;
alter publication supabase_realtime add table public.questions;
alter publication supabase_realtime add table public.answers;
alter publication supabase_realtime add table public.hearts;
alter publication supabase_realtime add table public.badges;
alter publication supabase_realtime add table public.student_badges;
alter publication supabase_realtime add table public.seed_log;
alter publication supabase_realtime add table public.room_items;
