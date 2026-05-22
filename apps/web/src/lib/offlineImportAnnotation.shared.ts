/** 线下导入原图对照标注（坐标归一化 0–1）；可随 {@link OfflineImportPersistedMedia} 入库 */

export type OfflineImportAnnotTool = "error_box" | "omit_oval" | "reverse_z" | "pan";

export type OfflineImportImageAnnotation =
  | {
      id: string;
      imageIndex: number;
      kind: "error_box";
      nx: number;
      ny: number;
      nw: number;
      nh: number;
    }
  | {
      id: string;
      imageIndex: number;
      kind: "omit_oval";
      nx: number;
      ny: number;
      nw: number;
      nh: number;
    }
  | {
      id: string;
      imageIndex: number;
      kind: "reverse_z";
      nx: number;
      ny: number;
    };

/** 新增标注（无 id） */
export type NewOfflineImportImageAnnotation =
  | Omit<Extract<OfflineImportImageAnnotation, { kind: "error_box" }>, "id">
  | Omit<Extract<OfflineImportImageAnnotation, { kind: "omit_oval" }>, "id">
  | Omit<Extract<OfflineImportImageAnnotation, { kind: "reverse_z" }>, "id">;

function newAnnotationId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `a-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createOfflineImportAnnotation(
  partial: NewOfflineImportImageAnnotation,
): OfflineImportImageAnnotation {
  return { ...partial, id: newAnnotationId() } as OfflineImportImageAnnotation;
}
