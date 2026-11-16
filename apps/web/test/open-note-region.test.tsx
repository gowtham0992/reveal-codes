// @vitest-environment jsdom
import { createDocument } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { IssuesRegion } from "../src/components/issues-region";
import { createStore } from "../src/store-runtime";
import { EXPORT_NOW } from "./support/export-fixtures";
import { ISO } from "./support/persist-fixtures";
import { act, renderUi, screen } from "./support/render";

const CHANGED =
  "This file was changed after it was exported, so its provenance record was not restored. The text is marked as pasted.";

function mount() {
  const created = createDocument("One sentence here.", ISO);
  if (!created.ok) throw new Error("fixture rejected");
  const store = createStore(() => EXPORT_NOW);
  store.dispatch({ type: "openNote", text: CHANGED });
  renderUi(
    <IssuesRegion
      document={created.value}
      store={store}
      now={() => EXPORT_NOW}
      onGo={() => undefined}
      verifiedAt={null}
      note={null}
      verify={{ start: () => undefined, disabled: false }}
    />,
  );
  return store;
}

const shown = (): boolean =>
  screen.getAllByRole("status").some((el) => el.tagName === "P" && el.textContent === CHANGED);

describe("Open_Note in the Issues region _Requirements: 15.1, 15.2, 15.6_", () => {
  it("shows the changed-export note in a p with role status, and empties it when cleared", () => {
    const store = mount();
    expect(shown()).toBe(true);
    act(() => {
      store.dispatch({ type: "openNote", text: null });
    });
    expect(shown()).toBe(false);
  });

  it("is cleared when replace installs another Document", () => {
    const store = mount();
    const next = createDocument("Another.", ISO);
    if (!next.ok) throw new Error("fixture rejected");
    act(() => {
      store.dispatch({ type: "replace", document: next.value });
    });
    expect(shown()).toBe(false);
  });
});
