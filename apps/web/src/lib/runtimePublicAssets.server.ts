/**
 * 运行时 public 资源写入 / 探测（听力、题图）。
 * 多目录同步，避免「写在仓库根、Vite 只读 apps/web/public」导致 404。
 */
import { access, cp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveProjectRoot } from "@/lib/projectRoot.server";
import {
  runtimePublicDirCandidates,
  type RuntimePublicKind,
} from "@/lib/runtimePublicAssets.shared";

export function runtimePublicDirs(kind: RuntimePublicKind): string[] {
  return runtimePublicDirCandidates(resolveProjectRoot(), kind);
}

/** 权威写入根（候选列表首项） */
export function runtimePublicPrimaryDir(kind: RuntimePublicKind): string {
  return runtimePublicDirs(kind)[0]!;
}

/**
 * 将相对 `kind` 根的文件写入所有候选目录；返回权威绝对路径。
 * @param relativePath e.g. `<examId>/q-1-xxx.svg` 或 `<examId>/track-01.wav`
 */
export async function writeRuntimePublicFile(
  kind: RuntimePublicKind,
  relativePath: string,
  data: string | Uint8Array,
): Promise<string> {
  const rel = relativePath.replace(/^[/\\]+/, "");
  if (!rel || rel.includes("..")) {
    throw new Error(`非法运行时资源相对路径：${relativePath}`);
  }
  const dirs = runtimePublicDirs(kind);
  let primaryAbs = "";
  for (const base of dirs) {
    const abs = path.join(base, rel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, data);
    if (!primaryAbs) primaryAbs = abs;
  }
  return primaryAbs;
}

/** 将权威目录下某子树同步到其余候选目录（听力整卷生成后调用） */
export async function syncRuntimePublicSubtree(
  kind: RuntimePublicKind,
  relativeDir: string,
): Promise<void> {
  const rel = relativeDir.replace(/^[/\\]+/, "").replace(/[/\\]+$/, "");
  if (!rel || rel.includes("..")) return;
  const dirs = runtimePublicDirs(kind);
  const primary = path.join(dirs[0]!, rel);
  try {
    await access(primary);
  } catch {
    return;
  }
  for (const base of dirs.slice(1)) {
    const dest = path.join(base, rel);
    await mkdir(path.dirname(dest), { recursive: true });
    await cp(primary, dest, { recursive: true, force: true });
  }
}

/** 任一候选目录存在该相对文件即视为就绪 */
export async function runtimePublicFileExists(
  kind: RuntimePublicKind,
  relativePath: string,
): Promise<boolean> {
  const rel = relativePath.replace(/^[/\\]+/, "");
  if (!rel || rel.includes("..")) return false;
  for (const base of runtimePublicDirs(kind)) {
    try {
      await access(path.join(base, rel));
      return true;
    } catch {
      /* try next */
    }
  }
  return false;
}
