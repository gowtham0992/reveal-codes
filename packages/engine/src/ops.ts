/**
 * Operations facade (design A2–A4, A7). Re-exports the operation pipeline
 * modules under `ops/`; `apply` in `document.ts` is the public entry point.
 */
export * from "./ops/delete.js";
export * from "./ops/insert.js";
export * from "./ops/inverse.js";
export * from "./ops/pipeline.js";
export * from "./ops/replace.js";
export * from "./ops/splice.js";
export * from "./ops/validate.js";
