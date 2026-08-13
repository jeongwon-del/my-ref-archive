// POST /api/search (body: { query }) → { ids } 관련도 높은 순서의 레퍼런스 id 배열

import { getItems } from "../lib/redis.js";
import { requireAuth } from "../lib/auth.js";
import { searchItems } from "../lib/gemini.js";

export default async function handler(req, res) {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const query = (req.body?.query || "").trim();
    if (!query) return res.status(400).json({ error: "query가 필요해요." });

    const items = await getItems(userId);
    if (items.length === 0) return res.status(200).json({ ids: [] });

    const ids = await searchItems(query, items);
    return res.status(200).json({ ids });
  } catch (err) {
    console.error("search error:", err);
    return res.status(500).json({ error: "검색 중 오류가 발생했어요: " + err.message });
  }
}
