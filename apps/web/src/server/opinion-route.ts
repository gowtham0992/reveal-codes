import { fetchOpinionText } from "@reveal-codes/verifier";
import type { Deps } from "@reveal-codes/verifier";
import { jsonResponse } from "./http";

const CLUSTER_ID = /^[1-9][0-9]{0,11}$/;

export async function handleOpinion(clusterId: string, deps: Deps): Promise<Response> {
  if (!CLUSTER_ID.test(clusterId)) return jsonResponse(400, { error: "Cluster id is not valid." });
  const text = await fetchOpinionText(clusterId, deps);
  return jsonResponse(200, { clusterId, text });
}
