// GET /api/archive         → 이 아카이브의 이름 반환
// PUT /api/archive (body: { name }) → 아카이브 이름 저장

import { getArchiveName, setArchiveName } from "../lib/redis.js";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const name = await getArchiveName();
      return res.status(200).json({ name });
    }

    if (req.method === "PUT") {
      const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 40) : "";
      await setArchiveName(name);
      return res.status(200).json({ name });
    }

    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("archive error:", err);
    return res.status(500).json({ error: "처리 중 오류가 발생했어요: " + err.message });
  }
}
