import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles, Library, ArrowRight } from "lucide-react";
import { listExams } from "@/lib/exam.functions.server";
import { DIFFICULTY_LABELS, type Exam } from "@/lib/types";

export const Route = createFileRoute("/")({
  loader: () => listExams(),
  component: Home,
  head: () => ({
    meta: [
      { title: "知学 Zhixue — 开源竞赛与奥数试题档案库" },
      {
        name: "description",
        content: "AI 严谨命题 · 分步推导 · 完全开源。",
      },
    ],
  }),
});

function Home() {
  const { exams: rawExams } = Route.useLoaderData();
  const exams = rawExams as unknown as Exam[];
  const featured = exams.slice(0, 3);

  return (
    <div>
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 opacity-[0.05] select-none text-foreground"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='600' height='600'><text x='10' y='80' font-family='Cambria,serif' font-size='48' fill='currentColor'>∮ E·dl = -dΦ/dt</text><text x='40' y='180' font-family='Cambria,serif' font-size='36' fill='currentColor'>ζ(s)=Σ 1/nˢ</text><text x='10' y='280' font-family='Cambria,serif' font-size='42' fill='currentColor'>P(A|B)=P(B|A)P(A)/P(B)</text><text x='30' y='380' font-family='Cambria,serif' font-size='38' fill='currentColor'>∇·F = ρ/ε₀</text><text x='10' y='480' font-family='Cambria,serif' font-size='44' fill='currentColor'>e^{iπ}+1=0</text></svg>\")",
            backgroundRepeat: "repeat",
          }}
        />
        <div className="container mx-auto px-4 pt-24 pb-20 md:pt-32 md:pb-24">
          <div className="max-w-3xl">
            <h1 className="text-display text-5xl md:text-7xl text-foreground">
              一座开放的<br />
              <span className="italic text-primary">竞赛试题</span> 档案
            </h1>
            <div className="gold-divider mt-6" />
            <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
              AI 严谨命题，分步推导，完全开源。
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link
                to="/generate"
                className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-elevated)]"
              >
                <Sparkles className="h-4 w-4" />
                生成试卷
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/library"
                className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                <Library className="h-4 w-4" />
                试卷库
              </Link>
            </div>
          </div>
        </div>
      </section>

      {featured.length > 0 && (
        <section className="container mx-auto px-4 pb-24">
          <div className="mb-8 flex items-end justify-between">
            <h2 className="text-display text-2xl md:text-3xl">最新试卷</h2>
            <Link
              to="/library"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              全部 <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {featured.map((e) => (
              <Link
                key={e.id}
                to="/exam/$id"
                params={{ id: e.id }}
                className="paper-card group p-6 transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-elevated)]"
              >
                <div className="flex items-center gap-2 text-xs">
                  <span className="rounded-full bg-primary/8 px-2 py-0.5 text-primary">
                    {DIFFICULTY_LABELS[e.difficulty as keyof typeof DIFFICULTY_LABELS]}
                  </span>
                  <span className="text-muted-foreground">
                    {e.duration_min} 分钟 · {e.total_score} 分
                  </span>
                </div>
                <h3 className="text-display mt-3 text-lg transition-colors group-hover:text-primary line-clamp-2">
                  {e.title}
                </h3>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {(e.subjects ?? []).slice(0, 4).map((s) => (
                    <span
                      key={s}
                      className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
