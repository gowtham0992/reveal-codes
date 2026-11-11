import { useEffect, useMemo, useRef } from "react";
import type { MouseEvent, RefObject } from "react";
import type { Document } from "@reveal-codes/engine";
import { itemIndexAtOffset, layoutPane, statusText } from "./layout";
import type { PaneItem } from "./layout";
import { cls, codeClass } from "./code-class";
import { PaneHeader } from "./pane-header";

export type PaneProps = Readonly<{
  document: Document;
  cursorOffset: number;
  /** F7 message or composed status (Requirement 14.3); null shows the position. */
  statusOverride: string | null;
  /** Requirement 13.3. */
  onItemClick: (offset: number) => void;
  /** Requirement 13.5. */
  onBackgroundClick: () => void;
  /** Nothing is rendered while false (Requirement 12.1). Defaults to true. */
  open?: boolean;
  /** Mode_Text for the right end of the status line; null or absent shows nothing. */
  modeText?: string | null;
}>;

type ItemProps = Readonly<{
  item: PaneItem;
  highlighted: boolean;
  cursorRef: RefObject<HTMLSpanElement | null>;
}>;

function ItemView({ item, highlighted, cursorRef }: ItemProps) {
  if (item.kind === "code") {
    return (
      <span
        role="img"
        aria-label={item.meaning}
        data-offset={item.offset}
        className={codeClass(item.family, item.failing)}
      >
        {item.text}
      </span>
    );
  }
  const shown = item.text === "\n" ? " " : item.text;
  return (
    <span
      aria-hidden="true"
      data-offset={item.offset}
      ref={highlighted ? cursorRef : undefined}
      className={highlighted ? cls("cursor") : undefined}
    >
      {shown}
    </span>
  );
}

type Line = Readonly<{ start: number; items: readonly PaneItem[] }>;

/** Items grouped into lines; a line ends after a newline Text_Item. `start` is the first item index. */
function splitLines(items: readonly PaneItem[]): Line[] {
  const lines: { start: number; items: PaneItem[] }[] = [{ start: 0, items: [] }];
  items.forEach((item, i) => {
    lines[lines.length - 1]?.items.push(item);
    if (item.kind === "text" && item.text === "\n") lines.push({ start: i + 1, items: [] });
  });
  return lines;
}

function nearestOffset(target: EventTarget): number | null {
  if (!(target instanceof Element)) return null;
  const raw = target.closest("[data-offset]")?.getAttribute("data-offset");
  return raw === null || raw === undefined ? null : Number(raw);
}

type LineProps = Readonly<{
  line: Line;
  head: number;
  endBlock: number | null;
  cursorRef: RefObject<HTMLSpanElement | null>;
}>;

function LineView({ line, head, endBlock, cursorRef }: LineProps) {
  return (
    <div className={cls("line")}>
      {line.items.map((item, i) => (
        <ItemView
          key={line.start + i}
          item={item}
          highlighted={line.start + i === head}
          cursorRef={cursorRef}
        />
      ))}
      {endBlock === null ? null : (
        <span aria-hidden="true" data-offset={endBlock} ref={cursorRef} className={cls("cursor")}>
          {"\u00A0"}
        </span>
      )}
    </div>
  );
}

export function Pane(props: PaneProps) {
  const { document, cursorOffset, statusOverride, onItemClick, onBackgroundClick } = props;
  const open = props.open ?? true;
  const layout = useMemo(() => layoutPane(document), [document]);
  const cursorRef = useRef<HTMLSpanElement | null>(null);
  const atEnd = cursorOffset >= layout.textLength;
  const head = atEnd ? -1 : itemIndexAtOffset(layout, cursorOffset);
  useEffect(() => {
    if (open) cursorRef.current?.scrollIntoView({ block: "nearest" });
  }, [open, layout, head, atEnd]);
  if (!open) return null;
  const onClick = (event: MouseEvent<HTMLDivElement>): void => {
    const offset = nearestOffset(event.target);
    if (offset === null) onBackgroundClick();
    else onItemClick(offset);
  };
  const lines = splitLines(layout.items);
  return (
    <section role="region" aria-label="Reveal Codes" className={cls("pane")}>
      <PaneHeader />
      <div className={cls("body")} onClick={onClick}>
        {lines.map((line, n) => (
          <LineView
            key={line.start}
            line={line}
            head={head}
            endBlock={atEnd && n === lines.length - 1 ? layout.textLength : null}
            cursorRef={cursorRef}
          />
        ))}
      </div>
      <div className={cls("status")}>
        <span>{statusOverride ?? statusText(document.text, cursorOffset)}</span>
        {props.modeText == null ? null : <span className={cls("modeText")}>{props.modeText}</span>}
      </div>
    </section>
  );
}
