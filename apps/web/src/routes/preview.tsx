import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { listSchemaPreviews } from "@/lib/schemaPreview.functions.server";

export const Route = createFileRoute("/preview")({
  loader: async () => listSchemaPreviews(),
  component: PreviewPage,
  head: () => ({
    meta: [{ title: "数据结构预览 · 知学" }],
  }),
});

function PreviewPage() {
  const { schemas } = Route.useLoaderData();
  return (
    <PageShell size="medium">
      <PageHeader title="结构预览" />
      <div className="space-y-6">
        {schemas.map((s) => (
          <section key={s.name} className="paper-card p-4">
            <h2 className="text-sm font-semibold">{s.name}</h2>
            <pre className="mt-3 max-h-[420px] overflow-auto rounded-md bg-muted/40 p-3 text-xs leading-relaxed">
              {s.json}
            </pre>
          </section>
        ))}
      </div>
      <p className="mt-8 text-sm text-muted-foreground">
        <Link to="/about" className="text-primary hover:underline">
          返回关于页
        </Link>
      </p>
    </PageShell>
  );
}
