import { createFileRoute } from "@tanstack/react-router";
import { EducationOsWorkspace } from "@/components/educationOs/EducationOsWorkspace";

export const Route = createFileRoute("/education-os")({
  component: EducationOsPage,
  head: () => ({
    meta: [
      { title: "教育 AI OS — 知学 Zhixue" },
      {
        name: "description",
        content: "账号、开源 OCR、题目协议与错题 / Tutor / Agent / 学习事件。",
      },
    ],
  }),
});

function EducationOsPage() {
  return <EducationOsWorkspace />;
}
