// Reaches the guarded sample load (`loadOrAsk` in useDocumentActions) with text in the draft.
// Since task 22.1 no Toolbar control calls it with text, so a test calls the actions directly.
// The actions are the live ones the Shell built from its own store, services and document, so
// the tests keep asserting through the real Shell DOM.
//
// Use it in a test file as:
//   vi.mock("../src/components/shell-toolbar", async (original) =>
//     (await import("./support/document-actions-harness")).capturingToolbar(
//       await original<typeof import("../src/components/shell-toolbar")>(),
//     ),
//   );
import type { ShellToolbarProps } from "../../src/components/shell-toolbar";
import type { SampleKey } from "../../src/components/use-document-actions";
import { act } from "./render";

type Actions = ShellToolbarProps["actions"];
type ShellToolbarModule = typeof import("../../src/components/shell-toolbar");

const latest: { current: Actions | null } = { current: null };

/** Wraps the real ShellToolbar so each Shell render records its current `actions`. */
export function capturingToolbar(real: ShellToolbarModule): ShellToolbarModule {
  return {
    ...real,
    ShellToolbar: (props: ShellToolbarProps) => {
      latest.current = props.actions;
      return <real.ShellToolbar {...props} />;
    },
  };
}

function current(): Actions {
  if (latest.current === null) throw new Error("the Shell has not rendered its Toolbar");
  return latest.current;
}

/** Calls `onLoadDemo()` inside `act`, as the Toolbar button did. */
export async function loadDemo(): Promise<void> {
  await act(async () => {
    current().onLoadDemo();
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** Calls `onLoadSample(key)` inside `act`, as the Toolbar button and the Empty_Page link did. */
export async function loadSample(key: SampleKey): Promise<void> {
  await act(async () => {
    current().onLoadSample(key);
    await Promise.resolve();
    await Promise.resolve();
  });
}
