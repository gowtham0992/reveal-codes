"use client";

import { choiceAiLabel, choiceNoneLabel, TOOL_NAME_LINE } from "@reveal-codes/export";
import styles from "./declaration-controls.module.css";
import { useDeclaration } from "./use-declaration";
import type { UseDeclarationInput } from "./use-declaration";

const LINE_ID = "declaration-tool-line";

type ChoiceRadioProps = Readonly<{ checked: boolean; label: string; onChoose: () => void }>;

function ChoiceRadio({ checked, label, onChoose }: ChoiceRadioProps) {
  return (
    <label className={styles["choice"]}>
      <input
        type="radio"
        name="declaration"
        className={styles["radio"]}
        checked={checked}
        onChange={onChoose}
      />
      {label}
    </label>
  );
}

type ToolFieldProps = Readonly<{
  value: string;
  showLine: boolean;
  onChange: (value: string) => void;
}>;

function ToolField({ value, showLine, onChange }: ToolFieldProps) {
  return (
    <div className={styles["tool"]}>
      <label htmlFor="declaration-tool-name">Tool name</label>
      <input
        id="declaration-tool-name"
        type="text"
        className={styles["toolInput"]}
        value={value}
        aria-describedby={showLine ? LINE_ID : undefined}
        aria-invalid={showLine}
        onChange={(event) => {
          onChange(event.currentTarget.value);
        }}
      />
      {showLine ? (
        <p id={LINE_ID} className={styles["line"]}>
          {TOOL_NAME_LINE}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The Declaration question (Requirement 3): two native radios with none selected, and a
 * Tool_Name field on the second choice. Mount with key={subject}.
 */
export function DeclarationControls(props: UseDeclarationInput) {
  const view = useDeclaration(props);
  const { subject, choice, toolText, toolFault } = view;
  const showAi = choice === "declared_ai";
  const showLine = showAi && (toolText.trim() === "" || toolFault !== null);
  return (
    <fieldset className={styles["group"]}>
      <legend className={styles["legend"]}>Generative AI</legend>
      <ChoiceRadio
        checked={choice === "none"}
        label={choiceNoneLabel(subject)}
        onChoose={() => {
          view.setChoice("none");
        }}
      />
      <ChoiceRadio
        checked={showAi}
        label={choiceAiLabel(subject)}
        onChoose={() => {
          view.setChoice("declared_ai");
        }}
      />
      {showAi ? (
        <ToolField value={toolText} showLine={showLine} onChange={view.setToolText} />
      ) : null}
    </fieldset>
  );
}
