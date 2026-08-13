// Upstash Redis 헬퍼 — 사용자별 레퍼런스 목록/설정과 계정 정보를 읽고 쓴다.
//   refItems:{userId}     : [{ id, url, title, summary, category, memo, favorite, createdAt }]
//   archiveName:{userId}  : "아카이브 이름"
//   categories:{userId}   : ["카피/문구", ...]
//   user:{email}          : { id, email, passwordHash, createdAt }
//   userEmail:{userId}    : "email"  (세션 쿠키의 userId 로 계정을 되찾기 위한 역방향 색인)
//
// 필요한 환경변수: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
// (Vercel Marketplace 에서 Upstash 를 연동하면 KV_REST_API_URL / KV_REST_API_TOKEN
//  이름으로 주입되므로 그쪽도 함께 지원한다)

import { randomUUID } from "node:crypto";
import { Redis } from "@upstash/redis";

const itemsKey = (userId) => `refItems:${userId}`;
const archiveNameKey = (userId) => `archiveName:${userId}`;
const categoriesKey = (userId) => `categories:${userId}`;
const userKey = (email) => `user:${normalizeEmail(email)}`;
const userEmailKey = (userId) => `userEmail:${userId}`;
const loginAttemptsKey = (email) => `loginAttempts:${normalizeEmail(email)}`;

const LOGIN_ATTEMPT_LIMIT = 10;
const LOGIN_ATTEMPT_WINDOW_SEC = 15 * 60;

export const DEFAULT_CATEGORIES = ['카피/문구', '비주얼/디자인', '브랜드 무드', '마케팅 아이디어', '기타'];

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

let client = null;
function getClient() {
  if (!client) {
    const url =
      process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const token =
      process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
      throw new Error(
        "Redis 환경변수가 없습니다 (KV_REST_API_URL/TOKEN 또는 UPSTASH_REDIS_REST_URL/TOKEN)."
      );
    }
    client = new Redis({ url, token });
  }
  return client;
}

// @upstash/redis 는 값을 자동으로 JSON 직렬화/역직렬화한다.
export async function getItems(userId) {
  const data = await getClient().get(itemsKey(userId));
  return Array.isArray(data) ? data : [];
}

export async function setItems(userId, items) {
  await getClient().set(itemsKey(userId), items);
}

export async function getArchiveName(userId) {
  const data = await getClient().get(archiveNameKey(userId));
  return typeof data === "string" ? data : "";
}

export async function setArchiveName(userId, name) {
  await getClient().set(archiveNameKey(userId), name);
}

export async function getCategories(userId) {
  const data = await getClient().get(categoriesKey(userId));
  return Array.isArray(data) && data.length > 0 ? data : DEFAULT_CATEGORIES;
}

export async function setCategories(userId, categories) {
  await getClient().set(categoriesKey(userId), categories);
}

// ---------- 계정 ----------

export async function getUserByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const data = await getClient().get(userKey(normalized));
  return data && typeof data === "object" ? data : null;
}

export async function getUserById(userId) {
  const email = await getClient().get(userEmailKey(userId));
  if (typeof email !== "string" || !email) return null;
  return getUserByEmail(email);
}

// 이미 가입된 이메일이면 null 을 돌려준다 (가입 라우트가 409 로 응답하도록).
export async function createUser(email, passwordHash) {
  const normalized = normalizeEmail(email);
  const user = {
    id: randomUUID(),
    email: normalized,
    passwordHash,
    createdAt: Date.now(),
  };

  // NX 옵션으로 "없을 때만 저장" — 동시에 같은 이메일로 가입해도 한 명만 성공한다.
  const created = await getClient().set(userKey(normalized), user, { nx: true });
  if (!created) return null;

  await getClient().set(userEmailKey(user.id), normalized);
  return user;
}

// ---------- 로그인 시도 제한 (무차별 대입 방어) ----------

export async function isLoginRateLimited(email) {
  const count = await getClient().get(loginAttemptsKey(email));
  return Number(count) >= LOGIN_ATTEMPT_LIMIT;
}

export async function recordFailedLogin(email) {
  const client = getClient();
  const key = loginAttemptsKey(email);
  const count = await client.incr(key);
  if (count === 1) await client.expire(key, LOGIN_ATTEMPT_WINDOW_SEC);
}

export async function clearLoginAttempts(email) {
  await getClient().del(loginAttemptsKey(email));
}
