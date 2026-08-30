import { createFileRoute } from "@tanstack/react-router";
import { EducationOsWorkspace } from "@/components/educationOs/EducationOsWorkspace";
import { PageShell } from "@/components/layout/PageShell";

export const Route = createFileRoute("/education-os")({
  component: EducationOsPage,
  head: () => ({
    meta: [
      { title: "教育 AI OS — 知学 Zhixue" },
      {
        name: "description",
        content: "账号、识图、题目协议与错题 / 辅导 / 学习事件。",
      },
    ],
  }),
});

function EducationOsPage() {
  return (
    <PageShell size="full">
      <EducationOsWorkspace />
    </PageShell>
  );
}
