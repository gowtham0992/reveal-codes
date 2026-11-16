"use client";

import { useEffect, useState } from "react";
import { CLEARED_FILTER, courtGroups, filterOrders, ORDER_KINDS } from "@reveal-codes/export";
import type { FilterState, KindChoice, OrderEntry } from "@reveal-codes/export";
import styles from "../../app/courts/courts.module.css";
import { kindWords } from "../order-copy";
import { decodeHash, showInactiveForHash } from "./hash";
import { InstrumentView } from "./instrument-view";
import type { CourtsModel } from "./view-model";

export type CourtsBrowserProps = Readonly<{ entries: readonly OrderEntry[]; model: CourtsModel }>;

function isKindChoice(value: string): value is KindChoice {
  return value === "all" || ORDER_KINDS.some((kind) => kind === value);
}

function scrollToHash(): void {
  const id = decodeHash(window.location.hash);
  if (id === "") return;
  document.getElementById(id)?.scrollIntoView();
}

type ControlsProps = Readonly<{ state: FilterState; onChange: (next: FilterState) => void }>;

function Controls({ state, onChange }: ControlsProps) {
  return (
    <form
      role="search"
      className={styles["controls"]}
      onSubmit={(e) => {
        e.preventDefault();
      }}
    >
      <label className={styles["field"]}>
        <span>Court, abbreviation or judge</span>
        <input
          type="text"
          value={state.query}
          onChange={(e) => {
            onChange({ ...state, query: e.target.value });
          }}
        />
      </label>
      <label className={styles["field"]}>
        <span>Kind</span>
        <select
          value={state.kind}
          onChange={(e) => {
            const value = e.target.value;
            if (isKindChoice(value)) onChange({ ...state, kind: value });
          }}
        >
          <option value="all">All kinds</option>
          {ORDER_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {kindWords[kind]}
            </option>
          ))}
        </select>
      </label>
      <label className={styles["check"]}>
        <input
          type="checkbox"
          checked={state.showInactive}
          onChange={(e) => {
            onChange({ ...state, showInactive: e.target.checked });
          }}
        />
        <span>Show rules no longer in force</span>
      </label>
    </form>
  );
}

/** The court list. The first render shows every instrument and no control, as the server does. */
export function CourtsBrowser({ entries, model }: CourtsBrowserProps) {
  const [mounted, setMounted] = useState(false);
  const [state, setState] = useState<FilterState>(CLEARED_FILTER);

  useEffect(() => {
    if (showInactiveForHash(window.location.hash, model.inactiveIds)) {
      setState((s) => ({ ...s, showInactive: true }));
    }
    setMounted(true);
  }, [model.inactiveIds]);

  useEffect(() => {
    if (mounted) scrollToHash();
  }, [mounted]);

  const shown = mounted ? filterOrders(entries, state) : entries;
  const groups = courtGroups(shown);
  return (
    <>
      {mounted ? <Controls state={state} onChange={setState} /> : null}
      {mounted ? (
        <p role="status" className={styles["count"]}>
          Showing {shown.length} of {entries.length}
        </p>
      ) : null}
      {mounted && shown.length === 0 ? (
        <p className={styles["empty"]}>
          No rule matches. Clear the filter to see every rule in force.
        </p>
      ) : null}
      {groups.map((group) => (
        <section key={group.court.abbreviation} className={styles["group"]}>
          <h2 className={styles["groupTitle"]}>
            {group.court.name} ({group.court.abbreviation})
          </h2>
          {group.entries.map((entry) => (
            <InstrumentView
              key={entry.id}
              entry={entry}
              words={model.words}
              titles={model.titles}
            />
          ))}
        </section>
      ))}
    </>
  );
}
