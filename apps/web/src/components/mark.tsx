import styles from "./mark.module.css";

/**
 * The mark, shown beside the wordmark. It is the favicon file itself (`app/icon.svg`, served at
 * /icon.svg), so there is one drawing. Decorative: the wordmark beside it carries the name.
 */
export function Mark() {
  return (
    // A plain img: the file is the favicon, and next/image would resize or re-encode it.
    <img
      src="/icon.svg"
      alt=""
      aria-hidden="true"
      width={24}
      height={24}
      className={styles["mark"]}
    />
  );
}
