// GET /api/export?format=json  → 내 레퍼런스 전체를 JSON 파일로 내려받는다 (기본값)
// GET /api/export?format=csv   → 엑셀/구글 시트에서 열 수 있는 CSV 파일로 내려받는다
//
// Content-Disposition 을 붙여서 브라우저가 화면을 바꾸는 대신 파일로 저장하게 한다.

import { getItems, getUserById } from "../lib/redis.js";
import { requireAuth } from "../lib/auth.js";
import { buildCsv, formatDateKST } from "../lib/csv.js";

const CSV_HEADER = ["URL", "제목", "요약", "카테고리", "유형", "즐겨찾기", "메모", "저장일"];

function toCsv(items) {
  return buildCsv(
    CSV_HEADER,
    items.map((item) => [
      item.url,
      item.title,
      item.summary,
      item.category,
      item.type,
      item.favorite ? "예" : "아니오",
      item.myInsight,
      formatDateKST(item.createdAt),
    ])
  );
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
