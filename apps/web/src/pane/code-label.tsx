import { codeClass } from "./code-class";
import styles from "./code-label.module.css";
import { isFailingOpener } from "./failing";
import { codeFamily } from "./layout";

/** The eight display codes a Result_Item can carry; the same set as `RowCode` in check-rows. */
export type CodeLabelCode =
  | "CIT ✓"
  | "CIT ✘"
  | "CIT ≠"
  | "CIT ?"
  | "CIT …"
  | "QUO ✓"
  | "QUO ✘"
  | "QUO …";

/** A code shown on its own, in the Pane's colours on the Pane's ground. The text is the code. */
export function CodeLabel({ code }: Readonly<{ code: CodeLabelCode }>): React.JSX.Element {
  const failing = isFailingOpener(code);
  const className = [
    codeClass(codeFamily(code), failing),
    styles.label,
    failing ? styles.fail : "",
  ]
    .filter((c) => c !== "")
    .join(" ");
  return <span className={className}>{code}</span>;
}
