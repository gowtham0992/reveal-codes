import { getSchema } from "@tiptap/core";
import { Document } from "@tiptap/extension-document";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Text } from "@tiptap/extension-text";

/** The only three extensions the Editor loads: doc > paragraph > text. */
export const EDITOR_EXTENSIONS = [Document, Paragraph, Text];

export const editorSchema = getSchema(EDITOR_EXTENSIONS);
