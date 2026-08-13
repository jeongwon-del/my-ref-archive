// GET    /api/admin/users             → { users: [{ email, id, createdAt, itemCount }] } (최신 가입순)
// DELETE /api/admin/users?email=...   → 그 계정과 계정의 모든 데이터 삭제
//
// 둘 다 ADMIN_EMAILS 에 등록된 계정으로 로그인했을 때만 쓸 수 있다.

import { listUsers, deleteUserAccount, getUserById, normalizeEmail } from "../../lib/redis.js";
import { requireAdmin } from "../../lib/auth.js";

export default async function handler(req, res) {
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
