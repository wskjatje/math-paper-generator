/**
 * 记录页面筛选快照，用于定时同步给聊天模型。
 * 仅保存筛选条件与轻量上下文，不保存题干等正文内容。
 */
const LS_KEY = "mpg_page_filters_snapshot_v1";

export type PageFiltersSnapshot = {
  updatedAt: string;
  pages: {
    generate?: {
      grade?: string;
      subject?: string;
      difficulty?: string | null;
      paperKind?: string;
      examTrack?: string;
      examMode?: string;
      targetTrackId?: string;
      scopes?: string[];
      competitionFocus?: string[];
      duration?: number;
      score?: number;
    };
    library?: {
      query?: string;
      diff?: string;
      gradeFilter?: string;
      subjectFilter?: string;
      provenanceFilter?: string;
    };
  };
};

function defaultSnapshot(): PageFiltersSnapshot {
  return {
    updatedAt: new Date(0).toISOString(),
    pages: {},
  };
}

export function readPageFiltersSnapshot(): PageFiltersSnapshot {
  if (typeof window === "undefined") return defaultSnapshot();
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaultSnapshot();
    const parsed = JSON.parse(raw) as Partial<PageFiltersSnapshot>;
    return {
      updatedAt:
        typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date(0).toISOString(),
      pages: typeof parsed.pages === "object" && parsed.pages ? parsed.pages : {},
    };
  } catch {
    return defaultSnapshot();
  }
}

export function writePageFilterSnapshot<K extends keyof PageFiltersSnapshot["pages"]>(
  page: K,
  payload: NonNullable<PageFiltersSnapshot["pages"][K]>,
): void {
  if (typeof window === "undefined") return;
  const prev = readPageFiltersSnapshot();
  const next: PageFiltersSnapshot = {
    updatedAt: new Date().toISOString(),
    pages: {
      ...prev.pages,
      [page]: payload,
    },
  };
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
}
