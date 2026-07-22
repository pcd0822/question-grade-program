-- ═══════════════════════════════════════════════════════════════════
--  013 — 수업 자료 파일 첨부
--
--  교사가 수업(차시)마다 파일을 여러 개 올리고, 학생이 내려받아 볼 수 있게 한다.
--  파일 실물은 Storage 공개 버킷 'lesson_files' 에, 메타데이터는 아래 테이블에 둔다.
--  파일명·URL 만 담고 개인정보는 없으므로 anon 읽기를 허용한다(익명성과 무관).
--  업로드/삭제는 서버(service_role, netlify/functions/lessons.js)만 한다.
--  여러 번 실행해도 안전하다.
-- ═══════════════════════════════════════════════════════════════════

-- ── 수업 자료 메타데이터 ─────────────────────────────────────────
create table if not exists public.lesson_files (
  id         uuid primary key default gen_random_uuid(),
  lesson_id  uuid not null references public.lessons(id) on delete cascade,
  name       text not null,              -- 원본 파일명 (다운로드 시 이 이름으로)
  path       text not null,              -- Storage 내부 경로
  url        text not null,              -- 공개 다운로드 URL
  size       integer not null default 0, -- 바이트
  mime       text,                       -- 콘텐츠 타입
  created_at timestamptz not null default now()
);
create index if not exists idx_lesson_files_lesson on public.lesson_files(lesson_id);

alter table public.lesson_files enable row level security;

-- anon 읽기 허용(개인정보 없음). 쓰기는 service_role 만.
drop policy if exists "anon read lesson_files" on public.lesson_files;
create policy "anon read lesson_files" on public.lesson_files for select to anon using (true);

-- Realtime (이미 추가돼 있으면 에러 무시)
alter publication supabase_realtime add table public.lesson_files;

-- ── Storage 공개 버킷 ────────────────────────────────────────────
-- public=true 라 객체는 공개 URL 로 바로 내려받을 수 있다(추가 정책 불필요).
-- 업로드는 service_role 로만 하므로 storage.objects RLS 정책은 두지 않는다.
insert into storage.buckets (id, name, public)
values ('lesson_files', 'lesson_files', true)
on conflict (id) do nothing;
