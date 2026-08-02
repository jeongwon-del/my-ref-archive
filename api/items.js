// GET    /api/items          → 전체 레퍼런스 목록 반환
// POST   /api/items          (body: { url }) → 링크 분석 후 새 항목 저장
// PATCH  /api/items?id=...   (body: 아래 필드 중 일부) → 항목 수정
//        { myInsight }, { favorite }, { title }, { summary }, { type }, { category }
// DELETE /api/items?id=...   → 항목 삭제

import { getItems, setItems } from "../lib/redis.js";
import { fetchPageText, analyzeWithGemini, CONTENT_TYPES, CATEGORIES } from "../lib/gemini.js";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const items = await getItems();
      return res.status(200).json({ items });
    }

    if (req.method === "POST") {
      const url = (req.body?.url || "").trim();
      if (!url) return res.status(400).json({ error: "url이 필요해요." });

      let parsed;
      try {
        parsed = new URL(url);
      } catch {
        return res.status(400).json({ error: "올바른 URL 형식이 아니에요." });
      }

      const pageText = await fetchPageText(parsed.href);
      const analysis = await analyzeWithGemini(parsed.href, pageText);

      const item = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2),
        url: parsed.href,
        title: analysis.title,
        summary: analysis.summary,
        category: analysis.category,
        type: analysis.type,
        aiInsight: analysis.aiInsight,
        myInsight: "",
        favorite: false,
        createdAt: Date.now(),
      };

      const items = await getItems();
      items.push(item);
      await setItems(items);
      return res.status(200).json({ item });
    }

    if (req.method === "PATCH") {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: "id가 필요해요." });

      const items = await getItems();
      const item = items.find((i) => i.id === id);
      if (!item) return res.status(404).json({ error: "항목을 찾을 수 없어요." });

      if (typeof req.body?.myInsight === "string") item.myInsight = req.body.myInsight;
      if (typeof req.body?.favorite === "boolean") item.favorite = req.body.favorite;
      if (typeof req.body?.title === "string" && req.body.title.trim()) item.title = req.body.title.trim();
      if (typeof req.body?.summary === "string") item.summary = req.body.summary;
      if (CONTENT_TYPES.includes(req.body?.type)) item.type = req.body.type;
      if (CATEGORIES.includes(req.body?.category)) item.category = req.body.category;

      await setItems(items);
      return res.status(200).json({ item });
    }

    if (req.method === "DELETE") {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: "id가 필요해요." });

      const items = await getItems();
      const next = items.filter((i) => i.id !== id);
      await setItems(next);
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("items error:", err);
    return res.status(500).json({ error: "처리 중 오류가 발생했어요: " + err.message });
  }
}
