import { getServerContext } from "../../../src/server/deps";
import { notAllowed } from "../../../src/server/http";
import { handleVerify } from "../../../src/server/verify-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** The Verifier waits on the citation service's request bucket for up to about a minute. */
export const maxDuration = 60;

export const POST = (request: Request): Promise<Response> =>
  handleVerify(request, getServerContext().deps);
export const GET = notAllowed("POST");
export const PUT = notAllowed("POST");
export const PATCH = notAllowed("POST");
export const DELETE = notAllowed("POST");
export const HEAD = notAllowed("POST");
export const OPTIONS = notAllowed("POST");
