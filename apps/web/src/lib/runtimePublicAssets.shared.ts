/**
 * 运行时静态资源（听力音频、生成题图）在 monorepo 中的目录约定。
 * 权威写入：`<repo>/public/<kind>/`；Vite 默认托管：`<repo>/apps/web/public/<kind>/`。
 * 路径由仓库根推导，禁止写死机器绝对路径。
 */
import path from "node:path";

export const RUNTIME_PUBLIC_KINDS = ["audio", "figures", "explain"] as const;
export type RuntimePublicKind = (typeof RUNTIME_PUBLIC_KINDS)[number];

export function isRuntimePublicKind(value: string): value is RuntimePublicKind {
  return (RUNTIME_PUBLIC_KINDS as readonly string[]).includes(value);
}

/** HTTP 前缀，与写入子目录名一致：`/audio/`、`/figures/` */
export function runtimePublicUrlPrefix(kind: RuntimePublicKind): `/${RuntimePublicKind}/` {
  return `/${kind}/`;
}

/**
 * 读写候选目录（顺序稳定）：
 * 1. 仓库根 `public/<kind>`（命题/听力服务端写入点）
 * 2. `apps/web/public/<kind>`（Vite / 预览默认 static）
 */
export function runtimePublicDirCandidates(repoRoot: string, kind: RuntimePublicKind): string[] {
  const root = path.resolve(repoRoot);
  return [path.join(root, "public", kind), path.join(root, "apps", "web", "public", kind)];
}
