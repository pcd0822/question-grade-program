-- 과제 답변(교사 과제에 대한 학생 제출) 테이블.
-- 질문/답변과 동일하게 anon 에는 이름이 노출되지 않는다(익명).
-- Supabase SQL Editor 에서 한 번 실행.

create table if not exists public.submissions (
  id         uuid primary key default gen_random_uuid(),
  lesson_id  uuid not null references public.lessons(id) on delete cascade,
  author_id  uuid not null references public.students(id) on delete cascade,
  text       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lesson_id, author_id)                 -- 수업당 학생 1개
);

create index if not exists idx_submissions_lesson on public.submissions(lesson_id);

alter table public.submissions enable row level security;

-- anon 읽기 허용(이름 없음 → 익명). 쓰기는 service_role(Netlify Functions)만.
drop policy if exists "anon read submissions" on public.submissions;
create policy "anon read submissions" on public.submissions for select to anon using (true);

-- Realtime (이미 추가돼 있으면 에러 무시)
alter publication supabase_realtime add table public.submissions;
