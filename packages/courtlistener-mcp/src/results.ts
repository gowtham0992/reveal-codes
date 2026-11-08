/** MCP tool results: one JSON text block, with `isError` set for tool errors. */
export type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: true;
};

export function okResult(payload: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(payload) }] };
}

export function errorResult(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}
