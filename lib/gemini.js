// 링크 저장 시 URL 본문을 가져와 Gemini로 제목/요약/카테고리를 만드는 헬퍼.
// 브라우저가 아니라 서버(Vercel Function)에서만 실행되므로 GEMINI_API_KEY가
// 클라이언트에 노출되지 않는다.

export const CATEGORIES = ['카피/문구', '비주얼/디자인', '브랜드 무드', '마케팅 아이디어', '기타'];
export const CONTENT_TYPES = ['영상', '이미지', '글'];
const GEMINI_MODEL = 'gemini-flash-lite-latest';

// r.jina.ai는 임의의 URL을 읽기 쉬운 텍스트로 바꿔주는 공개 리더 서비스.
export async function fetchPageText(url) {
  const res = await fetch('https://r.jina.ai/' + url);
  if (!res.ok) throw new Error('페이지 내용을 가져오지 못했어요.');
  const text = await res.text();
  return text.slice(0, 6000);
}

export async function analyzeWithGemini(url, pageText) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('서버에 GEMINI_API_KEY가 설정되어 있지 않아요.');

  const prompt = `다음은 웹페이지 URL과 그 본문 내용이에요. 이 내용을 분석해서 아래 JSON 형식으로만 응답하세요.

URL: ${url}

본문:
"""
${pageText}
"""

이 레퍼런스를 저장하는 사람은 브랜드 기획자예요. "aiInsight"는 그 분야(브랜딩/마케팅/디자인/콘텐츠 등 내용에 맞는 분야)의 전문가 입장에서, 단순 요약을 넘어 "이게 왜 흥미로운지" 또는 "브랜드 기획에 어떻게 활용할 수 있는지"에 대한 통찰을 담아주세요.

응답 형식 (다른 설명 없이 이 JSON만 출력):
{"title": "간결한 제목 (한글, 30자 이내)", "summary": "핵심 내용 요약 (한글, 2~3문장)", "category": "다음 5개 중 정확히 하나: ${CATEGORIES.join(', ')}", "type": "레퍼런스의 형식 — 다음 3개 중 정확히 하나: ${CONTENT_TYPES.join(', ')} (유튜브/영상 플랫폼 링크는 영상, 핀터레스트/인스타그램 사진·이미지 갤러리나 이미지 파일 링크는 이미지, 그 외 글/기사/제품페이지 등은 글)", "aiInsight": "전문가 관점의 인사이트 (한글, 2~3문장)"}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 700, responseMimeType: 'application/json' },
      }),
    }
  );

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Gemini API 호출 실패 (${res.status}): ${errBody.slice(0, 200)}`);
  }

  const data = await res.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI 응답을 이해하지 못했어요.');

  const parsed = JSON.parse(jsonMatch[0]);
  if (!CATEGORIES.includes(parsed.category)) parsed.category = '기타';
  if (!CONTENT_TYPES.includes(parsed.type)) parsed.type = '글';
  if (typeof parsed.aiInsight !== 'string' || !parsed.aiInsight.trim()) {
    parsed.aiInsight = '';
  }
  return parsed;
}
