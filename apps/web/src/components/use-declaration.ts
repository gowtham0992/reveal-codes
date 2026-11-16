import { checkToolName, declareAi, declareNone } from "@reveal-codes/engine";
import type { Declaration, DeclarationSubject, ToolNameFault } from "@reveal-codes/engine";
import { useState } from "react";

export type DeclarationChoice = "none" | "declared_ai";

export type DeclarationView = Readonly<{
  subject: DeclarationSubject;
  /** No applicable Declaration is stored (Declaration_Required). */
  required: boolean;
  /** The radio selection; null until the author picks one. */
  choice: DeclarationChoice | null;
  toolText: string;
  /** Fault of the typed name; null when empty or valid. */
  toolFault: ToolNameFault | null;
  setChoice: (choice: DeclarationChoice) => void;
  setToolText: (text: string) => void;
}>;

export type UseDeclarationInput = Readonly<{
  subject: DeclarationSubject;
  /** The Applicable_Declaration for this subject, or null. */
  applicable: Declaration | null;
  /** Writes the stored Declaration; null makes it Pending. Stays on the machine. */
  onDeclare: (declaration: Declaration | null) => void;
}>;

function faultOf(choice: DeclarationChoice | null, text: string): ToolNameFault | null {
  if (choice !== "declared_ai" || text.trim() === "") return null;
  const checked = checkToolName(text);
  return checked.ok ? null : checked.error;
}

/**
 * Local state of the declaration controls (Requirement 3). The initial state is read from the
 * Applicable_Declaration only: no default, nothing derived from the text. Mount the controls
 * with key={subject} so a change of subject starts again.
 */
export function useDeclaration({ subject, applicable, onDeclare }: UseDeclarationInput): DeclarationView {
  const [choice, setChoiceState] = useState<DeclarationChoice | null>(applicable?.choice ?? null);
  const [toolText, setToolTextState] = useState(
    applicable?.choice === "declared_ai" ? applicable.toolName : "",
  );
  const declareTool = (text: string): void => {
    const made = declareAi(subject, text);
    onDeclare(made.ok ? made.value : null);
  };
  const setChoice = (next: DeclarationChoice): void => {
    setChoiceState(next);
    if (next === "none") {
      setToolTextState("");
      onDeclare(declareNone(subject));
    } else {
      declareTool(toolText);
    }
  };
  const setToolText = (text: string): void => {
    setToolTextState(text);
    declareTool(text);
  };
  return {
    subject,
    required: applicable === null,
    choice,
    toolText,
    toolFault: faultOf(choice, toolText),
    setChoice,
    setToolText,
  };
}
