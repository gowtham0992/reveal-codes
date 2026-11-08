/** The slice of `Storage` the app uses for autosave. */
export type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

export type MemoryStorage = StorageLike & {
  readonly data: ReadonlyMap<string, string>;
  /** Number of `setItem` calls, including ones that threw. */
  readonly writes: () => number;
};

/** A `StorageLike` over a Map. With `throwOnSet`, `setItem` throws (quota, private mode). */
export function createMemoryStorage(options: { throwOnSet?: boolean } = {}): MemoryStorage {
  const data = new Map<string, string>();
  let writes = 0;
  return {
    data,
    writes: () => writes,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      writes += 1;
      if (options.throwOnSet === true) throw new Error("QuotaExceededError");
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}
