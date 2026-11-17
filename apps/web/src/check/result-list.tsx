import type { Document, IssueKey } from "@reveal-codes/engine";
import type { DisplayInfo } from "@reveal-codes/verifier/link";
import { checkRows, shorten } from "../client/check-rows";
import type { CheckRow } from "../client/check-rows";
import { CourtListenerLink } from "../components/courtlistener-link";
import { MismatchLines } from "../components/mismatch-lines";
import { CodeLabel } from "../pane/code-label";

/** Class names the page's stylesheet supplies; every key is optional. */
export type ResultListClasses = Readonly<
  Partial<
    Record<"list" | "item" | "head" | "words" | "text" | "line" | "diverges" | "next", string>
  >
>;

function ResultItem({
  row,
  classes,
}: Readonly<{ row: CheckRow; classes: ResultListClasses }>): React.JSX.Element {
  return (
    <li className={classes.item}>
      <p className={classes.head}>
        <CodeLabel code={row.code} /> <span className={classes.words}>{row.words}</span>
      </p>
      <p className={classes.text}>{shorten(row.text)}</p>
      {row.found === null ? null : <p className={classes.line}>{row.found}</p>}
      <MismatchLines lines={row.mismatch} className={classes.line} />
      {row.divergence === null ? null : (
        <p className={classes.diverges}>{`Diverges at: ${row.divergence}`}</p>
      )}
      <CourtListenerLink href={row.href} />
      {row.next === null ? null : <p className={classes.next}>{row.next}</p>}
    </li>
  );
}

/** The Result_Items of a checked Document, one block each, in document order. */
export function ResultList({
  document,
  info,
  classes = {},
}: Readonly<{
  document: Document;
  info: ReadonlyMap<IssueKey, DisplayInfo> | undefined;
  classes?: ResultListClasses;
}>): React.JSX.Element {
  const rows = checkRows(document, info);
  return (
    <ul className={classes.list}>
      {rows.map((row) => (
        <ResultItem key={`${row.kind}:${row.key}`} row={row} classes={classes} />
      ))}
    </ul>
  );
}
