import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ImportLayoutAstStubV1 } from "@/lib/importPipelineGates.shared";
import { isImportLayoutAstPersistEnabledFromEnv } from "@/lib/importPipelineGates.shared";
import { resolveProjectRoot } from "@/lib/projectRoot.server";

/**
 * 将轨 B 占位 AST 写入仓库根 `data/import-layout-stubs/<examId>.json`。
 * 仅当 MPG_IMPORT_LAYOUT_AST_PERSIST=1 时执行；否则立即返回 false。
 */
export async function persistImportLayoutAstStubIfEnabled(
  examId: string,
  stub: ImportLayoutAstStubV1,
): Promise<boolean> {
  if (!isImportLayoutAstPersistEnabledFromEnv()) return false;
  const safe = examId.replace(/[^a-zA-Z0-9-]/g, "_");
  if (!safe) return false;
  const root = resolveProjectRoot();
  const dir = path.join(root, "data", "import-layout-stubs");
  await mkdir(dir, { recursive: true });
  const fp = path.join(dir, `${safe}.json`);
  await writeFile(fp, `${JSON.stringify(stub, null, 2)}\n`, "utf8");
  return true;
}
