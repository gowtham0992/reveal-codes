/**
 * Structural_Equality (Req 1.4): the same primitive values, the same object
 * keys with structurally equal values, and the same array elements in the
 * same order. Key sets are compared exactly, so a key holding `undefined`
 * differs from a missing key. Reference equality is a fast path.
 */

type PlainObject = { readonly [key: string]: unknown };

const hasOwn = (o: PlainObject, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(o, key);

const isObject = (v: unknown): v is PlainObject => typeof v === "object" && v !== null;

const arraysEqual = (a: readonly unknown[], b: readonly unknown[]): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!structuralEqual(a[i], b[i])) return false;
  }
  return true;
};

const objectsEqual = (a: PlainObject, b: PlainObject): boolean => {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const key of keys) {
    if (!hasOwn(b, key)) return false;
    if (!structuralEqual(a[key], b[key])) return false;
  }
  return true;
};

export const structuralEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number") {
    return Number.isNaN(a) && Number.isNaN(b);
  }
  if (!isObject(a) || !isObject(b)) return false;
  if (Array.isArray(a)) return Array.isArray(b) && arraysEqual(a, b);
  if (Array.isArray(b)) return false;
  return objectsEqual(a, b);
};
