import { getRequest } from "@tanstack/react-start/server";
import {
  EXAM_STORAGE_COOKIE,
  normalizeExamStoragePreference,
  type ExamStoragePreference,
} from "@/lib/examStoragePreference.shared";

/** 从请求 Cookie 读取试卷持久化偏好（缺省为 automatic）。 */
export function getExamStoragePreferenceFromRequest(): ExamStoragePreference {
  try {
    const req = getRequest();
    const header = req.headers.get("cookie") ?? "";
    const parts = header.split(";").map((c) => c.trim());
    for (const part of parts) {
      if (part.startsWith(`${EXAM_STORAGE_COOKIE}=`)) {
        const raw = decodeURIComponent(part.slice(EXAM_STORAGE_COOKIE.length + 1));
        return normalizeExamStoragePreference(raw);
      }
    }
  } catch {
    /* no request context */
  }
  return "auto";
}
