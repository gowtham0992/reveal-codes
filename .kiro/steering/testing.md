---
inclusion: fileMatch
fileMatchPattern: ["**/*.test.ts", "**/*.properties.test.ts", "**/testing/**"]
---

# Writing tests in this repository

You are editing a test file. Apply these rules before anything else.

- Property tests use fast-check. Shape:

  ```ts
  // Property 3: segmentation is lossless
  it("P3 join(segment(t)) === t  _Requirements: 1.2_", () => {
    fc.assert(fc.property(arbDocumentText(), (t) => {
      expect(segment(t).map(s => s.text).join("")).toBe(t);
    }), { numRuns: 200 });
  });
  ```

- Reuse arbitraries from `packages/engine/src/testing/arbitraries.ts`. Add new ones there, not inline, if they would be useful twice.
- Shrinking must work: arbitraries are built from fast-check combinators, not from `fc.constant(JSON.parse(...))` blobs.
- When a property fails, do not weaken the property. Record the shrunk counterexample as a named example test next to it, then fix the code or, if the requirement is wrong, stop and say which requirement and why.
- Example tests cover the exact cases in the spec's acceptance criteria and the planted errors in the demo motion (`packages/engine/fixtures/demo-motion.txt`, copied to `apps/web/public/demo-motion.txt` by `apps/web/scripts/copy-demo.ts`).
- Never mock `packages/engine`. Mock only `fetch` (verifier) and `LlmProvider` (app).
