/** 题图 Pack 契约（跨学科共用形状；学科细节在各 Pack 内） */

export type DiagramPackId =
  | "math.geometry"
  | "math.function"
  | "physics.circuit"
  | "physics.mechanics"
  | "physics.optics"
  | "chemistry.apparatus"
  | "chemistry.particle"
  | "biology.structure"
  | "geography.map"
  | "chinese.illustration"
  | "english.diagram"
  | (string & {});

export type FigureVerifyStatus =
  | "pending"
  | "machine_passed"
  | "rejected"
  | "human_approved";

/** 各 Pack scene 的公共壳；`elements` 由 Pack 定义 */
export interface DiagramSceneBase {
  pack: DiagramPackId;
  version: number;
}

export interface DiagramValidateOk {
  ok: true;
  warnings?: string[];
}

export interface DiagramValidateFail {
  ok: false;
  errors: string[];
}

export type DiagramValidateResult = DiagramValidateOk | DiagramValidateFail;

export interface DiagramRenderResult {
  svg: string;
  width: number;
  height: number;
}
