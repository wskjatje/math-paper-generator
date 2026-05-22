import { getRequest } from "@tanstack/react-start/server";
import {
  LOCAL_EDU_USER_HEADER,
  isValidLocalEducationUserId,
} from "@/lib/educationOs/localEducationUser.shared";

export function getLocalEducationUserIdFromRequest(): string | null {
  try {
    const req = getRequest();
    const raw = req.headers.get(LOCAL_EDU_USER_HEADER)?.trim();
    return isValidLocalEducationUserId(raw) ? raw : null;
  } catch {
    return null;
  }
}
