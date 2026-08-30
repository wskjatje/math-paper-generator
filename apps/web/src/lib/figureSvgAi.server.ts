/**
 * 按题干 + alt 让模型生成几何 SVG（不猜模板）。
 * 独立实现 chat 调用，避免与 exam-generation 循环依赖。
 */

import { AI_GATEWAY_URL, FIGURE_GENERATION } from "@/config/examDomain";
import {
  DEFAULT_CLOUD_MODEL,
  openAiCompatChatCompletionsUrl,
  resolveEffectiveAiRuntime,
  usesOpenAiCompatEndpoint,
  type AiRuntimePayload,
} from "@/lib/aiRuntime.shared";
import { sanitizeFigureSvg } from "@/lib/figureSvgSanitize.shared";
import { extractFirstJsonObject } from "@/lib/diagram/jsonExtract.shared";

async function chatForFigure(
  messages: Array<{ role: string; content: string }>,
  ai?: AiRuntimePayload,
  subjectId?: string,
): Promise<string> {
  // 配图属于该学科命题流程：与命题一致按学科解析模型，避免落到不兼容的默认条目
  const effective = resolveEffectiveAiRuntime(ai, {
    purpose: "exam",
    subjectId: subjectId?.trim() || undefined,
  });
  const mode = effective.mode ?? "cloud";

  if (usesOpenAiCompatEndpoint(effective)) {
    const baseUrl = effective.localBaseUrl?.trim();
    const model =
      mode === "local"
        ? effective.localModel?.trim()
        : effective.cloudModel?.trim() || effective.localModel?.trim();
    if (!baseUrl || !model) {
      throw new Error("配图需要可用的本地/自定义云端模型配置");
    }
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (effective.localApiKey?.trim()) {
      headers.Authorization = `Bearer ${effective.localApiKey.trim()}`;
    }
    const url = openAiCompatChatCompletionsUrl(baseUrl);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.2,
          max_tokens: 4096,
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`配图模型调用失败 HTTP ${res.status}: ${t.slice(0, 200)}`);
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      return String(data.choices?.[0]?.message?.content ?? "");
    } catch (e) {
      if (e instanceof Error && /HTTP \d/.test(e.message)) throw e;
      const cause =
        e instanceof Error && e.cause instanceof Error ? e.cause.message : "";
      const msg = e instanceof Error ? e.message : String(e);
      let host = url;
      try {
        host = new URL(url).host;
      } catch {
        /* keep */
      }
      throw new Error(
        `配图 AI 无法连接 ${host}（${cause || msg}）。请检查设置中的 API 地址/Key/代理`,
      );
    }
  }

  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    throw new Error("配图需要服务端 LOVABLE_API_KEY，或在设置中配置自定义 API 端点与 Key");
  }
  const modelId = effective.cloudModel?.trim() || DEFAULT_CLOUD_MODEL;
  try {
    const res = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelId,
        messages,
        temperature: 0.2,
        max_tokens: 4096,
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`配图网关失败 HTTP ${res.status}: ${t.slice(0, 200)}`);
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return String(data.choices?.[0]?.message?.content ?? "");
  } catch (e) {
    if (e instanceof Error && /配图网关失败|HTTP \d/.test(e.message)) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`配图网关连接失败（${msg}）。请配置可用的自定义 API 端点，或检查 LOVABLE_API_KEY`);
  }
}

/**
 * 让模型产出 math.geometry figure_scene（JSON），再由本地确定性渲染。
 * 禁止自由编造题干未出现的点名。
 */
export async function generateFigureSceneFromQuestionText(opts: {
  content: string;
  alt?: string;
  ai?: AiRuntimePayload;
  /** 课程学科（id 或展示名，如 math / 数学）；用于按学科解析配图模型 */
  subject?: string;
  /** 仅允许注入已经审批的可审计策略提示。 */
  learningHints?: string;
}): Promise<Record<string, unknown>> {
  const content = String(opts.content ?? "").trim();
  const alt = String(opts.alt ?? "").trim();
  if (!content) throw new Error("题干为空，无法配图");

  const system = [
    "你是中小学卷面结构化制图助手（数学 + 物理力学示意）。",
    "只输出一个可被 JSON.parse 的 JSON 对象：禁止 Markdown 代码围栏、注释、解释文字、多个对象或尾随逗号；字符串一律用双引号。",
    "平面几何用：{\"pack\":\"math.geometry\",\"version\":1,\"elements\":[{\"type\":\"point\",...},{\"type\":\"segment\",...},...]}",
    "math.geometry：point{type,id,x,y,label?:字符串}；segment{type,from,to:点id}；arrow{type,from,to:点id 或 [x,y]}（坐标轴等）；",
    "polygon{type,points:[点id...]}；circle{type,center:点id,r:数值}；label{type,at:点id 或 [x,y],text}（轴名等自由文字）；label 不用 position 字段。",
    "函数图像用：{\"pack\":\"math.function\",\"version\":1,\"elements\":[{\"type\":\"axes\",...},{\"type\":\"sampled_curve\",...},...]}",
    "math.function：axes{type,id,x:{min,max},y:{min,max}}；sampled_curve{type,id,axes,expr,domain:{min,max},variable?}；",
    "tangent{type,axes,curve,at_x,span?}（禁止 slope）；integral_region{type,axes,curve,x:{min,max}}（禁止 area）；label{type,axes,x,y,text}（自由文字标注）；",
    "expr 仅白名单：+ - * / ^、sin cos tan exp log sqrt abs、pi e、变量 x。",
    "物理力学示意用：{\"pack\":\"physics.mechanics\",\"version\":1,\"elements\":[{\"type\":\"point\",...},{\"type\":\"force\",...},...]}",
    "physics.mechanics：point{type,id,x,y,label?}；segment{type,from,to}；rect{type,x,y,width,height,label?}（块体/容器）；circle{type,center,r}（滑轮等）；",
    "liquid{type,points:[点id...]}（液面下区域）；force{type,from,to,label}（受力箭，label 必填如 F/G/f/F浮）；arrow{type,from,to}；label{type,at,text}。",
    "硬性：",
    "1. 几何/力学点名只能用题干出现的大写字母（A/B/O 等）；禁止编造题干未出现的点名。",
    "2. 函数题必须用 math.function，禁止用折线伪造曲线或手画切线/阴影。",
    "3. 浮力/滑轮/连通器/斜面/杠杆等物理「如图」必须用 physics.mechanics，禁止套用 math.geometry 或 math.function。",
    "4. 小灯泡/伏安特性 I–U 图可用 math.function，但曲线必须过原点（U=0 ⇒ I=0）；禁止 I=aU+b（b≠0）。",
    "5. 题干数值点须用 point 标出或落在 expr 曲线上；力必须用 force 并带题干中的力名。",
    "6. 切线/定积分阴影必须用 tangent / integral_region，斜率与面积由服务端从 expr 计算。",
    "7. 坐标与几何比例须与题干已给长度一致（如 OA=0.4、AB=1、s=5、h=3）；禁止捏造题干未给的尺寸。",
    "8. 物理 I–U 轴标签写在 axes.x.label / axes.y.label（如 U/V、I/A），避免再叠默认 x/y。",
    ...(FIGURE_GENERATION.aiScenePromptExtras ?? []),
    opts.learningHints?.trim() || "",
  ].filter(Boolean).join("\n");

  const user = [
    "【题干】",
    content.slice(0, 4000),
    alt ? `\n【图意】\n${alt.slice(0, 500)}` : "",
    "\n请输出 figure_scene JSON：",
  ].join("\n");

  const raw = await chatForFigure(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    opts.ai,
    opts.subject,
  );
  const parsed = extractFirstJsonObject(raw);
  if (!parsed) throw new Error("figure_scene JSON 解析失败");
  return parsed;
}

/**
 * 根据题干与图意说明生成消毒后的 SVG。
 * 失败抛错；调用方决定是否回退模板或保留 pending。
 */
export async function generateFigureSvgFromQuestionText(opts: {
  content: string;
  alt?: string;
  ai?: AiRuntimePayload;
  /** 课程学科（id 或展示名）；用于按学科解析配图模型 */
  subject?: string;
  /** 仅允许注入已经审批的可审计策略提示。 */
  learningHints?: string;
}): Promise<string> {
  const content = String(opts.content ?? "").trim();
  const alt = String(opts.alt ?? "").trim();
  if (!content) throw new Error("题干为空，无法配图");

  const system = [
    "你是中小学/竞赛数学卷面制图助手。",
    "任务：根据题干与图意说明，绘制与叙述一致的示意图，输出唯一一段合法 SVG。",
    "硬性要求：",
    "1. 只输出 <svg>...</svg>，不要 Markdown 围栏、不要解释文字。",
    "2. 必须含 xmlns=\"http://www.w3.org/2000/svg\"；viewBox 合理；黑白线稿，适合打印。",
    "3. 点、线、标注须与题干字母/关系一致（如平行、中点、对角线交点、阴影格等）。",
    "4. 禁止 script、foreignObject、外部图片、动画。",
    "5. 若题干信息不足以精确作图，仍须画出与叙述最贴近的示意图，勿编造题干未出现的条件。",
    opts.learningHints?.trim() || "",
  ].filter(Boolean).join("\n");

  const user = [
    "【题干】",
    content.slice(0, 4000),
    alt ? `\n【图意说明】\n${alt.slice(0, 500)}` : "",
    "\n请输出 SVG：",
  ].join("\n");

  const raw = await chatForFigure(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    opts.ai,
    opts.subject,
  );

  const svg = sanitizeFigureSvg(raw);
  if (!svg) {
    throw new Error("模型未返回可消毒的 SVG（请检查模型是否支持按指令只输出 SVG）");
  }
  return svg;
}
