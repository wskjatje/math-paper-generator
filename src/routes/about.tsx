import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, BookOpen, GitBranch, Sparkles } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";

export const Route = createFileRoute("/about")({
  component: About,
  head: () => ({
    meta: [
      { title: "关于 — 知学 Zhixue" },
      {
        name: "description",
        content:
          "知学 Zhixue 是一座开源的竞赛与奥数试题档案，所有内容含分步推导。",
      },
    ],
  }),
});

function About() {
  return (
    <PageShell size="narrow">
      <PageHeader
        eyebrow="关于"
        title="关于 知学 Zhixue"
        description="开源竞赛试题档案：严谨命题、分步推导。"
      />

      <div className="prose max-w-none space-y-5 leading-relaxed text-foreground">
        <p>
          <strong>知学 (Zhixue)</strong> 是一座完全开放的竞赛与奥数试题档案。
          它的目标朴素而严肃：让任何学习者都能获得严谨、可验证、可二次创作的高质量试题，
          而不必为版权、付费墙或浅薄的拼凑式题目所困。
        </p>
        <p>
          档案覆盖范围超越纯数学，全面涵盖
          <em>统计学、数据科学、算法竞赛、数学物理、数学化学</em> 等所有与数学交叉关联的拓展题型。
          每道题均包含
          <strong>详细的分步推导</strong>（要做什么 / 为什么这样做 / 用到哪些定理或公式），
          并配套同型例题供学习者掌握范式。
        </p>

        <h2 className="text-display text-2xl mt-10">命题原则</h2>
        <ul className="list-none p-0 space-y-3">
          {[
            {
              i: ShieldCheck,
              t: "严谨可验证",
              d: "AI 在 high-reasoning 模式下命题，对每道题独立解一遍自检后入库；杜绝随意拼凑组卷。",
            },
            {
              i: BookOpen,
              t: "结构化解析",
              d: "答案以 LaTeX 渲染数学公式、mhchem 渲染化学方程、代码高亮处理算法题。",
            },
            {
              i: GitBranch,
              t: "完全开源",
              d: "所有试卷、答案、例题对外开放。任何人可下载、转载、二次创作。",
            },
            {
              i: Sparkles,
              t: "双阶段生成",
              d: "首先生成完整试卷，然后基于其各类题型再生成 1-2 道同型例题，形成『考点 → 范式』的学习闭环。",
            },
          ].map(({ i: Icon, t, d }) => (
            <li key={t} className="paper-card p-5 flex gap-4">
              <div className="shrink-0 flex h-10 w-10 items-center justify-center rounded-md bg-primary/8 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <div className="font-medium text-foreground">{t}</div>
                <div className="text-sm text-muted-foreground mt-1">{d}</div>
              </div>
            </li>
          ))}
        </ul>

        <h2 className="text-display text-2xl mt-10">如何使用</h2>
        <ol className="list-decimal list-inside space-y-2">
          <li>
            在{" "}
            <Link to="/library" className="text-primary hover:underline">
              试卷库
            </Link>{" "}
            中按学科 / 难度浏览既有试卷。
          </li>
          <li>
            或在{" "}
            <Link to="/generate" className="text-primary hover:underline">
              生成页面
            </Link>{" "}
            自定义学科、题型、难度，命制专属试卷。
          </li>
          <li>试卷详情页可一键下载 Markdown 或打印为 PDF，方便分享与教学。</li>
        </ol>

        <h2 className="text-display text-2xl mt-10">免责声明</h2>
        <p className="text-sm text-muted-foreground">
          虽然命题流程包含自校验与严格推导，但 AI 生成内容仍可能存在偶发疏漏。
          若你发现题目存在问题，欢迎在使用过程中自行修订，并以同样的开源精神继续分享。
        </p>
      </div>
    </PageShell>
  );
}
