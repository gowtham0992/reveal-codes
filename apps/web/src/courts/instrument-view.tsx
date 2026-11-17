import type { OrderEntry } from "@reveal-codes/export";
import styles from "../../app/courts/courts.module.css";
import { appliesWords, curlyQuoted, judgeLine, kindWords, placementWords } from "../order-copy";
import type { CourtsModel } from "./view-model";

export type InstrumentViewProps = Readonly<{
  entry: OrderEntry;
  words: CourtsModel["words"];
  titles: CourtsModel["titles"];
}>;

function SupersededBy(props: Readonly<{ id: string; titles: CourtsModel["titles"] }>) {
  const title = props.titles[props.id];
  if (title === undefined) return null;
  return (
    <>
      {" Replaced by "}
      <a href={`#${props.id}`}>{title}</a>.
    </>
  );
}

function NotInForce(props: InstrumentViewProps) {
  const { entry, titles } = props;
  if (entry.status === "current") return null;
  return (
    <p className={styles["status"]}>
      Not in force.
      {entry.superseded_by === undefined ? null : (
        <SupersededBy id={entry.superseded_by} titles={titles} />
      )}
    </p>
  );
}

function Meta(props: Readonly<{ entry: OrderEntry }>) {
  const { entry } = props;
  const showInstrument = entry.title !== "" && entry.title !== entry.instrument;
  return (
    <div className={styles["meta"]}>
      {showInstrument ? <p className={styles["line"]}>{entry.instrument}</p> : null}
      {entry.judge === null ? null : <p className={styles["line"]}>{judgeLine(entry.judge)}</p>}
      <p className={styles["line"]}>
        {kindWords[entry.kind]}. Applies to {appliesWords[entry.applies_to]}.
      </p>
      <p className={styles["line"]}>
        {entry.date}
        {entry.date_note === undefined ? "" : ` ${entry.date_note}`}
      </p>
    </div>
  );
}

function Elements(props: InstrumentViewProps) {
  const { entry, words } = props;
  if (entry.elements.length === 0) return null;
  return (
    <>
      <p className={styles["label"]}>Requires</p>
      <ul className={styles["elements"]}>
        {entry.elements.map((element) => (
          <li key={element}>{words.elements[element]}</li>
        ))}
      </ul>
    </>
  );
}

function RequiredHeading(props: Readonly<{ entry: OrderEntry }>) {
  const { caption } = props.entry;
  if (caption === null) return null;
  const placement = placementWords[caption.placement].toLowerCase();
  return (
    <p className={styles["line"]}>
      Required heading: {curlyQuoted(caption.text)} ({placement})
    </p>
  );
}

function Asks(props: InstrumentViewProps) {
  return (
    <div className={styles["asks"]}>
      <Elements {...props} />
      <RequiredHeading entry={props.entry} />
      <blockquote className={styles["quotation"]}>
        {curlyQuoted(props.entry.key_language)}
      </blockquote>
    </div>
  );
}

/** One instrument as the dataset records it. No hooks, so server and client render alike. */
export function InstrumentView(props: InstrumentViewProps) {
  const { entry } = props;
  const title = entry.title === "" ? entry.instrument : entry.title;
  return (
    <article id={entry.id} className={styles["instrument"]}>
      <h3 className={styles["instrumentTitle"]}>{title}</h3>
      <NotInForce {...props} />
      <Meta entry={entry} />
      <Asks {...props} />
      <p className={styles["links"]}>
        <a href={entry.source_url} target="_blank" rel="noreferrer">
          Read the court&apos;s text
        </a>
        {entry.status === "current" ? (
          <a href={`/?order=${encodeURIComponent(entry.id)}`}>Draft under this rule</a>
        ) : null}
      </p>
    </article>
  );
}
