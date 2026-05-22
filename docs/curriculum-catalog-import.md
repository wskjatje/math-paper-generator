# 出版社章节目录：导入与定时更新

命题页「章节范围」在**校内同步**模式下，除内置模块外，可展示 MySQL 中 `curriculum_catalog_series` / `curriculum_catalog_node` 里的分册树。数据由贵方按教材维护为 **JSON 清单**，通过本仓库脚本写入数据库；可放在对象存储 / 内网 HTTPS 上，用 **cron 或 CI 定时拉取**实现随教材修订更新。

## 清单格式

与 `examples/v1/curriculum-catalog.sample.json` 一致：

- 根对象含可选 `catalog_version`（数据集版本号，如 `2026.1`）。
- `series`：数组，每条对应一册书（一个目录树根）。
  - **必填**：`id`（≤64 字符，稳定 id，用于幂等更新）、`subject_id`（与命题页一致，如 `math`）、`grade_band`（`primary` | `junior` | `senior`）、`edition_name`。
  - **选填**：`publisher_code`、`volume_name`、`textbook_edition_hint_match`（与命题页「教材版本」文案对齐）、`revision`、`catalog_version`（可覆盖根级）、`sort_order`、`active`、`source`。
  - `nodes`：扁平数组；每条含 `id`（全局唯一，≤128 字符）、`parent_id`（根为 `null`）、`label`、`node_kind`（默认 `topic`）、`sort_order`、`external_ref`。

**注意**：`curriculum_catalog_node.id` 表内主键全局唯一，建议在 id 中带 series 前缀（如示例中的 `demo-rj-math-j7a-…`）。前端勾选后入库为 `mysql:<node_id>`，勿无故改名否则历史队列无法还原标签。

## 导入命令

在项目根目录（需已 `npm install`，且能连接 MySQL）：

```bash
# 默认读取 data/curriculum-catalog.json
npm run curriculum-catalog:import

# 指定本地文件
node scripts/import-curriculum-catalog.mjs examples/v1/curriculum-catalog.sample.json

# 从 HTTPS 拉取（需设置 URL）
export MPG_CURRICULUM_CATALOG_URL=https://cdn.example.edu/catalog/math-cn-2026.json
npm run curriculum-catalog:import
```

可选环境变量见仓库根 `.env.example`（`MPG_CURRICULUM_CATALOG_*`、`MPG_MYSQL_*`）。

## MySQL 连接

脚本按以下顺序解析：

1. `MYSQL_*` 或 `MPG_MYSQL_*`（适合 CI / 服务器定时任务）。
2. 否则读取 `data/mysql-connection.json`（与设置页相同；支持 `password` 或 `passwordEnc`，后者依赖 `MYSQL_PASSWORD_ENC_KEY` 或 `data/mysql-password-master.key`）。

## 合并语义

- 每个 `series.id`：**INSERT … ON DUPLICATE KEY UPDATE**，整册节点先 **DELETE 该 `series_id` 下全部 node 再 INSERT**，与 JSON 完全一致（保证树与排序一致）。
- 可选：`MPG_CURRICULUM_CATALOG_DEACTIVATE_OTHERS=1` 时，导入结束后将**本次 JSON 未出现的**所有 `curriculum_catalog_series` 行设为 `active=0`（不删节点）。多源并行维护目录时不要开启。

## 定时更新示例

**cron（每天中午 12:00，日志落盘）**

`0 12 * * *` 表示在**运行 crontab 的服务器本地时区**下，每天 12:00 执行。若你希望固定为北京时间中午，请把系统时区设为 `Asia/Shanghai`，或使用换算后的 UTC（见下）。

```cron
0 12 * * * cd /opt/zhixue-app && export MPG_CURRICULUM_CATALOG_URL=https://internal.example.edu/assets/curriculum-bundle.json && export MPG_MYSQL_HOST=db.internal && export MPG_MYSQL_USER=… && export MPG_MYSQL_PASSWORD=… && export MPG_MYSQL_DATABASE=zhixue && /usr/bin/npm run curriculum-catalog:import >> /var/log/zhixue-curriculum-import.log 2>&1
```

**GitHub Actions**（`schedule` 使用 **UTC**）：北京时间中午 12:00 对应 UTC **04:00**，可写：

```yaml
on:
  schedule:
    - cron: "0 4 * * *"
```

在仓库 Secrets 中配置清单 URL 与数据库连接等环境变量，由 workflow 调用 `npm run curriculum-catalog:import`。云端 Runner 需能访问你的 MySQL（常需自托管 Runner）；勿把生产密码写入仓库明文。

## 与命题页的关系

Web 端在校内同步且年级学科有效时，会按学段 + 学科查询 `active=1` 的目录并合并内置章节；未配置 MySQL 或表为空时仍仅显示内置目录。
