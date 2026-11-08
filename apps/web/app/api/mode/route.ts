import { getServerContext } from "../../../src/server/deps";
import { notAllowed } from "../../../src/server/http";
import { handleMode } from "../../../src/server/mode-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = (): Response => handleMode(getServerContext().config);
export const POST = notAllowed("GET");
export const PUT = notAllowed("GET");
export const PATCH = notAllowed("GET");
export const DELETE = notAllowed("GET");
export const HEAD = notAllowed("GET");
export const OPTIONS = notAllowed("GET");
