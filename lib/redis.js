// Upstash Redis 헬퍼 — 사용자별 레퍼런스 목록/설정과 계정 정보를 읽고 쓴다.
//   refItems:{userId}     : [{ id, url, title, summary, category, memo, favorite, createdAt }]
//   archiveName:{userId}  : "아카이브 이름"
//   categories:{userId}   : ["카피/문구", ...]
//   user:{email}          : { id, email, passwordHash, createdAt }
//   user:kakao:{kakaoId}  : { id, kakaoId, nickname, provider: "kakao", createdAt }
//   userEmail:{userId}    : "email" 또는 "kakao:{kakaoId}"
//                           (세션 쿠키의 userId 로 계정을 되찾기 위한 역방향 색인.
//                            카카오 로그인이 생기면서 이메일 말고도 담게 됐지만,
//                            기존 데이터를 그대로 쓰려고 키 이름은 바꾸지 않았다)
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
const kakaoUserKey = (kakaoId) => `user:kakao:${kakaoId}`;
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

// 역방향 색인에 담긴 값은 이메일이거나 "kakao:{id}" 다. 둘 다 앞에 "user:" 만 붙이면
// 바로 계정 키가 되므로, 이메일 정규화를 거치지 않고 그대로 조회한다
// (카카오 아이디는 소문자로 바꾸면 안 되는 값이라 getUserByEmail 을 타지 않는다).
export async function getUserById(userId) {
  const accountId = await getClient().get(userEmailKey(userId));
  if (typeof accountId !== "string" || !accountId) return null;
  const data = await getClient().get(`user:${accountId}`);
  return data && typeof data === "object" ? data : null;
}

export async function getUserByKakaoId(kakaoId) {
  if (!kakaoId) return null;
  const data = await getClient().get(kakaoUserKey(kakaoId));
  return data && typeof data === "object" ? data : null;
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

// 카카오는 "가입"과 "로그인"이 같은 흐름이라, 처음 온 사람이면 만들고 이미 있으면 그대로 돌려준다.
// createUser 와 같은 NX 방식이라 동시에 두 번 눌러도 계정이 두 개 생기지 않는다.
export async function findOrCreateKakaoUser(kakaoId, nickname) {
  const key = kakaoUserKey(kakaoId);
  const user = {
    id: randomUUID(),
    kakaoId: String(kakaoId),
    nickname,
    provider: "kakao",
    createdAt: Date.now(),
  };

  const created = await getClient().set(key, user, { nx: true });
  if (!created) return getClient().get(key);

  await getClient().set(userEmailKey(user.id), `kakao:${kakaoId}`);
  return user;
}

// ---------- 관리자용 계정 관리 ----------

// user:* 키를 훑어 가입자 목록을 만든다. passwordHash 는 절대 밖으로 내보내지 않는다.
// (userEmail:{userId} 는 "user:" 로 시작하지 않으므로 이 패턴에 걸리지 않고,
//  카카오 계정의 user:kakao:{id} 는 "user:" 로 시작하니 자연히 함께 걸린다)
export async function listUsers() {
  const client = getClient();
  const keys = new Set();

  let cursor = "0";
  do {
    // SCAN 은 같은 키를 두 번 돌려줄 수 있어서 Set 으로 모은다.
    const [next, batch] = await client.scan(cursor, { match: "user:*", count: 100 });
    batch.forEach((key) => keys.add(key));
    cursor = next;
  } while (cursor !== "0");

  const users = await Promise.all(
    [...keys].map(async (key) => {
      const user = await client.get(key);
      if (!user || typeof user !== "object" || !user.id) return null;
      const items = await getItems(user.id);
      return {
        email: user.email,
        provider: user.provider || "email",
        // 카카오 계정은 이메일이 없어서, 화면에 보여줄 이름은 따로 만들어 준다.
        label: user.provider === "kakao" ? `카카오 · ${user.nickname || "이름 없음"}` : user.email,
        // 관리자 페이지가 카카오 계정을 삭제할 때는 이메일이 없으니 이 값으로 찾는다.
        kakaoId: user.kakaoId,
        id: user.id,
        createdAt: user.createdAt,
        itemCount: items.length,
      };
    })
  );

  return users.filter(Boolean).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

// 계정과 그 계정의 모든 데이터를 지운다. 이미 찾아온 사용자 객체를 그대로 넘기면 된다.
export async function deleteUserAccount(user) {
  const accountId =
    user.provider === "kakao" ? `kakao:${user.kakaoId}` : normalizeEmail(user.email);

  const keys = [
    `user:${accountId}`,
    userEmailKey(user.id),
    itemsKey(user.id),
    archiveNameKey(user.id),
    categoriesKey(user.id),
  ];
  // 로그인 시도 횟수는 비밀번호 로그인에만 쌓이니, 카카오 계정에는 지울 것이 없다.
  if (user.provider !== "kakao") keys.push(loginAttemptsKey(user.email));

  await getClient().del(...keys);
  return true;
}

// 비밀번호만 갈아끼운다 (나머지 필드는 그대로). 없는 이메일이면 false.
export async function setUserPassword(email, passwordHash) {
  const user = await getUserByEmail(email);
  if (!user) return false;

  await getClient().set(userKey(user.email), { ...user, passwordHash });
  return true;
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
