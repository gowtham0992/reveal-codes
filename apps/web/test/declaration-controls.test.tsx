// @vitest-environment jsdom
import type { Declaration } from "@reveal-codes/engine";
import { choiceAiLabel, choiceNoneLabel, TOOL_NAME_LINE } from "@reveal-codes/export";
import { describe, expect, it } from "vitest";
import { DeclarationControls } from "../src/components/declaration-controls";
import { fireEvent, renderUi, screen } from "./support/render";

function mount(applicable: Declaration | null = null) {
  const seen: (Declaration | null)[] = [];
  renderUi(
    <DeclarationControls
      key="pasted_text"
      subject="pasted_text"
      applicable={applicable}
      onDeclare={(d) => {
        seen.push(d);
      }}
    />,
  );
  return seen;
}

describe("DeclarationControls _Requirements: 3.1, 3.2, 3.3, 3.5, 3.6, 3.8_", () => {
  it("offers two radios with none selected and no tool field", () => {
    mount();
    const radios = screen.getAllByRole<HTMLInputElement>("radio");
    expect(radios.map((r) => r.checked)).toEqual([false, false]);
    expect(screen.getByLabelText(choiceNoneLabel("pasted_text"))).toBeTruthy();
    expect(screen.getByLabelText(choiceAiLabel("pasted_text"))).toBeTruthy();
    expect(screen.queryByLabelText("Tool name")).toBeNull();
  });

  it("dispatches null with the instruction for an empty name, then a Declaration for a valid one", () => {
    const seen = mount();
    fireEvent.click(screen.getByLabelText(choiceAiLabel("pasted_text")));
    const input = screen.getByLabelText("Tool name");
    expect(seen).toEqual([null]);
    expect(input.getAttribute("aria-describedby")).toBe(screen.getByText(TOOL_NAME_LINE).id);
    fireEvent.change(input, { target: { value: "ChatGPT (GPT-4o)" } });
    expect(seen.at(-1)).toEqual({
      subject: "pasted_text",
      choice: "declared_ai",
      toolName: "ChatGPT (GPT-4o)",
    });
    expect(screen.queryByText(TOOL_NAME_LINE)).toBeNull();
  });

  it("declares none and empties the tool text", () => {
    const seen = mount({ subject: "pasted_text", choice: "declared_ai", toolName: "Claude" });
    expect(screen.getByLabelText<HTMLInputElement>("Tool name").value).toBe("Claude");
    fireEvent.click(screen.getByLabelText(choiceNoneLabel("pasted_text")));
    expect(seen.at(-1)).toEqual({ subject: "pasted_text", choice: "none" });
    expect(screen.queryByLabelText("Tool name")).toBeNull();
  });
});
