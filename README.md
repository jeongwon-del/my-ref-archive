# My ref archive

URL 레퍼런스를 붙여넣으면 AI가 제목/요약/카테고리를 자동으로 붙여서 저장해주는 개인 아카이브 웹앱.

## 구조

- `public/` — 정적 프론트엔드 (HTML/CSS/JS, 빌드 도구 없음)
- `api/items.js` — 레퍼런스 저장/조회/수정/삭제를 처리하는 Vercel Serverless Function
- `lib/redis.js` — Upstash Redis 읽기/쓰기
- `lib/gemini.js` — 링크 본문 가져오기 + Gemini API로 제목/요약/카테고리 생성

## 배포 전 직접 준비해야 할 것

1. **Google Gemini API 키 발급 (무료, 카드 등록 불필요)**
   - https://aistudio.google.com/apikey 에서 구글 계정으로 로그인해 API 키를 발급받으세요.
2. **Upstash Redis 연동**
   - Vercel 프로젝트의 Marketplace 탭에서 Upstash(Redis)를 추가하면 접속 정보가 자동으로 연결됩니다.
3. **Vercel에 이 프로젝트 배포**
   - Vercel에서 이 폴더를 새 프로젝트로 배포하세요.
   - Settings → Environment Variables 에 `GEMINI_API_KEY`를 등록하세요.
   - (Upstash를 Marketplace로 연동했다면 Redis 관련 값은 자동으로 채워집니다.)

## 로컬에서 테스트하기

```
npm install
cp .env.local.example .env.local   # 그 다음 .env.local에 실제 값 입력
npm run dev
```

브라우저에서 안내된 주소로 접속해 링크를 저장해보면서 확인하세요.
