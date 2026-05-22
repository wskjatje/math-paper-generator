#!/usr/bin/env node
/**
 * 仅在可信开发环境执行：用 Service Role 创建教育 OS 演示账号（勿用于生产公网）。
 *
 * 依赖环境变量（与后端一致）：
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * 用法：
 *   node scripts/seed-education-os-dev-admins.mjs
 *
 * 将创建（若已存在则更新密码并校正 profiles.role）：
 *   - 教师侧超级管理员：邮箱 admin@teacher.local，密码 admin，role=teacher
 *   - 学生侧超级管理员：邮箱 admin@student.local，密码 admin，role=student
 *
 * 说明：Supabase Auth 使用「邮箱 + 密码」登录；前端「教育 OS」页用邮箱字段填入上述地址。
 * 若控制台启用了「密码最少 6 位」等策略，密码 admin 可能创建失败，请 temporarily 放宽或改用更长密码。
 */
import { createClient } from "@supabase/supabase-js";

const TEACHER = {
  email: "admin@teacher.local",
  password: "admin",
  role: "teacher",
  display_name: "教师超级管理员",
};
const STUDENT = {
  email: "admin@student.local",
  password: "admin",
  role: "student",
  display_name: "学生超级管理员",
};

async function findUserIdByEmail(admin, email) {
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users ?? [];
    const hit = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (users.length < perPage) return null;
    page += 1;
  }
}

async function upsertDevUser(supabase, spec) {
  const admin = supabase.auth.admin;
  let userId = await findUserIdByEmail(supabase, spec.email);

  if (!userId) {
    const { data, error } = await admin.createUser({
      email: spec.email,
      password: spec.password,
      email_confirm: true,
      user_metadata: { full_name: spec.display_name },
    });
    if (error) {
      console.error(`[seed] 创建失败 ${spec.email}:`, error.message);
      return;
    }
    userId = data.user.id;
    console.log(`[seed] 已创建用户 ${spec.email} (${userId})`);
  } else {
    const { error } = await admin.updateUserById(userId, {
      password: spec.password,
      email_confirm: true,
      user_metadata: { full_name: spec.display_name },
    });
    if (error) {
      console.error(`[seed] 更新密码失败 ${spec.email}:`, error.message);
      return;
    }
    console.log(`[seed] 已存在，已重置密码并确认邮箱 ${spec.email}`);
  }

  const { error: pe } = await supabase
    .from("profiles")
    .upsert(
      {
        id: userId,
        role: spec.role,
        display_name: spec.display_name,
        metadata: { seed: "education-os-dev-admin", side: spec.role },
      },
      { onConflict: "id" },
    );
  if (pe) {
    console.error(`[seed] profiles 写入失败 ${spec.email}:`, pe.message);
    return;
  }
  console.log(`[seed] profiles.role=${spec.role} ${spec.email}`);
}

async function main() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error("请设置 SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY（须 Service Role，勿提交到 Git）");
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log("--- 教育 OS 开发账号（邮箱登录）---");
  await upsertDevUser(supabase, TEACHER);
  await upsertDevUser(supabase, STUDENT);
  console.log("--- 完成 ---");
  console.log("教师超级管理员：", TEACHER.email, "/", TEACHER.password);
  console.log("学生超级管理员：", STUDENT.email, "/", STUDENT.password);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
