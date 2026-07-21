-- ═══════════════════════════════════════════════════════════════════
--  007 — 죽은 answers 테이블 정리 (선택 사항이지만 권장)
--
--  answers 는 003 에서 comments 로 대체됐다. 지금은 어떤 코드도 읽거나 쓰지 않는데
--  anon 읽기 정책과 Realtime publication 에는 그대로 남아 있어,
--  쓰지도 않는 테이블의 변경 알림이 오가고 공격 표면만 넓힌다.
--
--  ⚠ 예전 수업 데이터를 답변 형태로 보관 중이라면 이 파일은 건너뛰어도 된다.
--    (남겨두어도 동작에는 지장이 없다)
-- ═══════════════════════════════════════════════════════════════════

-- Realtime 구독 대상에서 제거
-- (ALTER PUBLICATION ... DROP TABLE 은 IF EXISTS 를 지원하지 않아 블록으로 감싼다)
do $$
begin
  alter publication supabase_realtime drop table public.answers;
exception
  when undefined_table or undefined_object then null;  -- 이미 없으면 무시
end
$$;

-- 테이블 삭제 (seed_log.source 의 'answer' 값은 과거 기록 보존을 위해 그대로 둔다)
drop table if exists public.answers;
