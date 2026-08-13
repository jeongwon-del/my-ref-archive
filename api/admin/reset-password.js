// POST /api/admin/reset-password (body: { email, newPassword }) → 그 계정의 비밀번호를 관리자가 바꿔준다.
//
// 이 앱은 메일을 보낼 수 없으니, 바뀐 비밀번호는 관리자가 본인에게 직접 알려줘야 한다.

import bcrypt from "bcryptjs";
import { setUserPassword, normalizeEmail } from "../../lib/redis.js";
import { requireAdmin } from "../../lib/auth.js";

const MIN_PASSWORD_LENGTH = 8;

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const adminId = await requireAdmin(req, res);
    if (!adminId) return;

    const email = normalizeEmail(req.body?.email);
    const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";

    if (!email) {
      return res.status(400).json({ error: "email이 필요해요." });
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상으로 만들어주세요.` });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const updated = await setUserPassword(email, passwordHash);
    if (!updated) return res.status(404).json({ error: "그 이메일로 가입한 계정을 찾을 수 없어요." });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("admin reset-password error:", err);
    return res.status(500).json({ error: "처리 중 오류가 발생했어요: " + err.message });
  }
}
