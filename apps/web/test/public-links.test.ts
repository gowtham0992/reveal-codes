import { describe, expect, it } from "vitest";
import { readPublicLinks } from "../src/server/deps";

describe("readPublicLinks", () => {
  it("is null for both when neither variable is set, or when they are empty", () => {
    expect(readPublicLinks({})).toEqual({ video: null, repo: null });
    expect(readPublicLinks({ NEXT_PUBLIC_VIDEO_URL: "", NEXT_PUBLIC_REPO_URL: "  " })).toEqual({
      video: null,
      repo: null,
    });
  });
  it("returns each address that is set", () => {
    expect(
      readPublicLinks({
        NEXT_PUBLIC_VIDEO_URL: "https://example.org/demo",
        NEXT_PUBLIC_REPO_URL: " https://example.org/repo ",
      }),
    ).toEqual({ video: "https://example.org/demo", repo: "https://example.org/repo" });
  });
  it("accepts only http and https addresses", () => {
    const bad = ["javascript:alert(1)", "data:text/html,x", "ftp://example.org", "not a url"];
    for (const value of bad) {
      expect(readPublicLinks({ NEXT_PUBLIC_VIDEO_URL: value }).video, value).toBeNull();
    }
    expect(readPublicLinks({ NEXT_PUBLIC_REPO_URL: "http://example.org/r" }).repo).toBe(
      "http://example.org/r",
    );
  });
});
