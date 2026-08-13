// POST /api/auth/change-password (body: { currentPassword, newPassword })
//   → 로그인한 본인이 자기 비밀번호를 바꾼다.
//
// 관리자용 /api/admin/reset-password 와 달리 현재 비밀번호를 반드시 맞혀야 한다.
// (쿠키만 있으면 비밀번호를 갈아끼울 수 있으면, 세션을 훔친 사람이 원래 주인을 쫓아낼 수 있다)

import bcrypt from "bcryptjs";
import { getUserById, setUserPassword } from "../../lib/redis.js";
import { requireAuth } from "../../lib/auth.js";

const MIN_PASSWORD_LENGTH = 8;

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

    const currentPassword =
      typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
    const newPassword =
      typeof req.body?.newPassword === "string" ? req.body.newPassword : "";

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상으로 만들어주세요.` });
    }

    const matches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!matches) {
      return res.status(401).json({ error: "현재 비밀번호가 올바르지 않아요." });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const updated = await setUserPassword(user.email, passwordHash);
    if (!updated) return res.status(404).json({ error: "계정을 찾을 수 없어요." });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("change-password error:", err);
    return res.status(500).json({ error: "변경 중 오류가 발생했어요: " + err.message });
  }
}
