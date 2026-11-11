import type { CodeFamily } from "./layout";
import styles from "./pane.module.css";

/** Joins class names, mapping each through the CSS module when it defines the name. */
export function cls(...names: readonly string[]): string {
  return names.map((n) => styles[n] ?? n).join(" ");
}

/** Class name of a family: lowercased with non-letters removed (`AI>HUM` is `aihum`). */
function familyClass(family: CodeFamily): string {
  return family.toLowerCase().replace(/[^a-z]/g, "");
}

/** The class list of a Code_Item; a Failing_Code takes the failing class instead of its family's. */
export function codeClass(family: CodeFamily, failing: boolean): string {
  return cls("code", failing ? "failing" : familyClass(family));
}
