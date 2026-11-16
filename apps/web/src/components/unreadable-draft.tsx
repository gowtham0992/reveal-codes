import { UNREADABLE_DRAFT } from "../notices";
import styles from "./unreadable-draft.module.css";

export type UnreadableDraftProps = Readonly<{
  onSaveCopy: () => void;
  onStartNew: () => void;
}>;

/** The Draft_Notice (Requirement 23): the sentence is the status; the buttons act, so sit outside it. */
export function UnreadableDraft({ onSaveCopy, onStartNew }: UnreadableDraftProps) {
  return (
    <div className={styles["draft"]}>
      <p role="status" className={styles["text"]}>
        {UNREADABLE_DRAFT}
      </p>
      <div className={styles["actions"]}>
        <button type="button" onClick={onSaveCopy}>
          Save a copy
        </button>
        <button type="button" onClick={onStartNew}>
          Start a new document
        </button>
      </div>
    </div>
  );
}
