// GET    /api/admin/users              → 가입자 목록 { users: [{ email, id, createdAt, itemCount }] }
// DELETE /api/admin/users?email=...    → 그 계정과 계정의 모든 데이터 삭제
// POST   /api/admin/reset-password     (body: { email, newPassword }) → 관리자가 남의 비밀번호 재설정
// GET    /api/admin/export?format=...  → 가입한 모든 사람의 데이터를 JSON/CSV 파일로 백업
//
// 전부 ADMIN_EMAILS 에 등록된 계정으로 로그인했을 때만 쓸 수 있다.
// Vercel Hobby 플랜은 배포당 서버리스 함수를 12개까지만 허용해서, admin 라우트들을
// [action].js 동적 라우트 하나로 모았다 — URL은 각자 그대로 유지된다.

import bcrypt from "bcryptjs";
import {
  listUsers,
  deleteUserAccount,
  getUserById,
  normalizeEmail,
  setUserPassword,
  getItems,
  getArchiveName,
  getCategories,
} from "../../lib/redis.js";
import { requireAdmin } from "../../lib/auth.js";
import { buildCsv, formatDateKST } from "../../lib/csv.js";

const MIN_PASSWORD_LENGTH = 8;
const CSV_HEADER = ["이메일", "URL", "제목", "요약", "카테고리", "유형", "즐겨찾기", "메모", "저장일"];

async function handleUsers(req, res) {
  try {
    const adminId = await requireAdmin(req, res);
    if (!adminId) return;

    if (req.method === "GET") {
      const users = await listUsers();
      return res.status(200).json({ users });
    }

    if (req.method === "DELETE") {
      const email = normalizeEmail(req.query.email);
      if (!email) return res.status(400).json({ error: "email이 필요해요." });

      // 실수로 자기 관리자 계정을 지워서 잠기는 걸 막는다.
      const admin = await getUserById(adminId);
      if (email === normalizeEmail(admin.email)) {
        return res.status(400).json({ error: "지금 로그인한 관리자 계정은 여기서 삭제할 수 없어요." });
      }

      const deleted = await deleteUserAccount(email);
      if (!deleted) return res.status(404).json({ error: "그 이메일로 가입한 계정을 찾을 수 없어요." });

      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("admin users error:", err);
    return res.status(500).json({ error: "처리 중 오류가 발생했어요: " + err.message });
  }
}

async function handleResetPassword(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const adminId = await requireAdmin(req, res);
    if (!adminId) return;

    const email = normalizeEmail(req.body?.email);
    const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";

    if (!email) {
      return res.status(400).json({ error: "email이 필요해요." });
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상으로 만들어주세요.` });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const updated = await setUserPassword(email, passwordHash);
    if (!updated) return res.status(404).json({ error: "그 이메일로 가입한 계정을 찾을 수 없어요." });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("admin reset-password error:", err);
    return res.status(500).json({ error: "처리 중 오류가 발생했어요: " + err.message });
  }
}

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

async function handleExport(req, res) {
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

const HANDLERS = {
  users: handleUsers,
  "reset-password": handleResetPassword,
  export: handleExport,
};

export default async function handler(req, res) {
  const fn = HANDLERS[req.query.action];
  if (!fn) return res.status(404).json({ error: "Not found" });
  return fn(req, res);
}
