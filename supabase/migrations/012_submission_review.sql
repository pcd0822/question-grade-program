-- ═══════════════════════════════════════════════════════════════════
--  012 — 과제 답변(submissions) 승인·반려 + 새싹 지급
--
--  교사가 학생의 과제 제출에 대해 [승인(새싹 지급) / 반려(피드백)]을 할 수 있게
--  submissions 에 상태·피드백 컬럼을 추가한다. 댓글(comments)과 같은 상태 모델을 쓴다.
--  또 새싹 로그 source 에 'submission'(과제)을 추가한다.
--  여러 번 실행해도 안전하다.
-- ═══════════════════════════════════════════════════════════════════

-- ① submissions 상태 + 반려 피드백 (댓글과 동일한 status 모델)
alter table public.submissions
  add column if not exists status text not null default 'normal';

alter table public.submissions
  add column if not exists teacher_feedback text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'submissions_status_check') then
    alter table public.submissions
      add constraint submissions_status_check
      check (status in ('normal','approved','rejected'));
  end if;
end
$$;

-- ② 새싹 로그 source 에 'submission'(과제) 추가
alter table public.seed_log drop constraint if exists seed_log_source_check;
alter table public.seed_log
  add constraint seed_log_source_check
  check (source in ('question','answer','comment','heart','manual','submission'));
