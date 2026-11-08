// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { ModeBadge, useServerMode } from "../src/components/mode-badge";
import type { ApiClient } from "../src/client/api";
import { modeApi } from "./support/mode-fetch";
import type { ModeSetting } from "./support/mode-fetch";
import { act, renderUi, screen } from "./support/render";

function Harness({ api }: Readonly<{ api: ApiClient }>) {
  return <ModeBadge mode={useServerMode(api)} />;
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

describe("ModeBadge _Requirements: 15.7, 15.8_", () => {
  it.each([
    ["fixtures", "Demo mode: recorded CourtListener responses"],
    ["live", "Live CourtListener lookups"],
    ["down", "Server unreachable"],
  ] as const)("shows the %s badge text", async (setting, text) => {
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

  it("renders nothing for the loading mode", () => {
    const { container } = renderUi(<ModeBadge mode="loading" />);
    expect(container.textContent).toBe("");
  });
});
