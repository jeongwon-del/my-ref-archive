// GET /api/auth/me → 로그인 상태면 { email }, 아니면 401.
// 프론트엔드가 첫 화면에서 로그인 폼을 보여줄지 아카이브를 보여줄지 결정하는 데 쓴다.

import { getUserById } from "../../lib/redis.js";
import { requireAuth } from "../../lib/auth.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const userId = requireAuth(req, res);
    if (!userId) return;

    const user = await getUserById(userId);
    if (!user) return res.status(401).json({ error: "로그인이 필요해요." });

    return res.status(200).json({ email: user.email });
  } catch (err) {
    console.error("me error:", err);
    return res.status(500).json({ error: "확인 중 오류가 발생했어요: " + err.message });
  }
}
