// POST /api/auth/delete-account (body: { password })
//   → 로그인한 본인이 자기 계정과 저장한 레퍼런스를 모두 지운다.
//
// change-password 와 같은 이유로 비밀번호를 반드시 맞혀야 한다.
// (쿠키만 훔친 사람이 원래 주인의 데이터를 통째로 날려버릴 수 있으면 안 된다)

import bcrypt from "bcryptjs";
import { getUserById, deleteUserAccount } from "../../lib/redis.js";
import { requireAuth, clearSessionCookie } from "../../lib/auth.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const userId = requireAuth(req, res);
    if (!userId) return;

    const user = await getUserById(userId);
    if (!user) return res.status(401).json({ error: "로그인이 필요해요." });

    const password = typeof req.body?.password === "string" ? req.body.password : "";

    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      return res.status(401).json({ error: "비밀번호가 올바르지 않아요." });
    }

    const deleted = await deleteUserAccount(user.email);
    if (!deleted) return res.status(404).json({ error: "계정을 찾을 수 없어요." });

    res.setHeader("Set-Cookie", clearSessionCookie());
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("delete-account error:", err);
    return res.status(500).json({ error: "탈퇴 중 오류가 발생했어요: " + err.message });
  }
}
