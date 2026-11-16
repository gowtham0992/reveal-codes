import type { DeclarationSubject, EngineError, ToolNameFault } from "@reveal-codes/engine";

/** Error values of buildStatement: the Engine's own, plus the two declaration faults. */
export type StatementError =
  | EngineError
  | Readonly<{ kind: "declaration_required"; subject: DeclarationSubject }>
  | Readonly<{ kind: "invalid_tool_name"; fault: ToolNameFault }>;
