import type { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import styles from "./editor-surface.module.css";

export const EDITOR_PLACEHOLDER = "Type or paste your filing here, or open a draft.";

export type EditorSurfaceProps = Readonly<{
  editor: Editor | null;
  /** The Document text is empty: show the placeholder overlay. */
  empty: boolean;
  /** Loads a sample into the empty page; the links render only when this is given. */
  onLoadSample?: (key: "demo" | "avianca") => void;
  /** Opens the Picker; the "Open a draft" link renders only when this is given. */
  onOpenDraft?: () => void;
  /** Props of the hidden file input behind the Open button and the "Open a draft" link. */
  openInput?: React.ComponentProps<"input">;
}>;

const SAMPLE_LINKS = [
  { key: "demo", label: "Load demo motion", href: "/demo-motion.txt" },
  { key: "avianca", label: "Load the Avianca citations", href: "/avianca-citations.txt" },
] as const;

type SampleLinksProps = Readonly<{
  onLoadSample: (key: "demo" | "avianca") => void;
  onOpenDraft: (() => void) | undefined;
}>;

function SampleLinks({ onLoadSample, onOpenDraft }: SampleLinksProps) {
  return (
    <ul className={styles["samples"]}>
      {onOpenDraft === undefined ? null : (
        <li>
          <a
            href="#open-draft"
            onMouseDown={(e) => {
              e.preventDefault();
            }}
            onClick={(e) => {
              e.preventDefault();
              onOpenDraft();
            }}
          >
            Open a draft
          </a>
        </li>
      )}
      {SAMPLE_LINKS.map((l) => (
        <li key={l.key}>
          <a
            href={l.href}
            onMouseDown={(e) => {
              e.preventDefault();
            }}
            onClick={(e) => {
              e.preventDefault();
              onLoadSample(l.key);
            }}
          >
            {l.label}
          </a>
        </li>
      ))}
    </ul>
  );
}

export function EditorSurface({
  editor,
  empty,
  onLoadSample,
  onOpenDraft,
  openInput,
}: EditorSurfaceProps) {
  return (
    <main className={styles["main"]}>
      {openInput === undefined ? null : (
        <input type="file" hidden aria-label="Open a draft file" {...openInput} />
      )}
      <div className={styles["page"]}>
        {empty ? (
          <div className={styles["placeholder"]} aria-hidden="true">
            {EDITOR_PLACEHOLDER}
          </div>
        ) : null}
        <EditorContent editor={editor} className={styles["content"]} />
        {empty && onLoadSample !== undefined ? (
          <SampleLinks onLoadSample={onLoadSample} onOpenDraft={onOpenDraft} />
        ) : null}
      </div>
    </main>
  );
}
