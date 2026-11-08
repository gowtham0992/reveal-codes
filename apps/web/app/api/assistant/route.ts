import { handleAssistant } from "../../../src/server/assistant-route";
import { getServerContext } from "../../../src/server/deps";
import { notAllowed } from "../../../src/server/http";
import { defaultDraftOptions } from "../../../src/server/llm-default";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = (request: Request): Promise<Response> =>
  handleAssistant(request, getServerContext().config.assistant, defaultDraftOptions);
export const GET = notAllowed("POST");
export const PUT = notAllowed("POST");
export const PATCH = notAllowed("POST");
export const DELETE = notAllowed("POST");
export const HEAD = notAllowed("POST");
export const OPTIONS = notAllowed("POST");
