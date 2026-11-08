import type { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import styles from "./editor-surface.module.css";

export const EDITOR_PLACEHOLDER =
  "Type or paste your filing here. Load demo motion to see a worked example.";

export type EditorSurfaceProps = Readonly<{
  editor: Editor | null;
  /** The Document text is empty: show the placeholder overlay. */
  empty: boolean;
}>;

export function EditorSurface({ editor, empty }: EditorSurfaceProps) {
  return (
    <main className={styles["main"]}>
      <div className={styles["page"]}>
        {empty ? (
          <div className={styles["placeholder"]} aria-hidden="true">
            {EDITOR_PLACEHOLDER}
          </div>
        ) : null}
        <EditorContent editor={editor} className={styles["content"]} />
      </div>
    </main>
  );
}
