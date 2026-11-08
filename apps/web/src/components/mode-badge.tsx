"use client";

import { useEffect, useState } from "react";
import type { ApiClient } from "../client/api";
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
  const [mode, setMode] = useState<ServerMode>("loading");
  useEffect(() => {
    let current = true;
    void api.mode().then((result) => {
      if (current) setMode(result.ok ? result.value.mode : "unreachable");
    });
    return () => {
      current = false;
    };
  }, [api]);
  return mode;
}

export type ModeBadgeProps = Readonly<{ mode: ServerMode }>;

export function ModeBadge({ mode }: ModeBadgeProps) {
  if (mode === "loading") return null;
  return <span className={styles["modeBadge"]}>{BADGE_TEXT[mode]}</span>;
}
