import type { PaneItem } from "./layout";

export type Segment = Readonly<{ block: boolean; items: readonly PaneItem[] }>;

type Kind = "opener" | "closer" | "other";

function failingKind(item: PaneItem): Kind {
  if (item.kind !== "code" || !item.failing) return "other";
  return item.text.startsWith("[/") ? "closer" : "opener";
}

/** Whether `item` is drawn inside a block, given the carried depth before it; returns the new depth. */
function step(depth: number, item: PaneItem): Readonly<{ inBlock: boolean; depth: number }> {
  const kind = failingKind(item);
  if (kind === "opener") return { inBlock: true, depth: depth + 1 };
  if (kind === "closer") return { inBlock: depth > 0, depth: Math.max(0, depth - 1) };
  return { inBlock: depth > 0, depth };
}

/**
 * Regroups each line's items into runs that are inside or outside a Failing_Block. The depth
 * carries across lines, so a block that spans a line break is a block on each line.
 */
export function blockSegments(
  lines: readonly (readonly PaneItem[])[],
): readonly (readonly Segment[])[] {
  let depth = 0;
  return lines.map((line) => {
    const segments: { block: boolean; items: PaneItem[] }[] = [];
    for (const item of line) {
      const next = step(depth, item);
      depth = next.depth;
      const last = segments[segments.length - 1];
      if (last !== undefined && last.block === next.inBlock) last.items.push(item);
      else segments.push({ block: next.inBlock, items: [item] });
    }
    return segments;
  });
}
