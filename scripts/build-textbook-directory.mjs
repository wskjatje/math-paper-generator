/**
 * @deprecated 禁止用本脚本生成兜底单元纲要。
 * 真实目录须由外部权威清单提供（MPG_TEXTBOOK_DIRECTORY_URL）。
 * 若误运行，改为执行：node scripts/purge-placeholder-textbook-directory.mjs
 */
console.error(
  "[build-textbook-directory] 已禁用：不允许硬编码/兜底单元目录。\n" +
    "请使用 MPG_TEXTBOOK_DIRECTORY_URL 同步真实纲要，或运行：\n" +
    "  node scripts/purge-placeholder-textbook-directory.mjs",
);
process.exit(1);
