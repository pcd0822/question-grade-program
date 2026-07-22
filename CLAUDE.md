# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

이 파일은 Claude Code(claude.ai/code)가 이 저장소에서 작업할 때 참고하는 가이드입니다.
UI·주석·사용자 문자열은 모두 **한국어**입니다. 편집 시 이 관례를 지키세요.

## 이게 뭔가

고교 **'언어와 매체' 문법 탐구 4차시 수업**(사실적 → 발산적 → 메타·종합 → 창의·평가 질문)에서 쓰는 **"질문 프로그램"** 웹앱. 교사 1인 + 학생 약 17~18명, 교실에서 크롬북/태블릿/폰으로 접속 → **모바일 우선 반응형**. **AI 없이 규칙 기반**으로 동작하며, 포인트(**"새싹"** — 씨앗 아님)를 통한 게이미피케이션(모둠 공간·배지)이 핵심.

기존 `../my-ai-tutor`(바닐라 단일 HTML + OpenAI)를 전면 재구축한 프로젝트. 원격: `github.com/pcd0822/question-grade-program`.

## 명령어

```bash
npm install
npm start        # = netlify dev (localhost:8888) — 로그인·함수가 필요하면 반드시 이걸로 실행
npm run dev      # vite만 (5173) — 함수가 안 떠서 로그인 불가. UI만 볼 때
npm run build    # tsc -b && vite build — 실질적 타입체크 게이트. 큰 변경 후 반드시 실행
npm run lint     # eslint (flat config: eslint.config.js)
npm run preview  # 프로덕션 빌드 미리보기
```

lint 설정에서 **`react-hooks/set-state-in-effect`는 꺼 두었다.** 라우터가 없어 "탭 전환 = 마운트"이고, 마운트 시 서버에서 불러와 state 에 넣는 패턴을 전면적으로 쓰기 때문이다.

테스트 스위트는 없다. 백엔드 로직 검증은 `.env`를 로드해 함수 핸들러를 직접 import·호출하는 일회성 node 스크립트로 해왔다(대화 기록의 `_test*.mjs` 패턴 참고 — 실행 후 삭제).

## 스택

React 19 + Vite 7 + TypeScript + **Tailwind 4**(`@tailwindcss/vite`, `tailwind.config` 없음) + **Supabase**(Postgres + Realtime + Storage) + **Netlify Functions** + Netlify 배포. 로컬 풀스택 실행은 `netlify-cli`(devDependency).

## 아키텍처

**라우터 없음.** `src/App.tsx`가 역할(`none | teacher | student`)을 감지해 최상위 화면을 스위치하고, 각 대시보드 안에서는 `components/AppShell`의 **상태 기반 탭**으로 전환한다.

### 인증 (Supabase Auth 미사용)
- **교사**: 코드 로그인. 코드는 서버 env `TEACHER_CODE`(기본 `0822`).
- **학생**: **학번 + 자동 생성 6자리 코드**(영문+숫자, 혼동 문자 제외). 교사가 학생을 등록하면 코드가 발급된다. 회원가입·비밀번호 없음.
- 세션은 localStorage(`src/lib/session.ts`). 학생 세션에는 이후 서버 쓰기 재검증용 `code`를 함께 보관한다.
- **개인정보 최소 수집**: 학번·이름·코드·프로필사진만. 그 외 금지.

### 보안 모델 (가장 중요)
- **쓰기 + 로그인 = 전부 Netlify Functions**(`netlify/functions/*`)를 통한다. 함수는 `netlify/lib/admin.js`의 **service_role** 클라이언트로 Supabase에 접근(RLS 우회). 학생 요청은 매번 `verifyStudent(학번, 코드)`, 교사 요청은 `requireTeacher(코드)`로 재검증.
- **브라우저는 anon 키**(`src/lib/supabase.ts`)로 **읽기 + Realtime 구독만** 한다. 절대 여기서 쓰기 금지.
- **`students` 테이블은 RLS로 anon 접근 전면 차단** → 코드·이름이 노출되지 않아 **질문 익명성**이 보장된다. 나머지 테이블만 anon SELECT 허용.
- **질문은 익명**(questions에 이름 없음). **댓글은 실명** → 이름·아바타를 comments 행에 **비정규화 저장**해 anon도 표시 가능하게 한다(students를 못 읽으므로). 프로필 사진 변경 시 해당 학생의 기존 댓글 아바타도 서버에서 갱신한다.
- **익명성은 "식별자 분리"로 지킨다(005).** 댓글은 실명이므로 `comments.student_id`만으로 (id → 이름) 지도를 만들 수 있다. 그래서 질문에는 **students.id 와 다른 UUID인 `author_qid`** 만 노출하고, 진짜 `questions.author_id`는 **anon 에게서 SELECT 권한을 회수**했다. qid↔id 대응표는 anon 차단된 students 안에만 있어 두 세계를 이을 수 없다.
  - ⚠ **`questions`를 anon 으로 읽을 때 `author_id`를 select 하거나 where 에 쓰면 즉시 실패한다.** `src/lib/studentData.ts`처럼 컬럼을 명시해 읽을 것(`select('*')` 금지).
  - 학생 화면의 "내 질문" 판별은 세션의 `qid`(로그인 시 발급)와 `author_qid` 비교로 한다.
- `room` 함수의 `state`는 모둠원 실명이 담기므로 **학생 인증을 요구**한다(공개 조회는 `catalog`와 `ranking`뿐).

### 새싹(seed) 회계 — 단일 진실 소스는 `seed_log`
- **개인 누적 새싹 = seed_log 합계**. 별도 카운터를 비정규화하지 않아 드리프트가 없다. **DB 컬럼 `cumulative_seeds`는 005 에서 제거됐다** — API 응답의 같은 이름 필드는 서버가 매번 계산해 채워 주는 값이다.
- 합계 계산은 `sumSeedByStudent()` → DB 함수 **`seed_totals()`**(GROUP BY 집계). 예전처럼 seed_log 전체를 앱으로 끌어오지 않는다(PostgREST 1000행 상한 회피).
- `admin.js`의 **`setSeed({source, refId, amount})`**: 해당 (source, ref_id)의 로그를 목표 금액으로 **재조정**(멱등). 006 이후에는 DB 함수 `set_seed`의 **단일 upsert**로 처리된다. **키는 `(source, ref_id)`뿐**이라 `amount: 0`으로 회수할 땐 studentId/lessonId를 생략해도 된다.
- 지급 규칙: **질문 1 · 댓글 2 · 과제 승인 2 · 하트 보너스 1개**(질문당 상한 `lessons.heart_bonus_cap`, 기본 3). 상수는 `admin.js`의 `SEED = {QUESTION:1, COMMENT:2, SUBMISSION:2, HEART:1}`. 취소·반려·삭제·재제출 시 로그 제거로 회수.
- 하트 보너스는 질문당 **로그 1행**(`source:'heart', ref_id: questionId`)으로 유지되고, 하트를 누를 때마다 `min(하트수, cap) * 1`로 재계산된다. 하트 취소도 자동 반영.
- **새싹 획득 상세 내역**은 `groups` 함수의 `seed-report` 액션 → 교사 화면 "새싹 내역 CSV"(형성평가 증빙). CSV 생성·다운로드는 `src/lib/csv.ts` 공용 헬퍼를 쓴다(BOM 필수 — 없으면 엑셀에서 한글이 깨진다).
- **두 값**: ① **누적**(랭킹 기준, 교사 정정 외에는 감소 안 함) = seed_log 합. ② **보유(모둠 지갑)** = 모둠 누적 − `groups.spent_seeds`(아이템 구매로 증가). 아이템을 사도 랭킹(누적)은 안 떨어진다.
- 모둠/학급 집계는 서버에서 현재 소속으로 계산한다(`ranking.js`, `groups.js`의 `sumSeedByStudent`). anon은 students를 못 읽으므로 클라이언트에서 모둠 집계를 하지 않는다.

### 실시간 반영
`src/hooks/useRealtime.ts`가 지정 테이블 변경을 구독해 refetch. 교사가 새싹을 누르면 학생 화면에 곧 반영. Realtime은 RLS를 존중하므로 **students는 publication에 없다**.

**30명이 동시에 접속한다는 전제로 refetch를 흩뿌린다**: 400ms 디바운스 + **기기별 무작위 지터(최대 700ms)** + **숨겨진 탭은 refetch 생략**(다시 보일 때 한 번). 지터가 없으면 하트 한 번에 30대가 같은 순간 재조회해 순간 부하가 튄다. 이 값을 줄이려 할 때는 이 이유를 먼저 고려할 것.

### 동시성 (중요 — 학급 30명 동시 사용)
경합이 생기는 쓰기는 **DB 함수 안에서 행 잠금 + 단일 트랜잭션**으로 처리한다(006). 애플리케이션에서 "읽고 → 계산하고 → 쓰기"로 나누면 안 되는 지점들:
- **`toggle_heart(question, student)`** — 질문 행을 `for update`로 잠그고 [하트 토글 + 보너스 재계산]을 한 번에. 같은 질문에 동시 하트가 몰려도 수치가 어긋나지 않는다. 다른 질문끼리는 서로 막지 않는다.
- **`set_seed(...)`** — `(source, ref_id)` 유니크 인덱스 + upsert. 예전 "삭제 후 삽입"은 겹치면 로그가 두 줄 생겨 **새싹이 두 배**가 됐다.
- **`room_buy` / `room_sell`** — 모둠 행을 잠근 채 [지갑 확인 → 빈 칸 → 배치 → 차감]. 예전 read-modify-write 는 동시 구매 시 차감이 유실돼 **공짜 아이템**이 나왔다.
- 유니크 제약으로 애초에 막는 것들: `seed_log(source, ref_id)`, `students(code)`, `room_items(group_id, x, y)`.
- 새 쓰기 경로를 추가할 때 **같은 행을 두 사람이 동시에 건드릴 수 있으면 반드시 DB 함수로 내릴 것.** JS 쪽 폴백(`isMissingFunction`)은 마이그레이션 미적용 환경 호환용일 뿐, 경합 안전하지 않다.

### 이미지 / Storage
- Supabase Storage 공개 버킷 **`avatars`**(학생·교사 프로필), **`badges`**(배지 이미지). 서비스 롤로 이미 생성돼 있음.
- 업로드는 함수에서 처리: 클라이언트가 `src/lib/imageCompress.ts`로 **정사각 크롭 + 흰 배경 채움 → JPEG dataURL**(투명 PNG가 검게 나오지 않도록 흰색 fill 후 그림)로 압축해 base64를 보내면, 함수가 디코드해 Storage에 upsert하고 public URL(`?v=` 캐시버스터)을 저장.

## 데이터 모델 (Supabase)

`supabase/schema.sql`(초기) + `supabase/migrations/*` 순서로 **SQL Editor에서 수동 실행**해야 한다. **service_role 키로는 DDL을 실행할 수 없으므로**(PostgREST/Storage 전용) 스키마 변경은 항상 사용자가 SQL Editor에서 돌려야 한다.

실행 순서 (**`001_`은 없다** — 베이스가 `migrations/` 밖의 `schema.sql`이라 번호가 002부터 시작한다):
1. `schema.sql` — groups, students, lessons, questions, answers(레거시·미사용), hearts, badges, student_badges, seed_log, room_items + RLS + Realtime publication
2. `migrations/002_submissions.sql` — submissions(과제 답변)
3. `migrations/003_comments_profile.sql` — **필수.** students.avatar_url, comments 테이블, seed_log source에 'comment' 추가. (`verifyStudent`가 avatar_url을 조회하므로 이걸 안 돌리면 학생 로그인부터 깨진다)
4. `migrations/004_settings.sql` — app_settings(교사 프로필 등 전역 키-값). 없어도 나머지는 graceful 동작(교사 프로필 사진 저장만 비활성).
5. `migrations/005_anonymity.sql` — **익명성 강화.** students.qid(공개용 식별자) + questions.author_qid 추가·백필, **anon 에게서 questions.author_id SELECT 권한 회수**, 죽은 cumulative_seeds 컬럼 2개 제거.
6. `migrations/006_concurrency.sql` — **동시 접속(30명) 안정화.** 유니크 제약 3종 + DB 함수 `seed_totals` / `set_seed` / `toggle_heart` / `room_buy` / `room_sell`.
7. `migrations/007_drop_answers.sql` — (선택) 죽은 answers 테이블·publication 정리. **아직 적용되지 않았다** — 008 의 재시도까지 실패했고, answers 테이블은 그대로 남아 있다. 기능에는 지장이 없다.
8. `migrations/008_fix_column_grants.sql` — **005·007 실패분 수정.** 반드시 실행해야 익명성이 실제로 적용된다.
9. `migrations/009_room_free_and_chat.sql` — 모둠 공간 **자유 배치**(x·y 를 격자 정수 → 공간 내 비율 numeric 0~100, 칸 유니크 해제, `room_buy` 시그니처 교체) + **모둠 채팅**(`group_chat` 테이블·RLS·Realtime).
10. `migrations/010_repair_room_coords.sql` — 009 가 중간에 멈춰 좌표 변환·`room_buy` 교체만 빠졌던 것을 복구. 이미 적용된 부분은 건너뛴다.
11. `migrations/011_room_item_scale.sql` — 아이템 **크기(scale) · 회전(rotation)** 컬럼.
12. `migrations/012_submission_review.sql` — **과제 답변 승인·반려.** submissions 에 `status`(normal/approved/rejected) + `teacher_feedback` 추가, seed_log source 에 `submission`(과제) 추가. **작업 4 기능에 필수**(미적용이면 승인/반려 시 500, 제출 자체는 폴백으로 계속 동작).
13. `migrations/013_lesson_files.sql` — **수업 자료 파일.** `lesson_files` 테이블(anon 읽기·Realtime) + Storage 공개 버킷 `lesson_files`. 미적용이면 자료 목록은 빈 배열로 graceful 동작.

⚠ **컬럼 단위 REVOKE 는 테이블 단위 GRANT 를 깎아내지 못한다.** 005 의 `revoke select (author_id) ... from anon` 은 anon 이 테이블 전체 SELECT 권한을 갖고 있어 **조용히 무시됐다**(실행은 성공하는데 효과가 없음). 컬럼을 가리려면 008 처럼 **테이블 SELECT 를 회수한 뒤 필요한 컬럼만 다시 grant** 해야 한다. 앞으로 `questions` 에 컬럼을 추가하면 anon 에게 보여줄지 판단해 008 의 grant 목록에 직접 넣어야 한다(자동으로 보이지 않는다).

⚠ **배포 순서**: 008 을 적용하면 `questions` 를 `select('*')` 로 읽는 코드가 즉시 실패한다. **새 프론트 코드를 먼저 배포한 뒤** 008 을 실행할 것.

**005·006 은 안 돌려도 앱이 죽지는 않는다** — 서버 코드가 컬럼/함수 부재를 감지해 예전 방식으로 자동 폴백한다(`isMissingFunction`). 다만 폴백 경로는 **경합에 취약하고 익명성 보강도 적용되지 않으므로**, 수업 전에 반드시 실행할 것.

주요 테이블:
- **groups**(name, spent_seeds) — 지갑 차감 누적. 모둠 누적/보유는 seed_log에서 계산.
- **students**(student_no, name, **code**, group_id, avatar_url) — RLS로 anon 전면 차단.
- **lessons**(title, period_label, content=제시문, task=과제, **stage**=factual/divergent/meta/creative, stage_guide, heart_bonus_cap, active)
- **questions**(lesson_id, author_id, text, seed_granted) — 익명
- **comments**(question_id, author_type=student/teacher, student_id, **author_name·author_avatar_url 비정규화**, text, status=normal/approved/rejected, teacher_feedback) — **답변(answers)을 대체.** 실명. 여러 개 가능. 교사 댓글도 여기.
- **hearts**(question_id, student_id) — 질문당 1인 1회 unique
- **submissions**(lesson_id, author_id, text, **status**=normal/approved/rejected, **teacher_feedback**) — 과제 답변, 수업당 1개 unique. 교사가 승인(새싹 `submission` 2개)/반려(피드백). 재제출 시 status→normal·새싹 회수.
- **lesson_files**(lesson_id, name, path, url, size, mime) — 수업 자료 파일 메타. 실물은 Storage 공개 버킷 `lesson_files`. 교사 업로드(≤4MB·base64→함수) → 학생 다운로드(공개 URL `?download=원본파일명`).
- **badges**(lesson_id?, name, image_url, condition) / **student_badges**(student_id, badge_id) — 교사 수동 부여
- **seed_log**(student_id, lesson_id?, source=question/comment/heart/manual/answer, ref_id, amount, granted_by) — 새싹의 단일 진실 소스
- **room_items**(group_id, item_type, x, y) — 모둠 공간 배치
- **app_settings**(key, value) — 교사 프로필 등

## Netlify Functions (`netlify/functions/`)

공용: `netlify/lib/admin.js`(service_role 클라이언트, 검증 헬퍼, `setSeed`, `sumSeedByStudent`, 코드 생성), `netlify/lib/shop.js`(모둠 공간 상점 카탈로그 12종 + 8×5 격자 + 가격 — **가격의 단일 진실 소스**).

**함수 작성 규약 — 새 함수는 이 형태를 그대로 따를 것:**
- **ESM + Netlify Functions v1 시그니처**: `export async function handler(event)` → `{statusCode, headers, body}` 반환. v2의 `(req: Request) => Response`가 **아니다**(공용 `json()` 헬퍼가 v1 전제). import 시 확장자 `.js` 필수.
- 첫 줄은 항상 `if (event.httpMethod !== 'POST') return json(405, ...)`. 공개 읽기인 `ranking`만 GET도 허용.
- 요청은 JSON 바디의 **`action` 필드로 switch 분기**, `default`는 `json(400, {error:'알 수 없는 action'})`. 단 `teacher-login`/`student-login`/`teacher-feed`/`ranking`은 action 없이 단일 동작.
- **인증 위치**: 교사 함수는 try/switch **앞에서** `requireTeacher(body.teacherCode)`, `student-actions`도 앞에서 `verifyStudent(body.studentNo, body.code)`. `room.js`만 `catalog`/`state`를 공개로 두려고 **각 case 안에서** 검증한다. 자격 필드명이 다름에 주의(교사 `teacherCode` / 학생 `studentNo`+`code`).
- **CORS 헤더 없음(의도적)**: SPA와 함수가 netlify.toml 리라이트로 동일 출처이므로 불필요. OPTIONS 핸들링도 없다.
- 에러는 `{error:'한국어 메시지'}` + 400/401/403/404/405/409/500. 500은 항상 `catch(e){ console.error('[함수명]', e); return json(500,{error:'서버 오류가 발생했습니다.'}) }` — 내부 예외를 클라이언트로 흘리지 않는다.
- 성공은 명명된 엔티티(`{student}`, `{lesson}`…) 또는 `{ok:true}`. `room` 변경 액션만 예외적으로 **갱신된 roomState 전체**를 돌려준다.
- 존재 확인은 `.single()`이 아니라 **`.maybeSingle()`**(0행에서 406 방지). `updated_at`은 DB 트리거가 없어 JS에서 직접 넣는다.

- `teacher-login` / `student-login` — 로그인 검증
- `students` — 교사: 학생 목록/등록(코드 자동생성)/코드 재발급/삭제
- `lessons` — 교사: 수업 CRUD/활성 토글 + 자료 파일(list-files/add-file/delete-file). 수업 삭제 시 Storage 실물도 정리.
- `student-actions` — 학생: 질문 등록, 댓글 작성·수정·삭제, 하트 토글, 과제 제출, 프로필 사진(set-avatar)
- `teacher-actions` — 교사: 질문 새싹, 댓글 새싹/반려, 교사 댓글 작성·삭제, **과제 답변 승인(새싹)/반려**(grant-submission-seed/reject-submission)
- `teacher-feed` — 교사 질문 대시보드 데이터(작성자 실명·아바타·모둠 + 댓글 + 과제 제출)
- `groups` — 교사: 모둠 overview(개별/모둠/학급 통계) + 생성/이름변경/삭제/배정
- `ranking` — 공개: 모둠 랭킹 + 학급 전체 합계(개인 이름 비노출)
- `badges` — 교사: 배지 등록(이미지)/목록/삭제/부여/회수
- `room` — 모둠 공간: catalog / state(공개) / buy·move·remove(학생 인증, 본인 모둠만)
- `teacher-settings` — 교사: 프로필 사진 조회/설정(app_settings)

## 프론트 구조 (`src/`)

- `components/` — `AppShell`(교사·학생 공용: 좌측 사이드바 + 햄버거 + **종이접기 폴드 애니메이션**), `Avatar`(원형, 이미지 없으면 이름 첫 글자), `icons`(하트·댓글 **2D 라인 SVG**), 
- `pages/` — `LoginPage`(학생/교사 탭), `TeacherDashboard`(AppShell + 질문대시보드/수업관리/학생·모둠관리/배지/개인설정), `StudentDashboard`(AppShell + 홈/모둠공간/개인설정), `teacher/*`(QuestionDashboard·LessonManager·GroupManager·BadgeManager·TeacherSettings), `student/*`(LessonRoom·GroupRoom)
- `lib/` — `api`(함수 호출 래퍼), `teacherApi`·`studentApi`(도메인 래퍼), `session`, `supabase`(anon), `studentData`(anon 읽기), `confetti`(새싹 지급 초록 폭죽), `imageCompress`
- `hooks/useRealtime.ts`

### UI 관례
- 교사·학생 대시보드는 **AppShell로 통일**(같은 사이드바·폴드).
- `AppShell`은 **좌측 메뉴 + 우측 배너** 두 개를 갖는다. 우측 배너(`rightPanel`)는 좌측과 같은 종이접기 폴드를 방향만 반대로 쓴다. 학생 화면에서는 홈·수업에서 **내 배지·모둠 랭킹**, 모둠 공간에서 **모둠원·모둠 배지**를 띄운다. 모둠 공간의 정보는 `GroupRoom`이 `onSideData`로 부모에 올려 보내고 `StudentDashboard`가 그린다.
- **학생은 수업에 들어가도 AppShell 안에 머문다**(메뉴·우측 배너 유지). 수업 목록으로 돌아가는 버튼은 `LessonRoom` 안이 아니라 **상단 바(`topLeftExtra`)의 초록 버튼**이다.
- 수업 목록은 **가로 스크롤 카드뷰**. 질문 카드·수업 카드는 호버 시 연두 파스텔 그라데이션 테두리 + 살짝 떠오르는 질감(`.q-card`, `.lesson-card` — `src/index.css`). `prefers-reduced-motion`에서는 움직임을 뺀다.
- 새 질문 만들기 버튼은 **화면 하단 고정 하나만** 둔다(예전에 위·아래 두 개가 있었다). 누르면 작성칸이 열리며 그 위치로 부드럽게 스크롤된다.
- 하트·댓글은 이모지 대신 **`components/icons`의 라인 SVG**.
- 교사 수업 선택은 드롭다운이 아니라 **상단 수업 버튼 필터**.
- 학생 질문은 **카드뷰(하트·댓글 수만) → 탭하면 아래로 댓글 펼침**.
- 새싹 지급 버튼 클릭 시 클릭 위치에서 **초록 컨페티**.
- 공통 클래스(`.input`, `.btn-primary`, `.card` 등)는 `src/index.css`의 `@layer components`. **Tailwind v4**이므로 important는 접미사(`class!`), 접두사 `!class`는 안 됨 — 되도록 override 대신 inline style이나 전용 클래스 사용.
- 파괴적 동작(학생·수업·모둠·배지 삭제, 새싹 취소, 코드 재발급, 아이템 판매)은 `confirm` 확인창.

## 게이미피케이션 상세

- **댓글이 답변을 대체**: 질문(익명) 아래 인스타식 실명 댓글. 교사가 좋은 댓글에 새싹 2 지급/반려(피드백), 학생은 반려 시 수정 가능.
- **하트**: 다른 학생 질문에 1인 1회 → 질문 작성자에게 보너스 새싹(상한까지).
- **모둠**: 교사가 학생을 모둠에 배정. 개별→모둠→학급 새싹 집계·랭킹.
- **모둠 공간**(`GroupRoom` + `room.js`): 보유 새싹(지갑)으로 상점 아이템 구매 → **1점 투시 방**에 **드래그 앤 드롭으로 자유 배치**. 다른 모둠 구경 가능, 우리 모둠만 편집. 구매는 **확인 팝업**(아이템 그림·이름·"구매할래요!")을 거친다.
  - **방 구조**: 정면 벽(가운데 직사각형)을 중심으로 천장·바닥·좌벽·우벽 네 사다리꼴이 화면 네 모서리로 뻗는다. 다섯 면이 빈틈없이 화면을 채우며, 사용자 쪽만 뚫려 있다. 상수는 `BACK_L/R/T/B` 넷뿐이고 clip-path 는 전부 여기서 파생된다 — **하나를 바꾸면 다섯 면이 함께 움직이므로 개별 polygon 을 손대지 말 것.**
  - **좌표는 격자가 아니라 공간 내 비율(0~100)**이고, **바닥·벽·천장 어디에나 놓을 수 있다**(창문·액자·선반은 벽에). 어느 면인지는 **좌표만으로 판정**한다(`FACES` + `surfaceAt()`) — 면 정보를 따로 저장하지 않으므로 DB 컬럼이 필요 없다. 판정용 다각형은 clip-path 와 **같은 좌표**를 써야 그림과 어긋나지 않는다.
  - 바닥에 놓인 것은 그 지점에 "서고"(`translate(-50%,-100%)` + 그림자), 벽·천장에 붙인 것은 그 지점을 중심으로 "걸린다"(`translate(-50%,-50%)`, 그림자 없음). `depthScaleAt()`이 면마다 다른 방식으로 심도를 계산한다(바닥은 y, 좌우 벽은 x, 정면 벽은 일정).
  - 바닥 격자선은 SVG(`preserveAspectRatio="none"` + `non-scaling-stroke`)로 그린다 — CSS gradient/skew 로는 선 두께가 왜곡된다.
  - **회전은 2D 시계방향이 아니라 세로축 기준 3D 회전**(`perspective() rotateY()`)이다. 물건이 제자리에서 옆으로 돌아서는 느낌이라야 한다. 조작은 **가로 드래그**로 매핑한다(`ROTATE_PX_PER_TURN`).
  - 아이템은 **위치(x·y) · 크기(scale 0.5~2.5) · 방향(rotation 0~360)** 세 값을 갖는다(011). 아이템을 톡 누르면 크기(⤢)·회전(↻) 손잡이가 나오고, 끌어서 조절한다. 세 값 모두 `move` 액션 하나로 함께 저장된다.
  - **아이템은 진짜 3D 모형**(`components/RoomItem3D`)이다. 이모지가 아니라 preserve-3d 로 6면을 세운 직육면체(`Cuboid`) 여러 개를 조립하므로 rotation(세로축 rotateY)을 걸면 옆·뒤가 실제로 보인다. 상점 그리드·구매확인 팝업에서는 `spin` 으로 360° 자동 회전(reduced-motion 이면 정지). 새 상점 아이템을 추가하면 `shop.js` 카탈로그와 함께 `RoomItem3D` 의 `Model` switch 에 모형을 추가해야 한다(없으면 기본 상자로 렌더).
  - **모든 변경은 "끌기 → 확인/취소"**. 확인 전에는 서버에 저장하지 않는다. 확인을 누르면 선택 테두리가 사라지고, 화면은 새 상태를 유지한 채(`localPos` 임시 값) 저장만 뒤에서 진행된다 — **서버 응답을 기다려 아이템이 뒤늦게 움직이는 지연이 없어야 한다.** 저장 중에도 계속 만질 수 있게 `editable` 은 `busy` 와 무관하다.
  - 상점은 별도 섹션이 아니라 **방 안 좌하단 버튼 → 팝업**(`ShopModal`)이다. 구매를 확정하면 팝업이 닫혀 새 아이템이 바로 보인다.
- **모둠 채팅**(`group_chat`): 우리 모둠에서만 보이고 쓸 수 있다. 댓글과 같은 이유로 이름·아바타를 행에 **비정규화 저장**하며, 프로필 사진을 바꾸면 기존 댓글과 함께 채팅 아바타도 서버에서 갱신한다.
- **배지**: 교사가 등록(이미지+이름+조건) 후 조건 충족 학생에게 **수동 부여**. 학생 홈(내 배지)·모둠 공간(모둠 배지 전시)에 표시.

## 환경 변수 (`.env`, git 제외)

```env
# 브라우저 노출 — VITE_ 접두사 필수
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
# 서버(함수) 전용 — VITE_ 접두사 금지
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
TEACHER_CODE=0822
```

배포 시 Netlify 대시보드 **Environment variables**에 같은 5개를 등록해야 한다(.env는 커밋 안 됨). service_role 키는 절대 클라이언트/커밋에 노출 금지 — 공개됐다면 Supabase에서 재발급(rotate).

## 이 프로젝트만의 함정

- **`npm run dev`(vite만)로는 로그인이 안 된다.** 함수가 필요하므로 반드시 **`npm start`(netlify dev)**.
- **스키마 변경은 사용자가 SQL Editor에서 직접 실행**해야 한다(service_role로 DDL 불가). 마이그레이션 추가 시 순서·필수 여부를 명확히 안내할 것. 003을 안 돌리면 학생 로그인부터 깨진다.
- `alter publication ... add table`을 재실행하면 `already member of publication` 에러가 나는데 무시 가능.
- 상점 가격은 서버(`shop.js`)가 진실 소스 — 구매는 서버에서 가격·지갑을 검증한다. 프론트 표시는 `room.catalog()`로 서버에서 받아온다(중복 정의 금지).
- **`src/lib/api.ts`의 `callFn`은 `/.netlify/functions/<name>`을 직접 호출한다.** netlify.toml에 `/api/* → /.netlify/functions/:splat` 리라이트가 있지만 프론트는 안 쓴다(사실상 사문). 새 호출도 `callFn`을 통할 것.
- PostgREST 는 한 번에 **1000행**만 준다. 전체를 확실히 읽어야 하면 `admin.js`의 **`fetchAll()`** 페이지 루프를 쓸 것(`seed-report`가 이 방식).
- `verifyStudent`가 돌려주는 학생 행에는 **로그인 `code`가 포함**돼 있다. 응답에 `me`를 통째로 실어보내면 코드가 유출된다 — 필드를 반드시 골라 담을 것(`student-login.js` 참고).
- Storage 업로드는 3곳(학생/교사 아바타 `avatars`, 배지 `badges`) 모두 같은 레시피: dataURL 정규식 파싱 → **2MB 초과는 400** → `upsert:true` → public URL에 `?v=Date.now()` 캐시버스터를 붙여 **DB에 저장**. 배지는 이미지 검증을 배지 생성 *전에* 해서, 실패 시 배지만 덩그러니 남지 않게 한다.
- 브라우저 확장(claude-in-chrome) 미연결이면 UI는 자동 검증 불가 → 사용자 직접 확인이 필요.

## 디자인

Stitch MCP로 시안 생성 후 그 방향(그린/화이트, 사이드바, 인스타 피드, 원형 프로필)으로 구현. Stitch 프로젝트 `10716207465788847188`, 디자인 시스템 `assets/11724661826935772761`(새싹 그린/화이트).

## 남은 작업

- **교실 실사용 검증**: 마이그레이션 005~007 적용 후 실제 수업에서 30명 동시 접속 확인(하트 연타·댓글 동시 작성·모둠 아이템 동시 구매).
- `submissions.author_id`는 아직 anon-readable 이라, 댓글로 만든 (id → 이름) 지도와 조인하면 **누가 어떤 과제를 냈는지** 알 수 있다. 과제는 익명 대상이 아니라 지금은 감수 중 — 더 조이려면 질문과 같은 qid 방식으로 바꿀 것.
