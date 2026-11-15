import type { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import styles from "./editor-surface.module.css";

export const EDITOR_PLACEHOLDER =
  "Type or paste your filing here. Load demo motion to see a worked example.";

export type EditorSurfaceProps = Readonly<{
  editor: Editor | null;
  /** The Document text is empty: show the placeholder overlay. */
  empty: boolean;
  /** Loads a sample into the empty page; the links render only when this is given. */
  onLoadSample?: (key: "demo" | "avianca") => void;
}>;

const SAMPLE_LINKS = [
  { key: "demo", label: "Load demo motion", href: "/demo-motion.txt" },
  { key: "avianca", label: "Load the Avianca citations", href: "/avianca-citations.txt" },
] as const;

export function EditorSurface({ editor, empty, onLoadSample }: EditorSurfaceProps) {
  return (
    <main className={styles["main"]}>
      <div className={styles["page"]}>
        {empty ? (
          <div className={styles["placeholder"]} aria-hidden="true">
            {EDITOR_PLACEHOLDER}
          </div>
        ) : null}
        {empty && onLoadSample !== undefined ? (
          <ul className={styles["samples"]}>
            {SAMPLE_LINKS.map((l) => (
              <li key={l.key}>
                <a
                  href={l.href}
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
        ) : null}
        <EditorContent editor={editor} className={styles["content"]} />
      </div>
    </main>
  );
}
