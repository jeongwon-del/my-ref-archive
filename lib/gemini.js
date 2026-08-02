// 링크 저장 시 URL 본문을 가져와 Gemini로 제목/요약/카테고리를 만드는 헬퍼.
// 브라우저가 아니라 서버(Vercel Function)에서만 실행되므로 GEMINI_API_KEY가
// 클라이언트에 노출되지 않는다.

export const CONTENT_TYPES = ['영상', '이미지', '글'];
const GEMINI_MODEL = 'gemini-flash-lite-latest';

// r.jina.ai는 임의의 URL을 읽기 쉬운 텍스트로 바꿔주는 공개 리더 서비스.
export async function fetchPageText(url) {
  const res = await fetch('https://r.jina.ai/' + url);
  if (!res.ok) throw new Error('페이지 내용을 가져오지 못했어요.');
  const text = await res.text();
  return text.slice(0, 6000);
}

export async function analyzeWithGemini(url, pageText, categories) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('서버에 GEMINI_API_KEY가 설정되어 있지 않아요.');

  const prompt = `다음은 웹페이지 URL과 그 본문 내용이에요. 이 내용을 분석해서 아래 JSON 형식으로만 응답하세요.

URL: ${url}

본문:
"""
${pageText}
"""

이 레퍼런스를 저장하는 사람은 아래 카테고리 목록을 기준으로 레퍼런스를 정리하고 있어요. "aiInsight"는 이 내용이 왜 흥미로운지, 어떻게 참고할 수 있는지에 대한 전문가 관점의 통찰을 담아주세요.

응답 형식 (다른 설명 없이 이 JSON만 출력):
{"title": "간결한 제목 (한글, 30자 이내)", "summary": "핵심 내용 요약 (한글, 2~3문장)", "category": "다음 ${categories.length}개 중 정확히 하나: ${categories.join(', ')}", "type": "레퍼런스의 형식 — 다음 3개 중 정확히 하나: ${CONTENT_TYPES.join(', ')} (유튜브/영상 플랫폼 링크는 영상, 핀터레스트/인스타그램 사진·이미지 갤러리나 이미지 파일 링크는 이미지, 그 외 글/기사/제품페이지 등은 글)", "aiInsight": "전문가 관점의 인사이트 (한글, 2~3문장)"}`;

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
  if (!categories.includes(parsed.category)) parsed.category = categories[categories.length - 1];
  if (!CONTENT_TYPES.includes(parsed.type)) parsed.type = '글';
  if (typeof parsed.aiInsight !== 'string' || !parsed.aiInsight.trim()) {
    parsed.aiInsight = '';
  }
  return parsed;
}

// 저장된 레퍼런스 중, 자연어 요청과 관련 있는 것만 관련도 순으로 골라준다.
export async function searchItems(query, items) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('서버에 GEMINI_API_KEY가 설정되어 있지 않아요.');

  const list = items.map((i) => ({
    id: i.id,
    title: i.title,
    summary: (i.summary || '').slice(0, 300),
    category: i.category,
    aiInsight: (i.aiInsight || '').slice(0, 300),
  }));

  const prompt = `아래는 사용자가 저장해둔 레퍼런스 목록이에요. 사용자의 요청과 관련 있는 레퍼런스만 골라, 관련도가 높은 순서로 id를 나열하세요. 관련 있는 게 하나도 없으면 빈 배열을 반환하세요.

사용자 요청: "${query}"

레퍼런스 목록 (JSON):
${JSON.stringify(list)}

응답 형식 (다른 설명 없이 이 JSON만 출력):
{"ids": ["관련도 높은 순서의 id 배열"]}`;

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
        generationConfig: { maxOutputTokens: 500, responseMimeType: 'application/json' },
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
  const validIds = new Set(items.map((i) => i.id));
  return Array.isArray(parsed.ids) ? parsed.ids.filter((id) => validIds.has(id)) : [];
}
