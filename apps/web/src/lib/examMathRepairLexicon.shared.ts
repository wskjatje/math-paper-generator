/** 命题一类数学修复（自学规则）：与 data/exam-math-repair-overrides.json / exam_math_repair_rules 表字段对齐 */
export type PersistedExamMathRepairRule = {
  id: string;
  find: string;
  replace: string;
  flags?: string;
};
