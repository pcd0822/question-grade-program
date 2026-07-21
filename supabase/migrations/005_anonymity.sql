-- ═══════════════════════════════════════════════════════════════════
--  005 — 질문 익명성 강화 + 죽은 컬럼 정리
--  Supabase 대시보드 → SQL Editor 에서 한 번 실행.
--
--  [문제]
--   comments 는 anon 이 읽을 수 있고 student_id 와 실명(author_name)을 함께 갖는다.
--   questions.author_id 도 anon 이 읽을 수 있으므로,
--     comments 로 (student_id → 이름) 지도를 만든 뒤 questions.author_id 와 맞춰보면
--     "댓글을 한 번이라도 단 학생"의 질문 작성자가 그대로 드러난다.
--
--  [해결]
--   학생마다 students.id 와 "다른" 공개용 식별자 qid 를 하나 더 둔다.
--   질문에는 author_qid(=작성자의 qid)만 anon 에게 보여주고,
--   진짜 author_id 컬럼은 anon 에게서 SELECT 권한을 회수한다.
--   qid ↔ id 대응표는 students 안에만 있고 students 는 anon 전면 차단이므로
--   anon 은 두 세계를 이을 방법이 없다. 본인 질문 여부는 클라이언트가
--   자기 qid(로그인 시 발급)와 비교해 알 수 있어 기능은 그대로다.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. 학생 공개용 식별자 ────────────────────────────────────────
alter table public.students
  add column if not exists qid uuid not null default gen_random_uuid();

create unique index if not exists idx_students_qid on public.students(qid);

-- ── 2. 질문의 익명 작성자 식별자 ────────────────────────────────
alter table public.questions
  add column if not exists author_qid uuid;

-- 기존 질문 백필
update public.questions q
   set author_qid = s.qid
  from public.students s
 where q.author_id = s.id
   and q.author_qid is null;

create index if not exists idx_questions_author_qid on public.questions(author_qid);

-- ── 3. anon 에게서 questions.author_id 읽기 권한 회수 ───────────
-- 컬럼 단위 권한. PostgREST 는 이를 존중하므로 anon 이 author_id 를
-- select 하거나 where 조건에 쓰면 거부된다.
revoke select (author_id) on public.questions from anon;

-- ── 4. 죽은 컬럼 정리 ───────────────────────────────────────────
-- 누적 새싹의 단일 진실 소스는 seed_log 다. 아래 두 컬럼은 항상 0인 채로
-- 남아 있어 "0으로 표시되는" 버그를 유발했다. (groups.spent_seeds 는 유지)
alter table public.groups   drop column if exists cumulative_seeds;
alter table public.students drop column if exists cumulative_seeds;
