import { createServerFn } from "@tanstack/react-start";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { resolveProjectRoot } from "@/lib/projectRoot.server";

export type SchemaPreviewEntry = { name: string; json: string };

/** Schema 快照页：读取 schemas/v1 下的 JSON Schema 文件 */
export const listSchemaPreviews = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ schemas: SchemaPreviewEntry[] }> => {
    const root = resolveProjectRoot();
    const schemaDir = path.join(root, "schemas", "v1");
    const names = ["exam-paper.schema.json", "worked-example-pack.schema.json"];
    const schemas: SchemaPreviewEntry[] = [];
    for (const name of names) {
      try {
        const json = await readFile(path.join(schemaDir, name), "utf8");
        schemas.push({ name, json });
      } catch {
        /* skip missing */
      }
    }
    return { schemas };
  },
);
