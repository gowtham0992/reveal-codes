// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { modeText, useServerMode } from "../src/components/use-server-mode";
import type { ApiClient } from "../src/client/api";
import { modeApi } from "./support/mode-fetch";
import type { ModeSetting } from "./support/mode-fetch";
import { act, renderUi, screen } from "./support/render";

function Harness({ api }: Readonly<{ api: ApiClient }>) {
  return <span>{modeText(useServerMode(api))}</span>;
}

async function mountBadge(setting: ModeSetting): Promise<HTMLElement> {
  const { api } = modeApi(setting);
  let container: HTMLElement | undefined;
  await act(async () => {
    container = renderUi(<Harness api={api} />).container;
    await Promise.resolve();
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  if (container === undefined) throw new Error("not rendered");
  return container;
}

describe("modeText and useServerMode _Requirements: 4.6, 4.7, 15.8_", () => {
  it.each([
    ["fixtures", "Demo mode: recorded CourtListener responses"],
    ["live", "Live CourtListener lookups"],
    ["down", "Server unreachable"],
  ] as const)("shows the %s Mode_Text", async (setting, text) => {
    await mountBadge(setting);
    expect(screen.getByText(text)).not.toBeNull();
  });

  it("renders nothing while the mode request is pending", () => {
    const pending: ApiClient = {
      ...modeApi("live").api,
      mode: () => new Promise(() => undefined),
    };
    const { container } = renderUi(<Harness api={pending} />);
    expect(container.textContent).toBe("");
  });

  it("has no Mode_Text for the loading mode", () => {
    expect(modeText("loading")).toBeNull();
  });
});
