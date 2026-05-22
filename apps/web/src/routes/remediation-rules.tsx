import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, RefreshCw, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { loadAiSettings, toAiRuntimePayload } from "@/lib/aiSettingsStorage";
import {
  deleteExamRemediationRuleEntry,
  draftExamRemediationRuleWithAi,
  listExamRemediationRules,
  reapplyExamRemediationPipelineToExam,
  saveExamRemediationRule,
} from "@/lib/exam.functions.server";

export const Route = createFileRoute("/remediation-rules")({
  component: RemediationRulesPage,
  head: () => ({
    meta: [
      { title: "试卷修复管线 — 知学 Zhixue" },
      {
        name: "description",
        content: "多套卷共用的入库修复规则（数据库驱动）；可对已入库试卷重跑管线。",
      },
    ],
  }),
});

type RuleRow = Record<string, unknown>;

function RemediationRulesPage() {
  const listRules = useServerFn(listExamRemediationRules);
  const saveRule = useServerFn(saveExamRemediationRule);
  const deleteRule = useServerFn(deleteExamRemediationRuleEntry);
  const reapplyPipeline = useServerFn(reapplyExamRemediationPipelineToExam);
  const draftWithAi = useServerFn(draftExamRemediationRuleWithAi);

  const [rules, setRules] = useState<RuleRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reapplyExamId, setReapplyExamId] = useState("");
  const [reapplyBusy, setReapplyBusy] = useState(false);
  const [draftDesc, setDraftDesc] = useState("");
  const [draftBusy, setDraftBusy] = useState(false);

  const [formId, setFormId] = useState("");
  const [formName, setFormName] = useState("");
  const [formPriority, setFormPriority] = useState("50");
  const [formEnabled, setFormEnabled] = useState(true);
  const [formNote, setFormNote] = useState("");
  const [formMatchJson, setFormMatchJson] = useState(
    '{\n  "exam_source_in": ["imported"],\n  "question_stem_regex": "旋转",\n  "only_if_diagram_schema_null": true\n}',
  );
  const [formActionJson, setFormActionJson] = useState(
    '{\n  "type": "infer_geometry_diagram",\n  "mode": "rule_only",\n  "force": false\n}',
  );

  const refreshList = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await listRules();
      if (res.ok) setRules((res.rules as RuleRow[]) ?? []);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingList(false);
    }
  }, [listRules]);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  async function handleSave() {
    let match_json: unknown;
    let action_json: unknown;
    try {
      match_json = JSON.parse(formMatchJson);
    } catch {
      toast.error("match_json 不是合法 JSON");
      return;
    }
    try {
      action_json = JSON.parse(formActionJson);
    } catch {
      toast.error("action_json 不是合法 JSON");
      return;
    }
    if (!formId.trim()) {
      toast.error("请填写规则 id");
      return;
    }
    setSaving(true);
    try {
      await saveRule({
        id: formId.trim(),
        name: formName.trim() || undefined,
        priority: Number(formPriority) || 0,
        enabled: formEnabled,
        note: formNote.trim() || undefined,
        match_json,
        action_json,
      });
      toast.success("已保存规则");
      await refreshList();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(`确定删除规则「${id}」？`)) return;
    setDeletingId(id);
    try {
      const res = await deleteRule({ id });
      if (res.deleted) toast.success("已删除");
      else toast.message("未删除（可能不存在）");
      await refreshList();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingId(null);
    }
  }

  async function handleReapply() {
    const id = reapplyExamId.trim();
    if (!id) {
      toast.error("请输入试卷 UUID");
      return;
    }
    setReapplyBusy(true);
    try {
      const ai = toAiRuntimePayload(loadAiSettings());
      const res = await reapplyPipeline({ examId: id, ai });
      toast.success(`完成：存储 ${res.backend}，变更题目示意图 ${res.changedQuestionCount} 道`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setReapplyBusy(false);
    }
  }

  async function handleDraft() {
    const d = draftDesc.trim();
    if (d.length < 8) {
      toast.error("描述至少 8 个字符");
      return;
    }
    setDraftBusy(true);
    try {
      const ai = toAiRuntimePayload(loadAiSettings());
      const out = await draftWithAi({ description: d, ai });
      if (!out.ok) {
        toast.error(out.reason);
        return;
      }
      const draft = out.draft;
      setFormId(String(draft.id ?? ""));
      setFormName(String(draft.name ?? ""));
      setFormPriority(String(draft.priority ?? 50));
      setFormEnabled(draft.enabled !== false);
      setFormNote(String(draft.note ?? ""));
      setFormMatchJson(JSON.stringify(draft.match_json, null, 2));
      setFormActionJson(JSON.stringify(draft.action_json, null, 2));
      toast.success("已填入表单，请核对后再保存");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setDraftBusy(false);
    }
  }

  function editRule(row: RuleRow) {
    setFormId(String(row.id ?? ""));
    setFormName(row.name != null ? String(row.name) : "");
    setFormPriority(String(row.priority ?? 0));
    setFormEnabled(Boolean(row.enabled ?? true));
    setFormNote(row.note != null ? String(row.note) : "");
    setFormMatchJson(JSON.stringify(row.match_json ?? {}, null, 2));
    setFormActionJson(JSON.stringify(row.action_json ?? {}, null, 2));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <PageShell size="narrow">
      <PageHeader
        eyebrow="运维"
        title="试卷修复管线（方案 C）"
        description="规则存 MySQL，多套卷共用；导入后会自动执行。此处可管理规则、对已有试卷重跑管线，或用模型起草规则草案。"
      />

      <div className="mb-6 flex flex-wrap gap-3 text-sm">
        <Link to="/settings" className="text-primary underline-offset-4 hover:underline">
          ← 返回设置
        </Link>
      </div>

      <section className="paper-card mb-8 space-y-4 p-6">
        <h2 className="text-display text-lg font-semibold">Agent 起草规则（可选）</h2>
        <p className="text-sm text-muted-foreground">
          用自然语言描述适用场景与期望动作，模型生成 JSON 填入下方表单；请务必人工核对后再保存。
        </p>
        <Textarea
          value={draftDesc}
          onChange={(e) => setDraftDesc(e.target.value)}
          placeholder="例如：对所有导入卷里题干包含「旋转」「绕点 B」且还没有几何示意图的题目，用 rule_only 做一次示意图推断"
          rows={4}
          className="font-mono text-sm"
        />
        <Button
          type="button"
          variant="secondary"
          disabled={draftBusy}
          onClick={() => void handleDraft()}
        >
          {draftBusy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Wand2 className="mr-2 h-4 w-4" />
          )}
          生成草案到表单
        </Button>
      </section>

      <section className="paper-card mb-8 space-y-4 p-6">
        <h2 className="text-display text-lg font-semibold">新建 / 编辑规则</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="rule-id">id（唯一）</Label>
            <Input
              id="rule-id"
              value={formId}
              onChange={(e) => setFormId(e.target.value)}
              placeholder="例 geo-imported-001"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rule-name">名称</Label>
            <Input id="rule-name" value={formName} onChange={(e) => setFormName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rule-prio">priority（越大越优先）</Label>
            <Input
              id="rule-prio"
              type="number"
              value={formPriority}
              onChange={(e) => setFormPriority(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 pt-8">
            <Checkbox
              id="rule-en"
              checked={formEnabled}
              onCheckedChange={(v) => setFormEnabled(v === true)}
            />
            <Label htmlFor="rule-en">启用</Label>
          </div>
        </div>
        <div className="space-y-2">
          <Label>match_json</Label>
          <Textarea
            value={formMatchJson}
            onChange={(e) => setFormMatchJson(e.target.value)}
            rows={8}
            className="font-mono text-xs"
          />
        </div>
        <div className="space-y-2">
          <Label>action_json</Label>
          <Textarea
            value={formActionJson}
            onChange={(e) => setFormActionJson(e.target.value)}
            rows={6}
            className="font-mono text-xs"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rule-note">note</Label>
          <Input id="rule-note" value={formNote} onChange={(e) => setFormNote(e.target.value)} />
        </div>
        <Button type="button" onClick={() => void handleSave()} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-2 h-4 w-4" />
          )}
          保存规则
        </Button>
      </section>

      <section className="paper-card mb-8 space-y-4 p-6">
        <h2 className="text-display text-lg font-semibold">对已入库试卷重跑管线</h2>
        <p className="text-sm text-muted-foreground">
          按当前数据库中的启用规则，重新计算并写回各题的
          diagram_schema（与导入后自动执行同一套逻辑）。需配置本地 MySQL 中的规则表；存储为云端 /
          MySQL / 本地 JSON 时均可尝试解析。
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1 space-y-2">
            <Label htmlFor="reapply-id">试卷 exam id（UUID）</Label>
            <Input
              id="reapply-id"
              value={reapplyExamId}
              onChange={(e) => setReapplyExamId(e.target.value)}
              placeholder="从试卷库或地址栏复制"
            />
          </div>
          <Button type="button" disabled={reapplyBusy} onClick={() => void handleReapply()}>
            {reapplyBusy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            重跑并写回
          </Button>
        </div>
      </section>

      <section className="paper-card space-y-4 p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-display text-lg font-semibold">已配置规则</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void refreshList()}
            disabled={loadingList}
          >
            {loadingList ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
        {loadingList ? (
          <p className="text-sm text-muted-foreground">加载中…</p>
        ) : rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            暂无规则（或未连接 MySQL）。可在上方新建。
          </p>
        ) : (
          <ul className="space-y-3">
            {rules.map((row) => {
              const id = String(row.id ?? "");
              return (
                <li
                  key={id}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 px-4 py-3 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-foreground">
                      {id}{" "}
                      <span className="text-muted-foreground font-normal">
                        · priority {String(row.priority ?? 0)} {row.enabled ? "" : "（已禁用）"}
                      </span>
                    </div>
                    {row.name ? (
                      <div className="text-muted-foreground mt-0.5">{String(row.name)}</div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => editRule(row)}>
                      编辑
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={deletingId === id}
                      onClick={() => void handleDelete(id)}
                    >
                      {deletingId === id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </PageShell>
  );
}
