import { describe, expect, it } from "vitest";
import { MAX_PROBES, checkQuote, prefixLength } from "../src/quote";
import { normalise, normaliseQuote } from "../src/normalise";
import { splitSegments } from "../src/segments";
import { trackQuote } from "../src/track";
import { modelPrefixLength } from "./support/prefix-model";

const OPINION_A =
  "the court held that the statute is void because it burdens speech and then remanded the case";
const OPINION_B = "the court held that the writ issued. see id. the court later remanded the case.";

function mismatchLength(opinion: string, quote: string): number {
  const result = checkQuote(opinion, quote);
  if (result.status !== "mismatch") throw new Error(`expected mismatch, got ${result.status}`);
  expect(result.prefixLength).toBeLessThan(quote.length);
  return result.prefixLength;
}

describe("checkQuote worked examples _Requirements: 8.15_", () => {
  it("A9 example 1: absent last segment gives 63", () => {
    const quote = "the court held that ... it burdens speech ... remanded the cases";
    expect(quote.length).toBe(64);
    expect(mismatchLength(OPINION_A, quote)).toBe(63);
    expect(modelPrefixLength(quote, OPINION_A)).toBe(63);
  });

  it("A9 example 2: short interior segment extends to its trailing ellipsis, 30", () => {
    const quote = "the court held ... see id ... remanded the case";
    expect(quote.length).toBe(47);
    expect(mismatchLength(OPINION_B, quote)).toBe(30);
    expect(modelPrefixLength(quote, OPINION_B)).toBe(30);
  });

  it("A9 example 3: out-of-order second segment gives 22", () => {
    const quote = "remanded the case ... the court held";
    expect(quote.length).toBe(36);
    expect(mismatchLength(OPINION_B, quote)).toBe(22);
    expect(modelPrefixLength(quote, OPINION_B)).toBe(22);
  });
});

describe("checkQuote short and empty quotes _Requirements: 8.7, 8.8_", () => {
  it("absent single segment under 12 characters is mismatch 0", () => {
    expect(checkQuote(OPINION_A, "no such")).toEqual({ status: "mismatch", prefixLength: 0 });
  });

  it("present single segment under 12 characters matches", () => {
    expect(checkQuote(OPINION_A, "the court")).toEqual({ status: "match" });
    expect(checkQuote(OPINION_A, "[t]he court.")).toEqual({ status: "match" });
  });

  it.each(["", "   ", "…", "...", ". . .", " … "])("quote %j has no segment: mismatch 0", (q) => {
    expect(checkQuote(OPINION_A, q)).toEqual({ status: "mismatch", prefixLength: 0 });
  });
});

describe("checkQuote ellipsis cases _Requirements: 8.14, 8.16_", () => {
  const opinion =
    "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron";

  it("matches in-order segments joined by each ellipsis form", () => {
    for (const join of ["…", "...", ". . ."]) {
      const quote = `alpha beta gamma ${join} epsilon zeta eta theta ${join} omicron`;
      expect(checkQuote(opinion, quote)).toEqual({ status: "match" });
    }
  });

  it("out-of-order segments mismatch", () => {
    const quote = "epsilon zeta eta theta ... alpha beta gamma";
    expect(checkQuote(opinion, quote).status).toBe("mismatch");
  });

  it("a short interior segment mismatches although it occurs", () => {
    const quote = "alpha beta gamma ... zeta ... kappa lambda mu";
    expect(checkQuote(opinion, quote).status).toBe("mismatch");
  });

  it("ignores a leading and a trailing ellipsis", () => {
    expect(checkQuote(opinion, "… delta epsilon zeta …")).toEqual({ status: "match" });
  });

  it("short first and last segments still match", () => {
    expect(checkQuote(opinion, "xi ... epsilon zeta eta ... mu").status).toBe("mismatch");
    expect(checkQuote(opinion, "mu ... nu")).toEqual({ status: "match" });
    expect(checkQuote(opinion, "beta ... epsilon zeta eta ... nu")).toEqual({ status: "match" });
  });

  it("every result is below the quote length", () => {
    for (const q of ["alpha beta gamma delta ... nothing here at all", "zzzzzzzzzzzzzz"]) {
      mismatchLength(opinion, q);
    }
  });
});

describe("prefixLength non-monotone cases _Requirements: 8.15_", () => {
  it("a cut inside an alteration bracket is not a candidate until the pair closes", () => {
    const opinion = "the court held that";
    const quote = "the [coart] held that";
    expect(mismatchLength(opinion, quote)).toBe(modelPrefixLength(quote, opinion));
    expect(modelPrefixLength(quote, opinion)).toBe(4);
  });

  it("a cut inside a spaced ellipsis keeps part of the pattern", () => {
    const opinion = "we hold that the statute is void ... and then";
    const quote = "we hold that the statute is void. . . and else";
    expect(mismatchLength(opinion, quote)).toBe(modelPrefixLength(quote, opinion));
  });

  it("a cut before a combining mark splits the sequence", () => {
    const opinion = "the q\u0301ueue is open and shut";
    const quote = "the q\u0301ueue is open and closed";
    expect(trackQuote(quote)).not.toBeNull();
    expect(mismatchLength(opinion, quote)).toBe(modelPrefixLength(quote, opinion));
  });

  it("clean and model agree on a single contiguous altered word", () => {
    const opinion = "pro se complaints are held to less stringent standards than formal pleadings";
    const quote = "pro se complaints are held to more stringent standards than formal pleadings";
    expect(mismatchLength(opinion, quote)).toBe(modelPrefixLength(quote, opinion));
    expect(modelPrefixLength(quote, opinion)).toBeGreaterThanOrEqual(
      "pro se complaints are held to ".length,
    );
  });
});

describe("prefixLength budget and tracking _Requirements: 8.15_", () => {
  it("abandons tracking for non-NFC input and still returns a sound value", () => {
    const quote = "the cafe\u0301 is open and the writ issued today";
    const opinion = "the café is open and the writ issued yesterday";
    expect(trackQuote(quote)).toBeNull();
    const n = mismatchLength(opinion, quote);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(modelPrefixLength(quote, opinion));
    const prefix = normaliseQuote(quote.slice(0, n));
    expect(normalise(opinion)).toContain(prefix);
  });

  it("returns a smaller but sound value when the probe budget is exhausted", () => {
    const words = Array.from({ length: MAX_PROBES + 20 }, () => "[x]").join(" ");
    const quote = `lead text here ${words} tail`;
    const opinion = "lead text here";
    const n = prefixLength(quote, normalise(opinion), false);
    expect(n).toBeLessThan(quote.length);
    expect(n).toBeLessThanOrEqual(modelPrefixLength(quote, opinion));
    expect(splitSegments(normaliseQuote(quote.slice(0, n))).length).toBeLessThanOrEqual(1);
  });
});
