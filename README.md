# My ref archive

URL 레퍼런스를 붙여넣으면 AI가 제목/요약/카테고리를 자동으로 붙여서 저장해주는 레퍼런스 아카이브 웹앱.

---

## ✅ 바로 쓰기 (이 앱을 받으신 분은 여기부터 보세요)

**https://my-ref-archive.vercel.app** 에 접속해서 이메일+비밀번호로 회원가입만 하면 끝이에요. 따로 배포하거나 API 키를 발급받을 필요가 없어요.

- 회원가입하면 그 순간부터 **나만의 아카이브**가 생겨요. 다른 사람이 저장한 링크는 안 보이고, 내가 저장한 링크도 다른 사람에겐 안 보여요.
- 비밀번호를 잊어버리면 아직 "비밀번호 찾기" 기능이 없으니, 정원(garden@decode.im)에게 알려주세요.

---

## 🚀 완전히 독립된 나만의 인스턴스가 필요하다면

여럿이 아니라 **온전히 나 혼자만 쓸 별도 사본**을 원한다면 (예: 회사 전체가 아니라 개인 프로젝트로), 아래 버튼으로 무료로 새 인스턴스를 만들 수 있어요. 위 공용 사이트와는 완전히 분리돼요.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fjeongwon-del%2Fmy-ref-archive&env=GEMINI_API_KEY,SESSION_SECRET&envDescription=GEMINI_API_KEY%EB%8A%94%20%EC%95%84%EB%9E%98%20%EC%95%88%EB%82%B4%EB%8C%80%EB%A1%9C%20%EB%B0%9C%EA%B8%89%ED%95%98%EA%B3%A0%2C%20SESSION_SECRET%EC%9D%80%20%EC%95%84%EB%AC%B4%20%EA%B8%B4%20%EB%AC%B8%EC%9E%90%EC%97%B4%EC%9D%B4%EB%82%98%20%EB%84%A3%EC%9C%BC%EB%A9%B4%20%EB%8F%BC%EC%9A%94&envLink=https%3A%2F%2Faistudio.google.com%2Fapikey&project-name=my-ref-archive&repository-name=my-ref-archive)

### 준비물 1: Gemini API 키 (무료, 카드 등록 필요 없음)

1. **https://aistudio.google.com/apikey** 로 접속하세요.
2. 평소 쓰는 구글 계정으로 로그인하세요.
3. **"Create API key"**(API 키 만들기) 버튼을 누르세요. 새 프로젝트를 만들지 물어보면 그냥 기본값으로 진행하면 돼요 (의미 없는 절차예요).
4. `AQ.`로 시작하는 긴 문자열이 나오면 복사해두세요. 이 화면에서 카드 등록 창은 절대 뜨지 않아요.

### 준비물 2: SESSION_SECRET (로그인 세션을 지키는 비밀 값)

의미 있는 값일 필요 없어요. 그냥 아무도 모르는 긴 문자열이면 충분해요. 예를 들어 키보드를 아무렇게나 30자 이상 눌러서 만들거나, 비밀번호 생성기로 만든 긴 문자열을 써도 돼요.

### 순서

1. 위 **"Deploy with Vercel"** 버튼 클릭
2. Vercel 로그인 화면이 나오면 구글 계정으로 가입/로그인 (무료)
3. "Create Git Repository" 같은 화면이 나오면 그대로 진행 — 여러분 GitHub 계정에 이 앱의 코드 사본이 하나 만들어져요 (이후 서로 영향 안 줌)
4. **Environment Variables** 항목에 `GEMINI_API_KEY`, `SESSION_SECRET` 두 개를 입력하라고 나와요 → 위에서 준비한 값을 각각 붙여넣기
5. **Deploy** 버튼 클릭 → 1~2분 기다리면 완료. 화면에 나온 주소로 들어가면 로그인/회원가입 화면이 보여요.
6. (마지막 한 단계) 회원가입이 안 되고 오류가 뜨면, 저장 공간(Upstash Redis)이 아직 안 붙어있어서예요:
   - Vercel 사이트에서 방금 만든 프로젝트로 들어가기
   - 상단 **Storage** 탭 → **Upstash**(또는 KV) 추가 → 무료 요금제로 연결
   - 연결 후 **Deploy** 탭에서 최신 배포를 한 번 더 **Redeploy** 하면 끝

이제 이 주소는 완전히 독립된 인스턴스예요. 원한다면 여기서도 다시 여러 사람이 각자 회원가입해서 같이 쓸 수 있어요.

---

## 구조 (개발 참고용)

- `public/` — 정적 프론트엔드 (HTML/CSS/JS, 빌드 도구 없음)
- `api/items.js`, `api/settings.js`, `api/search.js` — 로그인한 사용자 본인의 레퍼런스/설정을 처리하는 Vercel Serverless Function (모두 `requireAuth`로 보호됨)
- `api/auth/` — 회원가입/로그인/로그아웃/로그인 상태 확인
- `lib/redis.js` — Upstash Redis 읽기/쓰기 (사용자별 네임스페이스 키 사용)
- `lib/auth.js` — 로그인 세션 쿠키 발급/검증 (HMAC 서명)
- `lib/gemini.js` — 링크 본문 가져오기 + Gemini API로 제목/요약/카테고리 생성

## 로컬에서 테스트하기

```
npm install
cp .env.local.example .env.local   # 그 다음 .env.local에 실제 값 입력 (SESSION_SECRET도 포함)
npm run dev
```

브라우저에서 안내된 주소로 접속해 회원가입부터 해보면서 확인하세요.
