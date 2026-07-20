-- 교사 프로필 등 앱 전역 설정 저장용 (키-값).
-- 서버(service_role)만 접근. Supabase SQL Editor 에서 한 번 실행.
create table if not exists public.app_settings (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
-- anon 정책 없음 → 서버 전용
