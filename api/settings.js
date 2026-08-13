// GET /api/settings         → { name, categories } 반환
// PUT /api/settings (body: { name } 와/또는 { categories } 중 있는 것만) → 저장 후 최신 상태 반환

import { getArchiveName, setArchiveName, getCategories, setCategories } from "../lib/redis.js";
import { requireAuth } from "../lib/auth.js";

export default async function handler(req, res) {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    if (req.method === "GET") {
      const [name, categories] = await Promise.all([getArchiveName(userId), getCategories(userId)]);
      return res.status(200).json({ name, categories });
    }

    if (req.method === "PUT") {
      if (typeof req.body?.name === "string") {
        await setArchiveName(userId, req.body.name.trim().slice(0, 40));
      }

      if (Array.isArray(req.body?.categories)) {
        const categories = req.body.categories
          .map((c) => (typeof c === "string" ? c.trim() : ""))
          .filter(Boolean)
          .slice(0, 12);
        if (categories.length > 0) await setCategories(userId, categories);
      }

      const [name, categories] = await Promise.all([getArchiveName(userId), getCategories(userId)]);
      return res.status(200).json({ name, categories });
    }

    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("settings error:", err);
    return res.status(500).json({ error: "처리 중 오류가 발생했어요: " + err.message });
  }
}
