import { useSyncExternalStore } from "react";
import { NARROW_WIDTH } from "../services";
import type { AppServices } from "../services";

/** True at NARROW_WIDTH or more. False on the server, so server HTML is the narrow page. */
export function useWide(svc: Pick<AppServices, "viewport">): boolean {
  return useSyncExternalStore(
    svc.viewport.subscribe,
    () => svc.viewport.width() >= NARROW_WIDTH,
    () => false,
  );
}
