# Prompt 工程目录（占位）

将命题、导入、Agent 等提示词拆为版本化文件（`.md` / `.txt`），由构建或运行时加载；避免写死在 `apps/web/src/**/*.ts`。

建议命名：

- `generate_exam.prompt.md`
- `import_document.prompt.md`
- `teacher_agent.prompt.md`
- `student_agent.prompt.md`

当前尚未接线读取逻辑；迁移时从 `exam-generation.server.ts` 等逐步抽取。
