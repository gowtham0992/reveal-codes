import { getServerContext } from "../../../../src/server/deps";
import { notAllowed } from "../../../../src/server/http";
import { handleOpinion } from "../../../../src/server/opinion-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** The Verifier waits on the citation service's request bucket for up to about a minute. */
export const maxDuration = 60;

export async function GET(
  _request: Request,
  context: { params: Promise<{ clusterId: string }> },
): Promise<Response> {
  const { clusterId } = await context.params;
  return handleOpinion(clusterId, getServerContext().deps);
}
export const POST = notAllowed("GET");
export const PUT = notAllowed("GET");
export const PATCH = notAllowed("GET");
export const DELETE = notAllowed("GET");
export const HEAD = notAllowed("GET");
export const OPTIONS = notAllowed("GET");
