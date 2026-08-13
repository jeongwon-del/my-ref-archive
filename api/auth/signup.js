// POST /api/auth/signup (body: { email, password }) → 계정 생성 + 로그인 쿠키 발급

import bcrypt from "bcryptjs";
import { createUser, normalizeEmail } from "../../lib/redis.js";
import { createSessionCookie } from "../../lib/auth.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const email = normalizeEmail(req.body?.email);
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    if (!EMAIL_PATTERN.test(email)) {
      return res.status(400).json({ error: "이메일 형식이 올바르지 않아요." });
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상으로 만들어주세요.` });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await createUser(email, passwordHash);
    if (!user) {
      return res.status(409).json({ error: "이미 가입된 이메일이에요. 로그인해주세요." });
    }

    res.setHeader("Set-Cookie", createSessionCookie(user.id));
    return res.status(200).json({ email: user.email });
  } catch (err) {
    console.error("signup error:", err);
    return res.status(500).json({ error: "가입 중 오류가 발생했어요: " + err.message });
  }
}
