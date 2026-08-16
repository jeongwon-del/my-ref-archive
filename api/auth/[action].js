// POST /api/auth/signup          (body: { email, password }) → 계정 생성 + 로그인 쿠키 발급
// POST /api/auth/login           (body: { email, password }) → 로그인 쿠키 발급
// POST /api/auth/logout          → 세션 쿠키 삭제
// GET  /api/auth/me              → 로그인 상태면 { email, provider, label }, 아니면 401.
// POST /api/auth/change-password (body: { currentPassword, newPassword }) → 본인이 자기 비밀번호 변경
// POST /api/auth/delete-account  (body: { password }) → 본인이 계정+데이터 삭제
//
// Vercel Hobby 플랜은 배포당 서버리스 함수를 12개까지만 허용한다. 그래서 auth 관련
// 라우트들을 [action].js 동적 라우트 하나로 모았다 — URL은 각자 그대로 유지된다.

import bcrypt from "bcryptjs";
import {
  createUser,
  normalizeEmail,
  getUserByEmail,
  getUserById,
  setUserPassword,
  deleteUserAccount,
  isLoginRateLimited,
  recordFailedLogin,
  clearLoginAttempts,
} from "../../lib/redis.js";
import { createSessionCookie, clearSessionCookie, requireAuth } from "../../lib/auth.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const WRONG_CREDENTIALS = "이메일 또는 비밀번호가 올바르지 않아요.";
const TOO_MANY_ATTEMPTS = "로그인 시도가 너무 많아요. 15분 후 다시 시도해주세요.";

async function handleSignup(req, res) {
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

async function handleLogin(req, res) {
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

async function handleLogout(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Set-Cookie", clearSessionCookie());
  return res.status(200).json({ ok: true });
}

async function handleMe(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const userId = requireAuth(req, res);
    if (!userId) return;

    const user = await getUserById(userId);
    if (!user) return res.status(401).json({ error: "로그인이 필요해요." });

    return res.status(200).json({
      email: user.email || null,
      provider: user.provider || "email",
      // 카카오 계정은 이메일이 없으니 화면에 띄울 이름을 대신 내려준다.
      label: user.email || `카카오 · ${user.nickname || "이름 없음"}`,
    });
  } catch (err) {
    console.error("me error:", err);
    return res.status(500).json({ error: "확인 중 오류가 발생했어요: " + err.message });
  }
}

async function handleChangePassword(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const userId = requireAuth(req, res);
    if (!userId) return;

    const user = await getUserById(userId);
    if (!user) return res.status(401).json({ error: "로그인이 필요해요." });
    if (!user.passwordHash) {
      return res.status(400).json({ error: "카카오 로그인 계정은 비밀번호가 없어요." });
    }

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

async function handleDeleteAccount(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const userId = requireAuth(req, res);
    if (!userId) return;

    const user = await getUserById(userId);
    if (!user) return res.status(401).json({ error: "로그인이 필요해요." });

    // 카카오 계정은 확인할 비밀번호가 아예 없다. 브라우저의 확인창이 유일한 관문인 셈인데,
    // 이메일을 받지 않기로 한 이상 본인 확인을 더 걸 수단이 없어서 이대로 둔다.
    if (user.passwordHash) {
      const password = typeof req.body?.password === "string" ? req.body.password : "";

      const matches = await bcrypt.compare(password, user.passwordHash);
      if (!matches) {
        return res.status(401).json({ error: "비밀번호가 올바르지 않아요." });
      }
    }

    await deleteUserAccount(user);

    res.setHeader("Set-Cookie", clearSessionCookie());
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("delete-account error:", err);
    return res.status(500).json({ error: "탈퇴 중 오류가 발생했어요: " + err.message });
  }
}

const HANDLERS = {
  signup: handleSignup,
  login: handleLogin,
  logout: handleLogout,
  me: handleMe,
  "change-password": handleChangePassword,
  "delete-account": handleDeleteAccount,
};

export default async function handler(req, res) {
  const fn = HANDLERS[req.query.action];
  if (!fn) return res.status(404).json({ error: "Not found" });
  return fn(req, res);
}
