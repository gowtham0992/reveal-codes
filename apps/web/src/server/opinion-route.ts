import { fetchOpinionText } from "@reveal-codes/verifier";
import type { Deps } from "@reveal-codes/verifier";
import { jsonResponse } from "./http";
import { CHECKS_BUSY } from "../notices";
import { overRouteLimit } from "./rate-limit";
import type { RouteGuard } from "./rate-limit";

const CLUSTER_ID = /^[1-9][0-9]{0,11}$/;

/** Over the limit: 429 before the id is looked at; `guard` is absent or off in demo mode. */
export async function handleOpinion(
  clusterId: string,
  deps: Deps,
  guard?: RouteGuard,
): Promise<Response> {
  const limited = overRouteLimit(guard, CHECKS_BUSY);
  if (limited !== null) return limited;
  if (!CLUSTER_ID.test(clusterId)) return jsonResponse(400, { error: "Cluster id is not valid." });
  const text = await fetchOpinionText(clusterId, deps);
  return jsonResponse(200, { clusterId, text });
}
