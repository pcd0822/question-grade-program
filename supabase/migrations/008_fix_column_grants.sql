-- ═══════════════════════════════════════════════════════════════════
--  008 — 005·007 의 실패 부분 바로잡기
--
--  [왜 005 의 익명성 조치가 안 먹혔나]
--   005 는 이렇게 썼다:
--       revoke select (author_id) on public.questions from anon;
--   그런데 anon 은 "테이블 전체 SELECT" 권한을 이미 갖고 있었다.
--   PostgreSQL 에서 **컬럼 단위 REVOKE 는 테이블 단위 GRANT 를 깎아내지 못한다.**
--   (테이블 권한이 있으면 모든 컬럼을 볼 수 있고, 컬럼 REVOKE 는 조용히 무시된다)
--   실제로 005 실행 후에도 anon 이 author_id 를 그대로 읽을 수 있었다.
--
--   올바른 방법: 테이블 단위 SELECT 를 먼저 회수하고, 필요한 컬럼만 다시 부여한다.
--
--  [왜 007 이 안 먹혔나]
--   ALTER PUBLICATION ... DROP TABLE 에서 난 오류가 예외 핸들러에 걸리지 않아
--   스크립트 전체가 롤백된 것으로 보인다. 여기서는 예외에 기대지 않고
--   publication 목록을 직접 조회해서 있을 때만 제거한다.
--
--  ⚠ 실행 순서 주의: 이 마이그레이션을 적용하면 questions 를 `select('*')` 로 읽는
--    코드가 즉시 실패한다. **새 프론트엔드 코드를 먼저 배포한 뒤** 실행할 것.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. questions: 컬럼 화이트리스트로 다시 부여 ────────────────
-- author_id 는 빠져 있다. 이게 질문 익명성의 핵심.
revoke select on public.questions from anon;
revoke select on public.questions from authenticated;
-- PUBLIC 을 통해 암묵적으로 새어 들어오는 권한도 함께 차단(있다면)
revoke select on public.questions from public;

grant select (id, lesson_id, author_qid, text, seed_granted, created_at)
  on public.questions to anon;
grant select (id, lesson_id, author_qid, text, seed_granted, created_at)
  on public.questions to authenticated;

-- ⚠ 앞으로 questions 에 컬럼을 추가하면, anon 에게 보여줄 컬럼인지 판단해서
--   위 목록에 직접 넣어야 한다(자동으로 보이지 않는다).

-- ── 2. answers 테이블 정리 (007 재시도) ────────────────────────
do $$
begin
  if exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'answers'
  ) then
    alter publication supabase_realtime drop table public.answers;
  end if;
end
$$;

drop table if exists public.answers cascade;
