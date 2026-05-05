import {
  EXAM_STORAGE_COOKIE,
  normalizeExamStoragePreference,
  type ExamStoragePreference,
} from "@/lib/examStoragePreference.shared";

const LS_KEY = "mpg_exam_storage_pref_v1";

export type { ExamStoragePreference };

export function loadExamStoragePreference(): ExamStoragePreference {
  if (typeof window === "undefined") return "auto";
  try {
    const raw = localStorage.getItem(LS_KEY);
    return normalizeExamStoragePreference(raw);
  } catch {
    return "auto";
  }
}

/** 写入本机并同步 Cookie，便于服务端 loader / Server Fn 读取同一偏好。 */
export function saveExamStoragePreference(pref: ExamStoragePreference): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LS_KEY, pref);
  document.cookie = `${EXAM_STORAGE_COOKIE}=${encodeURIComponent(pref)}; path=/; max-age=31536000; SameSite=Lax`;
}

/** 将 localStorage 中的偏好写回 Cookie（例如首次从试卷库进入时尚未带 Cookie）。 */
export function syncExamStoragePreferenceToCookie(): void {
  const pref = loadExamStoragePreference();
  saveExamStoragePreference(pref);
}
