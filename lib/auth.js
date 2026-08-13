// 세션 쿠키 헬퍼 — HMAC-SHA256 으로 서명한 "payload.signature" 형태의 쿠키를 쓴다.
// payload 안에는 userId 와 만료 시각만 들어있고, 서명이 맞아야만 신뢰한다.
//
// 필요한 환경변수: SESSION_SECRET (아무도 모르는 긴 임의 문자열)

import { createHmac, timingSafeEqual } from "node:crypto";
import { parseCookie, stringifySetCookie } from "cookie";

const COOKIE_NAME = "session";
const MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30일

// 모든 쿠키에 공통으로 붙는 보안 옵션.
// httpOnly: 자바스크립트로 못 읽음 / secure: https 에서만 전송 / sameSite lax: 외부 사이트발 요청에 안 실림
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
};

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET 환경변수가 없습니다.");
  }
  return secret;
}

function sign(payload) {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

function signatureMatches(payload, signature) {
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(String(signature || ""));
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}

export function createSessionCookie(userId) {
  const payload = Buffer.from(
    JSON.stringify({ userId, expiresAt: Date.now() + MAX_AGE_SEC * 1000 })
  ).toString("base64url");

  return stringifySetCookie({
    name: COOKIE_NAME,
    value: `${payload}.${sign(payload)}`,
    maxAge: MAX_AGE_SEC,
    ...COOKIE_OPTIONS,
  });
}

export function clearSessionCookie() {
  return stringifySetCookie({
    name: COOKIE_NAME,
    value: "",
    maxAge: 0,
    ...COOKIE_OPTIONS,
  });
}

// 유효한 쿠키면 userId, 아니면 null.
export function verifySession(req) {
  const raw = parseCookie(req.headers?.cookie || "")[COOKIE_NAME];
  if (!raw) return null;

  const separator = raw.lastIndexOf(".");
  if (separator < 1) return null;

  const payload = raw.slice(0, separator);
  const signature = raw.slice(separator + 1);
  if (!signatureMatches(payload, signature)) return null;

  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (!parsed?.userId || typeof parsed.userId !== "string") return null;
  if (typeof parsed.expiresAt !== "number" || parsed.expiresAt < Date.now()) return null;

  return parsed.userId;
}

// 로그인 안 된 요청이면 401 을 보내고 null 을 돌려준다. 호출한 쪽은 null 이면 바로 return.
export function requireAuth(req, res) {
  const userId = verifySession(req);
  if (!userId) {
    res.status(401).json({ error: "로그인이 필요해요." });
    return null;
  }
  return userId;
}
