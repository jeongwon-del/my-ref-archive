// GET /api/export?format=json  → 내 레퍼런스 전체를 JSON 파일로 내려받는다 (기본값)
// GET /api/export?format=csv   → 엑셀/구글 시트에서 열 수 있는 CSV 파일로 내려받는다
//
// Content-Disposition 을 붙여서 브라우저가 화면을 바꾸는 대신 파일로 저장하게 한다.

import { getItems, getUserById } from "../lib/redis.js";
import { requireAuth } from "../lib/auth.js";

const CSV_HEADER = ["URL", "제목", "요약", "카테고리", "유형", "즐겨찾기", "메모", "저장일"];

// 서버는 보통 UTC로 도는데, 메인 화면(app.js)의 날짜는 방문자 브라우저(한국 시간)에서 계산된다.
// 여기서도 Asia/Seoul로 고정해야 새벽 0~9시에 저장한 항목이 하루 전 날짜로 밀리지 않는다.
function formatDate(ts) {
  if (!ts) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ts));
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// 요약·제목은 AI 가 외부 웹페이지를 읽고 만든 값이라 믿을 수 없는 입력이다.
// =, +, -, @ 로 시작하는 값은 엑셀이 "수식" 으로 실행해버리므로 앞에 ' 를 붙여 글자로 고정한다.
function escapeCsvField(value) {
  let text = value === null || value === undefined ? "" : String(value);

  if (/^[=+\-@]/.test(text)) text = "'" + text;

  if (/[",\r\n]/.test(text)) {
    text = '"' + text.replace(/"/g, '""') + '"';
  }
  return text;
}

function toCsv(items) {
  const rows = [CSV_HEADER.join(",")];

  items.forEach((item) => {
    rows.push(
      [
        item.url,
        item.title,
        item.summary,
        item.category,
        item.type,
        item.favorite ? "예" : "아니오",
        item.myInsight,
        formatDate(item.createdAt),
      ]
        .map(escapeCsvField)
        .join(",")
    );
  });

  // 맨 앞의 BOM 이 없으면 윈도우 엑셀이 한글을 깨진 글자로 읽는다.
  return "﻿" + rows.join("\r\n") + "\r\n";
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const userId = requireAuth(req, res);
    if (!userId) return;

    const user = await getUserById(userId);
    if (!user) return res.status(401).json({ error: "로그인이 필요해요." });

    const items = await getItems(userId);

    if (req.query.format === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="my-ref-archive-backup.csv"'
      );
      return res.status(200).send(toCsv(items));
    }

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="my-ref-archive-backup.json"'
    );
    return res
      .status(200)
      .send(JSON.stringify({ email: user.email, exportedAt: Date.now(), items }, null, 2));
  } catch (err) {
    console.error("export error:", err);
    return res.status(500).json({ error: "내보내기 중 오류가 발생했어요: " + err.message });
  }
}
