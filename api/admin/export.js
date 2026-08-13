// GET /api/admin/export?format=json → 가입한 모든 사람의 데이터를 JSON 파일 하나로 내려받는다 (기본값)
// GET /api/admin/export?format=csv  → 모든 사람의 레퍼런스를 한 장의 CSV 로 내려받는다 (줄마다 이메일이 붙는다)
//
// api/export.js 는 "본인 것만" 이고, 이 라우트는 관리자가 전체를 백업하는 용도다.
// ADMIN_EMAILS 에 등록된 계정으로 로그인했을 때만 쓸 수 있다.

import { listUsers, getItems, getArchiveName, getCategories } from "../../lib/redis.js";
import { requireAdmin } from "../../lib/auth.js";
import { buildCsv, formatDateKST } from "../../lib/csv.js";

const CSV_HEADER = ["이메일", "URL", "제목", "요약", "카테고리", "유형", "즐겨찾기", "메모", "저장일"];

// listUsers 는 passwordHash 를 주지 않는다. 여기서도 계정 비밀번호는 절대 파일에 담기지 않는다.
async function collectAllUserData() {
  const users = await listUsers();

  return Promise.all(
    users.map(async (user) => {
      const [items, archiveName, categories] = await Promise.all([
        getItems(user.id),
        getArchiveName(user.id),
        getCategories(user.id),
      ]);
      return { email: user.email, createdAt: user.createdAt, archiveName, categories, items };
    })
  );
}

function toCsv(users) {
  const rows = [];

  users.forEach((user) => {
    user.items.forEach((item) => {
      rows.push([
        user.email,
        item.url,
        item.title,
        item.summary,
        item.category,
        item.type,
        item.favorite ? "예" : "아니오",
        item.myInsight,
        formatDateKST(item.createdAt),
      ]);
    });
  });

  return buildCsv(CSV_HEADER, rows);
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const adminId = await requireAdmin(req, res);
    if (!adminId) return;

    const users = await collectAllUserData();

    if (req.query.format === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="my-ref-archive-all-users-backup.csv"'
      );
      return res.status(200).send(toCsv(users));
    }

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="my-ref-archive-all-users-backup.json"'
    );
    return res.status(200).send(JSON.stringify({ exportedAt: Date.now(), users }, null, 2));
  } catch (err) {
    console.error("admin export error:", err);
    return res.status(500).json({ error: "백업 중 오류가 발생했어요: " + err.message });
  }
}
