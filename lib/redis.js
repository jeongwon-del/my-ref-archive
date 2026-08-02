// Upstash Redis 헬퍼 — 레퍼런스 목록 1개를 읽고 쓴다.
//   refItems : [{ id, url, title, summary, category, memo, favorite, createdAt }]
//
// 필요한 환경변수: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
// (Vercel Marketplace 에서 Upstash 를 연동하면 KV_REST_API_URL / KV_REST_API_TOKEN
//  이름으로 주입되므로 그쪽도 함께 지원한다)

import { Redis } from "@upstash/redis";

const ITEMS_KEY = "refItems";
const ARCHIVE_NAME_KEY = "archiveName";
const CATEGORIES_KEY = "categories";

export const DEFAULT_CATEGORIES = ['카피/문구', '비주얼/디자인', '브랜드 무드', '마케팅 아이디어', '기타'];

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
export async function getItems() {
  const data = await getClient().get(ITEMS_KEY);
  return Array.isArray(data) ? data : [];
}

export async function setItems(items) {
  await getClient().set(ITEMS_KEY, items);
}

export async function getArchiveName() {
  const data = await getClient().get(ARCHIVE_NAME_KEY);
  return typeof data === "string" ? data : "";
}

export async function setArchiveName(name) {
  await getClient().set(ARCHIVE_NAME_KEY, name);
}

export async function getCategories() {
  const data = await getClient().get(CATEGORIES_KEY);
  return Array.isArray(data) && data.length > 0 ? data : DEFAULT_CATEGORIES;
}

export async function setCategories(categories) {
  await getClient().set(CATEGORIES_KEY, categories);
}
