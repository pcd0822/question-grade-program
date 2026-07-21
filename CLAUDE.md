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
npm run preview  # 프로덕션 빌드 미리보기
```

**`npm run lint`은 동작하지 않는다** — `package.json`에 `eslint .`가 선언돼 있지만 eslint가 devDependency에 없고 설정 파일도 없다. 검증 게이트는 `npm run build` 하나뿐이다.

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
- **질문은 익명**(questions에 이름 없음, author_id는 UUID라 anon이 이름으로 못 바꿈). **댓글은 실명** → 이름·아바타를 comments 행에 **비정규화 저장**해 anon도 표시 가능하게 한다(students를 못 읽으므로). 프로필 사진 변경 시 해당 학생의 기존 댓글 아바타도 서버에서 갱신한다.
- **익명성의 알려진 구멍(교실 신뢰 모델 전제)**: `comments`는 anon-readable이고 `student_id` + `author_name`을 함께 갖는다 → anon이 `student_id → 이름` 맵을 만든 뒤 `questions.author_id`와 조인하면, **댓글을 한 번이라도 단 학생의 질문은 작성자를 역추적할 수 있다.** 또 `room` 함수의 `state` 액션은 무인증 공개라 group UUID만 알면 모둠원 실명·아바타가 나온다. 교실 내부용이라 현재는 감수 중 — 익명성을 강화하려면 이 두 곳부터 손대야 한다.

### 새싹(seed) 회계 — 단일 진실 소스는 `seed_log`
- **개인 누적 새싹 = seed_log 합계**(`sum(amount) where student_id`). 별도 카운터를 비정규화하지 않아 드리프트가 없다.
- **`students.cumulative_seeds` 컬럼은 함정**: DB에 항상 0으로 남아 있는데 `students.js`의 list/add/regenerate가 이 raw 값을 그대로 돌려준다(`teacherApi.Student`에 타입도 있음). `groups.js`만 seed_log 합으로 덮어쓴다. **`teacher.listStudents()`의 `cumulative_seeds`를 UI에 쓰면 0이 뜬다** — 새싹 표시는 반드시 `groups.overview` / `ranking`을 쓸 것. `groups.cumulative_seeds` 컬럼도 아무도 쓰지 않는 사표(死表)다.
- `admin.js`의 **`setSeed({source, refId, amount})`**: 해당 (source, ref_id)의 로그를 목표 금액으로 **재조정**(기존 삭제 후 재삽입 — 멱등). **키는 `(source, ref_id)`뿐**이라 `amount: 0`으로 회수할 땐 studentId/lessonId를 생략해도 된다. 지급/취소/반려/하트변동이 전부 이걸로 처리된다.
- 지급 규칙: **질문 1 · 댓글 2 · 하트 보너스 1개**(질문당 상한 `lessons.heart_bonus_cap`, 기본 3). 상수는 `admin.js`의 `SEED = {QUESTION:1, ANSWER:2, HEART:1}` — 댓글 새싹이 레거시 이름 **`SEED.ANSWER`**를 재사용한다(값은 맞음, 이름만 옛날 것). 취소·반려·삭제 시 로그 제거로 회수.
- 하트 보너스는 질문당 **로그 1행**(`source:'heart', ref_id: questionId`)으로 유지되고, 하트를 누를 때마다 현재 하트 수를 세어 `min(count, cap) * 1`로 재계산한다(`student-actions.js`). 하트 취소도 자동 반영.
- **두 값**: ① **누적**(랭킹 기준, 교사 정정 외에는 감소 안 함) = seed_log 합. ② **보유(모둠 지갑)** = 모둠 누적 − `groups.spent_seeds`(아이템 구매로 증가). 아이템을 사도 랭킹(누적)은 안 떨어진다.
- 모둠/학급 집계는 서버에서 현재 소속으로 계산한다(`ranking.js`, `groups.js`의 `sumSeedByStudent`). anon은 students를 못 읽으므로 클라이언트에서 모둠 집계를 하지 않는다.

### 실시간 반영
`src/hooks/useRealtime.ts`가 지정 테이블 변경을 구독해 refetch(150ms 디바운스). 교사가 새싹을 누르면 학생 화면에 곧 반영. Realtime은 RLS를 존중하므로 **students는 publication에 없다**.

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

주요 테이블:
- **groups**(name, spent_seeds) — 지갑 차감 누적. 모둠 누적/보유는 seed_log에서 계산.
- **students**(student_no, name, **code**, group_id, avatar_url) — RLS로 anon 전면 차단.
- **lessons**(title, period_label, content=제시문, task=과제, **stage**=factual/divergent/meta/creative, stage_guide, heart_bonus_cap, active)
- **questions**(lesson_id, author_id, text, seed_granted) — 익명
- **comments**(question_id, author_type=student/teacher, student_id, **author_name·author_avatar_url 비정규화**, text, status=normal/approved/rejected, teacher_feedback) — **답변(answers)을 대체.** 실명. 여러 개 가능. 교사 댓글도 여기.
- **hearts**(question_id, student_id) — 질문당 1인 1회 unique
- **submissions**(lesson_id, author_id, text) — 과제 답변, 수업당 1개 unique
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
- `lessons` — 교사: 수업 CRUD/활성 토글
- `student-actions` — 학생: 질문 등록, 댓글 작성·수정·삭제, 하트 토글, 과제 제출, 프로필 사진(set-avatar)
- `teacher-actions` — 교사: 질문 새싹, 댓글 새싹/반려, 교사 댓글 작성·삭제
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
- **모둠 공간**(`GroupRoom` + `room.js`): 보유 새싹(지갑)으로 상점 아이템 구매 → 8×5 격자에 배치(탭 이동·판매 환불). 다른 모둠 구경 가능, 우리 모둠만 편집. 모둠 배지 전시.
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
- **`AppShell`은 렌더 중 `window.innerWidth`를 읽고 resize 리스너가 없다.** 사이드바 초기 상태·본문 마진이 창 크기 변경에 반응하지 않는다(다른 state 변경 전까지). 반응형 버그처럼 보이면 여기부터 보라.
- `groups.spent_seeds`는 `room.js`에서 **read-modify-write**로 갱신된다(원자적 아님). 같은 모둠원이 동시에 사면 차감 하나가 유실될 수 있다.
- `admin.js`의 `sumSeedByStudent()`는 `seed_log` **전체를 필터·페이지네이션 없이** 읽는다. 학급 규모(17~18명 / 4차시)에선 문제없지만 PostgREST 기본 1000행 상한에 걸릴 수 있음을 알아둘 것.
- `verifyStudent`가 돌려주는 학생 행에는 **로그인 `code`가 포함**돼 있다. 응답에 `me`를 통째로 실어보내면 코드가 유출된다 — 필드를 반드시 골라 담을 것(`student-login.js` 참고).
- Storage 업로드는 3곳(학생/교사 아바타 `avatars`, 배지 `badges`) 모두 같은 레시피: dataURL 정규식 파싱 → 2MB 제한 → `upsert:true` → public URL에 `?v=Date.now()` 캐시버스터를 붙여 **DB에 저장**. 단 `badges.js`는 2MB 초과 시 400이 아니라 **이미지를 조용히 버리고** 배지를 생성한다.
- 브라우저 확장(claude-in-chrome) 미연결이면 UI는 자동 검증 불가 → 사용자 직접 확인이 필요.

## 디자인

Stitch MCP로 시안 생성 후 그 방향(그린/화이트, 사이드바, 인스타 피드, 원형 프로필)으로 구현. Stitch 프로젝트 `10716207465788847188`, 디자인 시스템 `assets/11724661826935772761`(새싹 그린/화이트).

## 남은 작업

- 새싹 획득 내역 **상세 CSV 내보내기**(형성평가 증빙: 학생별 언제·무엇으로 받았는지). 현재는 학생 명단 CSV(학번·이름·코드·모둠·누적)만 있음.
