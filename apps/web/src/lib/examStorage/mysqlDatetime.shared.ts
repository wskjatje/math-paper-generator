/**
 * MySQL DATETIME(3) 与 JS ISO8601（含 `T`、`Z`、毫秒）不兼容，须在写入 mysql2 前格式化。
 * 统一按 UTC 拆解（与原 `Date.prototype.toISOString()` 语义一致）。
 */
export function formatUtcForMysqlDatetime3(d: Date): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.` +
    pad(d.getUTCMilliseconds(), 3)
  );
}

/** 接受 ISO 字符串或 Date，产出 MySQL 可识别的字面量。 */
export function toMysqlDatetime3(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) {
    return formatUtcForMysqlDatetime3(new Date());
  }
  return formatUtcForMysqlDatetime3(d);
}
