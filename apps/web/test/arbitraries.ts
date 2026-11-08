import * as fc from "fast-check";
import { arbText } from "../../../packages/engine/src/testing/arb-text";
import { docFromText } from "../src/editor/offsets";
import { editorSchema } from "../src/editor/schema";
import type { Node as PMNode } from "@tiptap/pm/model";

/** Characters that matter to the Codes syntax, mixed with the Engine's text. */
const bracketLine: fc.Arbitrary<string> = fc
  .array(fc.constantFrom("[", "]", "\\", "a", " ", "/", "?"), { maxLength: 20 })
  .map((items) => items.join(""));

const engineLine: fc.Arbitrary<string> = arbText.map((t) => t.replaceAll("\n", ""));

/** A Paragraph_List: the lines and the document `docFromText` builds from them. */
export type ParagraphList = Readonly<{ lines: readonly string[]; doc: PMNode }>;

/** One to six lines without `\n`, built into a document by `docFromText`. */
export const arbParagraphList: fc.Arbitrary<ParagraphList> = fc
  .array(fc.oneof(engineLine, bracketLine), { minLength: 1, maxLength: 6 })
  .map((lines) => ({ lines, doc: docFromText(editorSchema, lines.join("\n")) }));
