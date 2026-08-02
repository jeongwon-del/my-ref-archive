// GET /api/settings         → { name, categories } 반환
// PUT /api/settings (body: { name } 와/또는 { categories } 중 있는 것만) → 저장 후 최신 상태 반환

import { getArchiveName, setArchiveName, getCategories, setCategories } from "../lib/redis.js";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const [name, categories] = await Promise.all([getArchiveName(), getCategories()]);
      return res.status(200).json({ name, categories });
    }

    if (req.method === "PUT") {
      if (typeof req.body?.name === "string") {
        await setArchiveName(req.body.name.trim().slice(0, 40));
      }

      if (Array.isArray(req.body?.categories)) {
        const categories = req.body.categories
          .map((c) => (typeof c === "string" ? c.trim() : ""))
          .filter(Boolean)
          .slice(0, 12);
        if (categories.length > 0) await setCategories(categories);
      }

      const [name, categories] = await Promise.all([getArchiveName(), getCategories()]);
      return res.status(200).json({ name, categories });
    }

    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("settings error:", err);
    return res.status(500).json({ error: "처리 중 오류가 발생했어요: " + err.message });
  }
}
