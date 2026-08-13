// POST /api/auth/login (body: { email, password }) → 로그인 쿠키 발급

import bcrypt from "bcryptjs";
import {
  getUserByEmail,
  normalizeEmail,
  isLoginRateLimited,
  recordFailedLogin,
  clearLoginAttempts,
} from "../../lib/redis.js";
import { createSessionCookie } from "../../lib/auth.js";

const WRONG_CREDENTIALS = "이메일 또는 비밀번호가 올바르지 않아요.";
const TOO_MANY_ATTEMPTS = "로그인 시도가 너무 많아요. 15분 후 다시 시도해주세요.";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const email = normalizeEmail(req.body?.email);
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!email || !password) {
      return res.status(401).json({ error: WRONG_CREDENTIALS });
    }

    if (await isLoginRateLimited(email)) {
      return res.status(429).json({ error: TOO_MANY_ATTEMPTS });
    }

    const user = await getUserByEmail(email);
    // 이메일이 없을 때도 비교 시간을 비슷하게 유지해 계정 존재 여부가 새지 않게 한다.
    const matches = await bcrypt.compare(
      password,
      user?.passwordHash || "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv"
    );
    if (!user || !matches) {
      await recordFailedLogin(email);
      return res.status(401).json({ error: WRONG_CREDENTIALS });
    }

    await clearLoginAttempts(email);
    res.setHeader("Set-Cookie", createSessionCookie(user.id));
    return res.status(200).json({ email: user.email });
  } catch (err) {
    console.error("login error:", err);
    return res.status(500).json({ error: "로그인 중 오류가 발생했어요: " + err.message });
  }
}
