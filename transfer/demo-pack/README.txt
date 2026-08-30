知学 · 换机演示包

本机演示（无需云库）：
  1. 将本目录拷到目标电脑仓库旁或任意路径
  2. 在目标仓库根目录执行：
     npm run demo:import -- --from <本目录路径>

云端数据表（Supabase）：
  A. 有 DATABASE_URL：在目标机 .env 配好后执行 npm run db:apply
  B. 无直连：打开 Supabase → SQL Editor，粘贴 migrations-all.sql 整份执行

账号：演示包不含 Supabase Auth 用户；云端账号须在运维端重建或沿用原项目。
