"use client";

import { useRef } from "react";
import type { ChangeEvent } from "react";

export const OPEN_ACCEPT = ".docx,.txt,.md";

/**
 * The Picker: a hidden file input. Its value is cleared after each use so the same file opens
 * twice; a cancelled Picker gives no file and changes nothing.
 */
export function useOpen(onFile: (file: File) => void) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return {
    inputRef,
    accept: OPEN_ACCEPT,
    openPicker: (): void => {
      inputRef.current?.click();
    },
    onChange: (e: ChangeEvent<HTMLInputElement>): void => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (file !== undefined) onFile(file);
    },
  };
}
