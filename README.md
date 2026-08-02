# My ref archive

URL 레퍼런스를 붙여넣으면 AI가 제목/요약/카테고리를 자동으로 붙여서 저장해주는 개인 아카이브 웹앱.

---

## 🚀 나만의 아카이브 만들기 (이 앱을 받으신 분은 여기부터 보세요)

아래 버튼 하나로, **나만 쓰는 완전히 독립된 아카이브**를 무료로 만들 수 있어요. 다른 사람이 저장한 내용과는 전혀 섞이지 않고, 매달 나가는 비용도 없어요 (전부 무료 요금제 안에서 해결돼요).

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fjeongwon-del%2Fmy-ref-archive&env=GEMINI_API_KEY&envDescription=AI+%EB%B6%84%EC%84%9D%EC%97%90+%EC%93%B0%EC%9D%B4%EB%8A%94+Gemini+API+%ED%82%A4+%28%EB%AC%B4%EB%A3%8C%2C+%EC%B9%B4%EB%93%9C+%EB%93%B1%EB%A1%9D+%EB%B6%88%ED%95%84%EC%9A%94%29&envLink=https%3A%2F%2Faistudio.google.com%2Fapikey&project-name=my-ref-archive&repository-name=my-ref-archive)

### 준비물: Gemini API 키 (무료, 카드 등록 필요 없음)

버튼을 누르면 중간에 "GEMINI_API_KEY를 입력하라"는 화면이 나와요. 그때 필요한 키를 미리 만들어두면 편해요.

1. **https://aistudio.google.com/apikey** 로 접속하세요.
2. 평소 쓰는 구글 계정으로 로그인하세요.
3. **"Create API key"**(API 키 만들기) 버튼을 누르세요. 새 프로젝트를 만들지 물어보면 그냥 기본값으로 진행하면 돼요 (의미 없는 절차예요).
4. `AQ.`로 시작하는 긴 문자열이 나오면 복사해두세요. 이 화면에서 카드 등록 창은 절대 뜨지 않아요.

### 순서

1. 위 **"Deploy with Vercel"** 버튼 클릭
2. Vercel 로그인 화면이 나오면 구글 계정으로 가입/로그인 (무료)
3. "Create Git Repository" 같은 화면이 나오면 그대로 진행 — 여러분 GitHub 계정에 이 앱의 코드 사본이 하나 만들어져요 (이후 서로 영향 안 줌)
4. **Environment Variables** 항목에 `GEMINI_API_KEY`를 붙여넣으라고 나와요 → 위에서 복사해둔 키를 붙여넣기
5. **Deploy** 버튼 클릭 → 1~2분 기다리면 완료. 화면에 나온 주소로 들어가면 바로 앱이 보여요.
6. (마지막 한 단계) 링크 저장이 안 되고 오류가 뜨면, 저장 공간(Upstash Redis)이 아직 안 붙어있어서예요:
   - Vercel 사이트에서 방금 만든 프로젝트로 들어가기
   - 상단 **Storage** 탭 → **Upstash**(또는 KV) 추가 → 무료 요금제로 연결
   - 연결 후 **Deploy** 탭에서 최신 배포를 한 번 더 **Redeploy** 하면 끝

이제 이 주소는 여러분만의 아카이브예요. 저장한 내용은 저(정원)를 포함해 아무도 못 봐요.

---

## 구조 (개발 참고용)

- `public/` — 정적 프론트엔드 (HTML/CSS/JS, 빌드 도구 없음)
- `api/items.js` — 레퍼런스 저장/조회/수정/삭제를 처리하는 Vercel Serverless Function
- `lib/redis.js` — Upstash Redis 읽기/쓰기
- `lib/gemini.js` — 링크 본문 가져오기 + Gemini API로 제목/요약/카테고리 생성

## 로컬에서 테스트하기

```
npm install
cp .env.local.example .env.local   # 그 다음 .env.local에 실제 값 입력
npm run dev
```

브라우저에서 안내된 주소로 접속해 링크를 저장해보면서 확인하세요.
