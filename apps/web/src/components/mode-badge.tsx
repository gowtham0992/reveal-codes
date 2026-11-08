"use client";

import { useEffect, useState } from "react";
import type { ApiClient, AssistantInfo } from "../client/api";
import styles from "./mode-badge.module.css";

/** `loading` shows nothing; `unreachable` is a failed request (Requirement 15.8). */
export type ServerMode = "loading" | "fixtures" | "live" | "unreachable";

export const BADGE_TEXT = {
  fixtures: "Demo mode: recorded CourtListener responses",
  live: "Live CourtListener lookups",
  unreachable: "Server unreachable",
} as const;

/** Asks `GET /api/mode` once after mount. A rejected request becomes `unreachable`, never a throw. */
export function useServerMode(api: ApiClient): ServerMode {
  return useModeResult(api).mode;
}

export type ModeResult = Readonly<{ mode: ServerMode; assistant: AssistantInfo | null }>;

/** The same single request, also exposing the Tier 2 `assistant` field (null when absent). */
export function useModeResult(api: ApiClient): ModeResult {
  const [result, setResult] = useState<ModeResult>({ mode: "loading", assistant: null });
  useEffect(() => {
    let current = true;
    void api.mode().then((r) => {
      if (!current) return;
      if (r.ok) setResult({ mode: r.value.mode, assistant: r.value.assistant ?? null });
      else setResult({ mode: "unreachable", assistant: null });
    });
    return () => {
      current = false;
    };
  }, [api]);
  return result;
}

export type ModeBadgeProps = Readonly<{ mode: ServerMode }>;

export function ModeBadge({ mode }: ModeBadgeProps) {
  if (mode === "loading") return null;
  return <span className={styles["modeBadge"]}>{BADGE_TEXT[mode]}</span>;
}
