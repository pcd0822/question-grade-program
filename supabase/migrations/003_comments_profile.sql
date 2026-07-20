-- 개편: ① 프로필 사진 ② 댓글(답변 대체) ③ 새싹 source 에 'comment' 추가
-- Supabase SQL Editor 에서 한 번 실행.

-- ① 학생 프로필 사진 URL
alter table public.students add column if not exists avatar_url text;

-- ② 댓글 테이블 (질문에 대한 실명 댓글 — 기존 answers 를 대체)
--    이름/아바타를 비정규화 저장 → anon 이 students 를 못 읽어도 실명 표시 가능.
--    질문은 여전히 익명(questions 에는 이름 없음).
create table if not exists public.comments (
  id                uuid primary key default gen_random_uuid(),
  question_id       uuid not null references public.questions(id) on delete cascade,
  author_type       text not null default 'student' check (author_type in ('student','teacher')),
  student_id        uuid references public.students(id) on delete cascade, -- teacher 면 null
  author_name       text not null,                 -- 비정규화(실명, teacher 는 '선생님')
  author_avatar_url text,                           -- 비정규화(프로필 사진)
  text              text not null,
  status            text not null default 'normal'
                      check (status in ('normal','approved','rejected')),
  teacher_feedback  text,                            -- 반려 시 교사 메모
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_comments_question on public.comments(question_id);
create index if not exists idx_comments_student on public.comments(student_id);

alter table public.comments enable row level security;
drop policy if exists "anon read comments" on public.comments;
create policy "anon read comments" on public.comments for select to anon using (true);

alter publication supabase_realtime add table public.comments;

-- ③ 새싹 로그 source 에 'comment' 추가
alter table public.seed_log drop constraint if exists seed_log_source_check;
alter table public.seed_log
  add constraint seed_log_source_check
  check (source in ('question','answer','comment','heart','manual'));
