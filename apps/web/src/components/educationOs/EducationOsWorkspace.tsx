import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Loader2,
  RefreshCw,
  LogIn,
  UserPlus,
  LogOut,
  FileJson,
  BookMarked,
  MessageCircle,
  Bot,
  Activity,
  Copy,
} from "lucide-react";
import { FormPanel } from "@/components/layout/FormPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import {
  localEducationUserFetchOptions,
  supabaseAuthFetchOptions,
} from "@/lib/supabaseAuthFetchOptions";
import {
  LOCAL_EDU_USER_LS_KEY,
  isValidLocalEducationUserId,
} from "@/lib/educationOs/localEducationUser.shared";
import { syncExamStoragePreferenceToCookie } from "@/lib/examStoragePreference";
import { toUserFacingErrorMessage } from "@/lib/userFacingError.shared";
import { QUESTION_V1_DEMO } from "@/lib/educationOs/samples/questionV1Demo";
import { safeParseQuestionSchemaV1 } from "@/lib/educationOs/questionSchema.zod";
import { getBackendCapabilities } from "@/lib/exam.functions.server";
import {
  addWrongBookEntry,
  createEducationAgent,
  createTutorSession,
  getEducationOsProfile,
  listMyEducationAgents,
  listMyOsQuestionDocuments,
  listMyTutorSessions,
  listMyWrongBookEntries,
  recordEducationLearningEvent,
  runOpenSourceOcr,
  saveOsQuestionDocument,
  updateEducationOsProfile,
} from "@/lib/educationOs.functions.server";

const FIELD =
  "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring";

export function EducationOsWorkspace() {
  const auth = useSupabaseAuth();

  const capsFn = useServerFn(getBackendCapabilities);
  const [isLocalUnifiedPlane, setIsLocalUnifiedPlane] = useState(false);
  const [localEduUserId, setLocalEduUserId] = useState<string | null>(null);

  useEffect(() => {
    syncExamStoragePreferenceToCookie();
    void capsFn().then((c) => setIsLocalUnifiedPlane(c.educationOsLocalMysqlUnified));
  }, [capsFn]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") {
        syncExamStoragePreferenceToCookie();
        void capsFn().then((c) => setIsLocalUnifiedPlane(c.educationOsLocalMysqlUnified));
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [capsFn]);

  useEffect(() => {
    if (!isLocalUnifiedPlane || typeof window === "undefined") {
      setLocalEduUserId(null);
      return;
    }
    try {
      let id = localStorage.getItem(LOCAL_EDU_USER_LS_KEY);
      if (!id || !isValidLocalEducationUserId(id)) {
        id = crypto.randomUUID();
        localStorage.setItem(LOCAL_EDU_USER_LS_KEY, id);
      }
      setLocalEduUserId(id);
    } catch {
      setLocalEduUserId(null);
    }
  }, [isLocalUnifiedPlane]);

  const reqOpts = useCallback(() => {
    return {
      ...supabaseAuthFetchOptions(auth.accessToken),
      ...localEducationUserFetchOptions(isLocalUnifiedPlane ? localEduUserId : null),
    };
  }, [auth.accessToken, isLocalUnifiedPlane, localEduUserId]);

  const canUseOsData = isLocalUnifiedPlane ? !!localEduUserId : !!auth.accessToken;

  const getProfileFn = useServerFn(getEducationOsProfile);
  const updateProfileFn = useServerFn(updateEducationOsProfile);
  const saveDocFn = useServerFn(saveOsQuestionDocument);
  const ocrFn = useServerFn(runOpenSourceOcr);
  const recordEventFn = useServerFn(recordEducationLearningEvent);
  const listDocsFn = useServerFn(listMyOsQuestionDocuments);
  const listWrongFn = useServerFn(listMyWrongBookEntries);
  const listTutorFn = useServerFn(listMyTutorSessions);
  const listAgentsFn = useServerFn(listMyEducationAgents);
  const createTutorFn = useServerFn(createTutorSession);
  const createAgentFn = useServerFn(createEducationAgent);
  const addWrongFn = useServerFn(addWrongBookEntry);

  const [tab, setTab] = useState("account");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  const [profileLoading, setProfileLoading] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [profileRole, setProfileRole] = useState<string | null>(null);

  const [questionJson, setQuestionJson] = useState(() => JSON.stringify(QUESTION_V1_DEMO, null, 2));
  const [saveVisibility, setSaveVisibility] = useState<"private" | "workspace" | "public">(
    "private",
  );
  const [saveBusy, setSaveBusy] = useState(false);

  const [ocrLang, setOcrLang] = useState("chi_sim+eng");
  const [ocrText, setOcrText] = useState("");
  const [ocrConfidence, setOcrConfidence] = useState<number | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);

  const [docs, setDocs] = useState<
    Array<{
      id: string;
      schema_version: string;
      source: string;
      visibility: string;
      created_at: string;
      stem_preview: string;
      question_id: string | null;
    }>
  >([]);
  const [wrongs, setWrongs] = useState<
    Array<{
      id: string;
      created_at: string;
      mistake_kind: string | null;
      knowledge_points: string[];
      question_document_id: string | null;
      exam_id: string | null;
      snapshot: unknown;
    }>
  >([]);
  const [tutors, setTutors] = useState<
    Array<{ id: string; title: string | null; exam_id: string | null; created_at: string }>
  >([]);
  const [agents, setAgents] = useState<
    Array<{ id: string; agent_kind: string; label: string | null; created_at: string }>
  >([]);

  const [listsLoading, setListsLoading] = useState(false);

  const [wrongDocId, setWrongDocId] = useState("");
  const [wrongExamId, setWrongExamId] = useState("");
  const [wrongKind, setWrongKind] = useState("");
  const [wrongTags, setWrongTags] = useState("");
  const [wrongBusy, setWrongBusy] = useState(false);

  const [tutorTitle, setTutorTitle] = useState("");
  const [tutorExamId, setTutorExamId] = useState("");
  const [tutorBusy, setTutorBusy] = useState(false);

  const [agentKind, setAgentKind] = useState<
    "teacher" | "student" | "tutor" | "generator" | "ocr" | "validator" | "learning"
  >("tutor");
  const [agentLabel, setAgentLabel] = useState("");
  const [agentBusy, setAgentBusy] = useState(false);

  const [eventKind, setEventKind] = useState("open_education_os");
  const [eventPayloadJson, setEventPayloadJson] = useState("{}");
  const [eventBusy, setEventBusy] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!canUseOsData) {
      setDisplayName("");
      setProfileRole(null);
      return;
    }
    setProfileLoading(true);
    try {
      const res = await getProfileFn({ ...reqOpts() });
      if (res.ok) {
        setDisplayName(String(res.profile.display_name ?? ""));
        setProfileRole(String(res.profile.role ?? ""));
      } else if (res.reason === "no_profile") {
        toast.warning(
          isLocalUnifiedPlane
            ? "尚无本地档案，请保存展示名或刷新。"
            : "尚无档案行，请稍后点击刷新（注册后触发器应已写入）。",
        );
      } else if (res.reason === "no_mysql") {
        toast.error("本机数据库未就绪；请在设置中配置并完成建表。");
      }
    } catch (e) {
      toast.error(toUserFacingErrorMessage(e));
    } finally {
      setProfileLoading(false);
    }
  }, [canUseOsData, getProfileFn, isLocalUnifiedPlane, reqOpts]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const refreshLists = useCallback(async () => {
    if (!canUseOsData) {
      setDocs([]);
      setWrongs([]);
      setTutors([]);
      setAgents([]);
      return;
    }
    setListsLoading(true);
    try {
      const [d, w, t, a] = await Promise.all([
        listDocsFn({ ...reqOpts() }),
        listWrongFn({ ...reqOpts() }),
        listTutorFn({ ...reqOpts() }),
        listAgentsFn({ ...reqOpts() }),
      ]);
      if (d.ok) setDocs(d.rows);
      else if (d.reason === "no_mysql") {
        toast.error("本机数据库未就绪，无法列出题库。");
      }
      if (w.ok) setWrongs(w.rows);
      if (t.ok) setTutors(t.rows);
      if (a.ok) setAgents(a.rows);
    } catch (e) {
      toast.error(toUserFacingErrorMessage(e));
    } finally {
      setListsLoading(false);
    }
  }, [canUseOsData, listAgentsFn, listDocsFn, listTutorFn, listWrongFn, reqOpts]);

  useEffect(() => {
    if (tab === "library" || tab === "wrongbook" || tab === "tutor" || tab === "agents") {
      void refreshLists();
    }
  }, [tab, refreshLists]);

  const onSignIn = async () => {
    setAuthBusy(true);
    try {
      const { error } = await auth.signInWithPassword(email, password);
      if (error) toast.error(error.message);
      else toast.success("已登录");
    } finally {
      setAuthBusy(false);
    }
  };

  const onSignUp = async () => {
    setAuthBusy(true);
    try {
      const { error } = await auth.signUpWithPassword(email, password);
      if (error) toast.error(error.message);
      else toast.success("注册请求已提交，请按邮箱提示验证（若项目关闭邮箱确认将直接登录）。");
    } finally {
      setAuthBusy(false);
    }
  };

  const onSaveProfile = async () => {
    if (!canUseOsData) return;
    try {
      const res = await updateProfileFn({
        data: { display_name: displayName.trim() || undefined },
        ...reqOpts(),
      });
      if (res.ok) toast.success("档案已更新");
      else if (res.reason === "no_mysql") {
        toast.error("本机数据库未就绪，无法更新档案。");
      }
    } catch (e) {
      toast.error(toUserFacingErrorMessage(e));
    }
  };

  const onValidateQuestion = () => {
    try {
      const parsed = JSON.parse(questionJson) as unknown;
      const r = safeParseQuestionSchemaV1(parsed);
      if (!r.success) {
        toast.error(r.error.issues.map((x) => x.message).join("；"));
        return;
      }
      toast.success("题目 JSON 格式正确");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "JSON 语法错误");
    }
  };

  const onSaveQuestion = async () => {
    if (!canUseOsData) {
      toast.error(isLocalUnifiedPlane ? "正在初始化本地会话…" : "请先登录");
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(questionJson) as unknown;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "JSON 语法错误");
      return;
    }
    setSaveBusy(true);
    try {
      const res = await saveDocFn({
        data: { payload: parsed, visibility: saveVisibility },
        ...reqOpts(),
      });
      if (res.ok) {
        toast.success(`已保存，文档 id：${res.id}`);
        void refreshLists();
      } else if (res.reason === "unauthorized") toast.error("未授权");
      else if (res.reason === "no_mysql") toast.error("本机数据库未就绪，无法保存。");
    } catch (e) {
      toast.error(toUserFacingErrorMessage(e));
    } finally {
      setSaveBusy(false);
    }
  };

  const onPickImageOcr = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("请选择图片文件");
      return;
    }
    setOcrBusy(true);
    setOcrText("");
    setOcrConfidence(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result ?? ""));
        r.onerror = () => reject(new Error("读取文件失败"));
        r.readAsDataURL(file);
      });
      const res = await ocrFn({
        data: { image_base64: dataUrl, languages: ocrLang.trim() || undefined },
      });
      if (res.ok) {
        setOcrText(res.text);
        setOcrConfidence(typeof res.confidence === "number" ? res.confidence : null);
        toast.success("图片识别完成");
      } else toast.error("图像无效或过短");
    } catch (e) {
      toast.error(toUserFacingErrorMessage(e));
    } finally {
      setOcrBusy(false);
    }
  };

  const onAddWrong = async () => {
    if (!canUseOsData) return;
    const qid = wrongDocId.trim();
    const eid = wrongExamId.trim();
    setWrongBusy(true);
    try {
      const res = await addWrongFn({
        data: {
          question_document_id: qid ? qid : undefined,
          exam_id: eid ? eid : undefined,
          mistake_kind: wrongKind.trim() || undefined,
          knowledge_points: wrongTags
            .split(/[,，]/)
            .map((s) => s.trim())
            .filter(Boolean),
        },
        ...reqOpts(),
      });
      if (res.ok) {
        toast.success("已记入错题本");
        void refreshLists();
      }
    } catch (e) {
      toast.error(toUserFacingErrorMessage(e));
    } finally {
      setWrongBusy(false);
    }
  };

  const onCreateTutor = async () => {
    if (!canUseOsData) return;
    const eid = tutorExamId.trim();
    setTutorBusy(true);
    try {
      const res = await createTutorFn({
        data: {
          title: tutorTitle.trim() || undefined,
          exam_id: eid ? eid : undefined,
        },
        ...reqOpts(),
      });
      if (res.ok) {
        toast.success(`已创建会话 ${res.id}`);
        setTutorTitle("");
        setTutorExamId("");
        void refreshLists();
      }
    } catch (e) {
      toast.error(toUserFacingErrorMessage(e));
    } finally {
      setTutorBusy(false);
    }
  };

  const onCreateAgent = async () => {
    if (!canUseOsData) return;
    setAgentBusy(true);
    try {
      const res = await createAgentFn({
        data: { agent_kind: agentKind, label: agentLabel.trim() || undefined },
        ...reqOpts(),
      });
      if (res.ok) {
        toast.success(`Agent 已创建 ${res.id}`);
        setAgentLabel("");
        void refreshLists();
      }
    } catch (e) {
      toast.error(toUserFacingErrorMessage(e));
    } finally {
      setAgentBusy(false);
    }
  };

  const onRecordEvent = async () => {
    if (!canUseOsData) return;
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(eventPayloadJson) as Record<string, unknown>;
    } catch {
      toast.error("学习事件内容须为合法 JSON 对象");
      return;
    }
    setEventBusy(true);
    try {
      await recordEventFn({
        data: { kind: eventKind.trim(), payload },
        ...reqOpts(),
      });
      toast.success("事件已记录");
    } catch (e) {
      toast.error(toUserFacingErrorMessage(e));
    } finally {
      setEventBusy(false);
    }
  };

  if (!isLocalUnifiedPlane && !auth.configured) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-10">
        <FormPanel title="教育 AI OS">
          <p className="text-sm text-muted-foreground">
            云端模式需完成账号服务配置，或在设置中改用本机数据库。
          </p>
        </FormPanel>
      </div>
    );
  }

  if (isLocalUnifiedPlane && !localEduUserId) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-10">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在初始化本地教育 OS 会话…
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-display text-2xl font-semibold text-foreground">教育 AI OS</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isLocalUnifiedPlane
            ? "本机模式：档案、题库、错题与学习记录写入本机数据库，适用于单机或内网。"
            : "云端模式：账号与档案走云端登录；题库与错题等数据保存在云端。"}
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <TabsList variant="portal">
          <TabsTrigger variant="portal" value="account">
            账号
          </TabsTrigger>
          <TabsTrigger variant="portal" value="ocr">
            图片识别
          </TabsTrigger>
          <TabsTrigger variant="portal" value="question">
            题目入库
          </TabsTrigger>
          <TabsTrigger variant="portal" value="library">
            我的题库
          </TabsTrigger>
          <TabsTrigger variant="portal" value="wrongbook">
            错题本
          </TabsTrigger>
          <TabsTrigger variant="portal" value="tutor">
            Tutor
          </TabsTrigger>
          <TabsTrigger variant="portal" value="agents">
            Agent
          </TabsTrigger>
          <TabsTrigger variant="portal" value="events">
            学习事件
          </TabsTrigger>
        </TabsList>

        <TabsContent value="account">
          <FormPanel title={isLocalUnifiedPlane ? "本地档案" : "登录与档案"}>
            {isLocalUnifiedPlane ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  当前为本机档案模式，展示名与下列数据保存在本机数据库中。
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={profileLoading}
                    onClick={() => void loadProfile()}
                  >
                    <RefreshCw className={cn("mr-1 h-4 w-4", profileLoading && "animate-spin")} />
                    刷新档案
                  </Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="eos-role-local">角色（只读）</Label>
                    <Input
                      id="eos-role-local"
                      readOnly
                      value={profileRole ?? "—"}
                      className={FIELD}
                    />
                  </div>
                  <div>
                    <Label htmlFor="eos-dname-local">展示名</Label>
                    <Input
                      id="eos-dname-local"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="本地展示名"
                      className={FIELD}
                    />
                  </div>
                </div>
                <Button type="button" size="sm" onClick={() => void onSaveProfile()}>
                  保存档案
                </Button>
              </div>
            ) : auth.loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                加载会话…
              </div>
            ) : auth.user ? (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void auth.signOut()}
                  >
                    <LogOut className="mr-1 h-4 w-4" />
                    退出
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={profileLoading}
                    onClick={() => void loadProfile()}
                  >
                    <RefreshCw className={cn("mr-1 h-4 w-4", profileLoading && "animate-spin")} />
                    刷新档案
                  </Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="eos-role">角色（只读）</Label>
                    <Input id="eos-role" readOnly value={profileRole ?? "—"} className={FIELD} />
                  </div>
                  <div>
                    <Label htmlFor="eos-dname">展示名</Label>
                    <Input
                      id="eos-dname"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="用于卷面或班级展示"
                      className={FIELD}
                    />
                  </div>
                </div>
                <Button type="button" size="sm" onClick={() => void onSaveProfile()}>
                  保存档案
                </Button>
              </div>
            ) : (
              <div className="grid gap-3 sm:max-w-md">
                <div>
                  <Label htmlFor="eos-email">邮箱</Label>
                  <Input
                    id="eos-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={FIELD}
                  />
                </div>
                <div>
                  <Label htmlFor="eos-pass">密码</Label>
                  <Input
                    id="eos-pass"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={FIELD}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" disabled={authBusy} onClick={() => void onSignIn()}>
                    <LogIn className="mr-1 h-4 w-4" />
                    登录
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={authBusy}
                    onClick={() => void onSignUp()}
                  >
                    <UserPlus className="mr-1 h-4 w-4" />
                    注册
                  </Button>
                </div>
              </div>
            )}
          </FormPanel>
        </TabsContent>

        <TabsContent value="ocr">
          <FormPanel title="图片识别">
            <div className="grid gap-3 sm:max-w-lg">
              <div>
                <Label htmlFor="eos-ocr-lang">语言包</Label>
                <Input
                  id="eos-ocr-lang"
                  value={ocrLang}
                  onChange={(e) => setOcrLang(e.target.value)}
                  placeholder="chi_sim+eng"
                  className={FIELD}
                />
              </div>
              <div>
                <Label htmlFor="eos-ocr-file">图片文件</Label>
                <Input
                  id="eos-ocr-file"
                  type="file"
                  accept="image/*"
                  className={cn(FIELD, "cursor-pointer")}
                  disabled={ocrBusy}
                  onChange={(e) => void onPickImageOcr(e.target.files?.[0] ?? null)}
                />
              </div>
              {ocrBusy && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  识别中（首次可能较慢）…
                </div>
              )}
              {ocrConfidence !== null && (
                <p className="text-xs text-muted-foreground">置信度（引擎返回）：{ocrConfidence}</p>
              )}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <Label>识别结果</Label>
                  {ocrText ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => void navigator.clipboard.writeText(ocrText)}
                    >
                      <Copy className="mr-1 h-3 w-3" />
                      复制
                    </Button>
                  ) : null}
                </div>
                <Textarea
                  value={ocrText}
                  readOnly
                  rows={12}
                  className="font-mono text-xs"
                  placeholder="上传图片后出现文本"
                />
              </div>
            </div>
          </FormPanel>
        </TabsContent>

        <TabsContent value="question">
          <FormPanel title="题目协议入库">
            <div className="mb-2 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setQuestionJson(JSON.stringify(QUESTION_V1_DEMO, null, 2))}
              >
                <FileJson className="mr-1 h-4 w-4" />
                填入示例
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={onValidateQuestion}>
                仅校验
              </Button>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">可见性</Label>
                <select
                  className={cn(FIELD, "w-auto py-2")}
                  value={saveVisibility}
                  onChange={(e) => setSaveVisibility(e.target.value as typeof saveVisibility)}
                >
                  <option value="private">private</option>
                  <option value="workspace">workspace</option>
                  <option value="public">public</option>
                </select>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={saveBusy}
                onClick={() => void onSaveQuestion()}
              >
                {saveBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {isLocalUnifiedPlane ? "保存到本机数据库" : "保存到云端"}
              </Button>
            </div>
            <Textarea
              value={questionJson}
              onChange={(e) => setQuestionJson(e.target.value)}
              rows={18}
              className="font-mono text-xs"
            />
          </FormPanel>
        </TabsContent>

        <TabsContent value="library">
          <FormPanel title="我的题库">
            <div className="mb-2 flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={listsLoading || !canUseOsData}
                onClick={() => void refreshLists()}
              >
                <RefreshCw className={cn("mr-1 h-4 w-4", listsLoading && "animate-spin")} />
                刷新
              </Button>
              {!canUseOsData ? (
                <span className="text-sm text-muted-foreground">
                  {isLocalUnifiedPlane ? "正在就绪…" : "登录后可查看"}
                </span>
              ) : null}
            </div>
            <ul className="space-y-2 text-sm">
              {docs.map((row) => (
                <li
                  key={row.id}
                  className="rounded-lg border border-border/70 bg-card/40 px-3 py-2"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <code className="text-xs">{row.id}</code>
                    <span className="text-xs text-muted-foreground">{row.created_at}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {row.source} · {row.visibility === "private" ? "私有" : row.visibility === "public" ? "公开" : row.visibility}
                    {row.question_id ? ` · 题号：${row.question_id}` : ""}
                  </div>
                  {row.stem_preview ? (
                    <p className="mt-1 text-foreground">{row.stem_preview}</p>
                  ) : null}
                </li>
              ))}
              {canUseOsData && !listsLoading && docs.length === 0 ? (
                <li className="text-muted-foreground">暂无文档，先在「题目入库」保存一题。</li>
              ) : null}
            </ul>
          </FormPanel>
        </TabsContent>

        <TabsContent value="wrongbook">
          <FormPanel title="错题本">
            <div className="mb-4 grid gap-2 rounded-lg border border-border/60 bg-muted/20 p-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>题目文档编号（可选）</Label>
                <Input
                  value={wrongDocId}
                  onChange={(e) => setWrongDocId(e.target.value)}
                  placeholder="来自「我的题库」"
                  className={FIELD}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>试卷编号（可选）</Label>
                <Input
                  value={wrongExamId}
                  onChange={(e) => setWrongExamId(e.target.value)}
                  className={FIELD}
                />
              </div>
              <div>
                <Label>错误类型</Label>
                <Input
                  value={wrongKind}
                  onChange={(e) => setWrongKind(e.target.value)}
                  placeholder="如 计算失误"
                  className={FIELD}
                />
              </div>
              <div>
                <Label>知识点（逗号分隔）</Label>
                <Input
                  value={wrongTags}
                  onChange={(e) => setWrongTags(e.target.value)}
                  placeholder="相似三角形, 比例"
                  className={FIELD}
                />
              </div>
              <div className="sm:col-span-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={wrongBusy || !canUseOsData}
                  onClick={() => void onAddWrong()}
                >
                  {wrongBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <BookMarked className="mr-1 h-4 w-4" />
                  )}
                  记入错题
                </Button>
              </div>
            </div>
            <ul className="space-y-2 text-sm">
              {wrongs.map((row) => (
                <li key={row.id} className="rounded-lg border border-border/70 px-3 py-2">
                  <div className="flex flex-wrap justify-between gap-2">
                    <code className="text-xs">{row.id}</code>
                    <span className="text-xs text-muted-foreground">{row.created_at}</span>
                  </div>
                  <div className="mt-1 text-xs">
                    {row.mistake_kind ?? "—"} ·{" "}
                    {(row.knowledge_points ?? []).join("、") || "无知识点标签"}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    doc {row.question_document_id ?? "—"} · exam {row.exam_id ?? "—"}
                  </div>
                </li>
              ))}
              {canUseOsData && !listsLoading && wrongs.length === 0 ? (
                <li className="text-muted-foreground">暂无记录。</li>
              ) : null}
            </ul>
          </FormPanel>
        </TabsContent>

        <TabsContent value="tutor">
          <FormPanel title="Tutor 会话">
            <div className="mb-4 flex flex-wrap gap-2 rounded-lg border border-border/60 bg-muted/20 p-3">
              <Input
                value={tutorTitle}
                onChange={(e) => setTutorTitle(e.target.value)}
                placeholder="会话标题（可选）"
                className={cn(FIELD, "max-w-xs")}
              />
              <Input
                value={tutorExamId}
                onChange={(e) => setTutorExamId(e.target.value)}
                placeholder="关联试卷编号（可选）"
                className={cn(FIELD, "max-w-xs")}
              />
              <Button
                type="button"
                size="sm"
                disabled={tutorBusy || !canUseOsData}
                onClick={() => void onCreateTutor()}
              >
                {tutorBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MessageCircle className="mr-1 h-4 w-4" />
                )}
                新建会话
              </Button>
            </div>
            <ul className="space-y-2 text-sm">
              {tutors.map((row) => (
                <li key={row.id} className="rounded-lg border border-border/70 px-3 py-2">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-medium">{row.title?.trim() || "（无标题）"}</span>
                    <code className="text-xs">{row.id}</code>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {row.created_at}
                    {row.exam_id ? ` · 试卷 ${row.exam_id}` : ""}
                  </div>
                </li>
              ))}
              {canUseOsData && !listsLoading && tutors.length === 0 ? (
                <li className="text-muted-foreground">暂无会话。</li>
              ) : null}
            </ul>
          </FormPanel>
        </TabsContent>

        <TabsContent value="agents">
          <FormPanel title="Agent 槽位">
            <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-border/60 bg-muted/20 p-3">
              <div>
                <Label className="text-xs">类型</Label>
                <select
                  className={cn(FIELD, "mt-1 w-auto")}
                  value={agentKind}
                  onChange={(e) => setAgentKind(e.target.value as typeof agentKind)}
                >
                  <option value="teacher">teacher</option>
                  <option value="student">student</option>
                  <option value="tutor">tutor</option>
                  <option value="generator">generator</option>
                  <option value="ocr">ocr</option>
                  <option value="validator">validator</option>
                  <option value="learning">learning</option>
                </select>
              </div>
              <Input
                value={agentLabel}
                onChange={(e) => setAgentLabel(e.target.value)}
                placeholder="备注名（可选）"
                className={cn(FIELD, "max-w-xs")}
              />
              <Button
                type="button"
                size="sm"
                disabled={agentBusy || !canUseOsData}
                onClick={() => void onCreateAgent()}
              >
                {agentBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Bot className="mr-1 h-4 w-4" />
                )}
                创建
              </Button>
            </div>
            <ul className="space-y-2 text-sm">
              {agents.map((row) => (
                <li key={row.id} className="rounded-lg border border-border/70 px-3 py-2">
                  <span className="font-medium">{row.agent_kind}</span>
                  {row.label ? <span className="text-muted-foreground"> — {row.label}</span> : null}
                  <div className="text-xs text-muted-foreground">{row.id}</div>
                </li>
              ))}
              {canUseOsData && !listsLoading && agents.length === 0 ? (
                <li className="text-muted-foreground">暂无 Agent。</li>
              ) : null}
            </ul>
          </FormPanel>
        </TabsContent>

        <TabsContent value="events">
          <FormPanel title="学习事件">
            <div className="grid gap-3 sm:max-w-lg">
              <div>
                <Label htmlFor="eos-ev-kind">事件类型</Label>
                <Input
                  id="eos-ev-kind"
                  value={eventKind}
                  onChange={(e) => setEventKind(e.target.value)}
                  className={FIELD}
                />
              </div>
              <div>
                <Label htmlFor="eos-ev-payload">事件内容（JSON）</Label>
                <Textarea
                  id="eos-ev-payload"
                  value={eventPayloadJson}
                  onChange={(e) => setEventPayloadJson(e.target.value)}
                  rows={6}
                  className="font-mono text-xs"
                />
              </div>
              <Button
                type="button"
                disabled={eventBusy || !canUseOsData}
                onClick={() => void onRecordEvent()}
              >
                {eventBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Activity className="mr-1 h-4 w-4" />
                )}
                上报事件
              </Button>
            </div>
          </FormPanel>
        </TabsContent>
      </Tabs>
    </div>
  );
}
