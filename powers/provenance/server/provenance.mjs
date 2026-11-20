import { createRequire as __createRequire } from "node:module";
const require = __createRequire(import.meta.url);
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err2) => function __init() {
  if (err2) throw err2[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err2 = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// packages/engine/src/anchor-keys.ts
function issueOrder(citationStarts, quoteStarts) {
  const out = [];
  let i = 0;
  let j = 0;
  while (i < citationStarts.length || j < quoteStarts.length) {
    const c = citationStarts[i];
    const q = quoteStarts[j];
    if (c !== void 0 && (q === void 0 || c <= q)) {
      out.push({ quote: false, index: i });
      i += 1;
    } else {
      out.push({ quote: true, index: j });
      j += 1;
    }
  }
  return out;
}
function citationRecord(c, prev, counter2) {
  switch (c.value.kind) {
    case "other":
      return { kind: "other", citation: c };
    case "short":
      return prev?.kind === "short" ? { kind: "short", key: prev.key, citation: c } : { kind: "short", key: fresh(counter2), citation: c };
    default:
      return prev?.kind === "full" ? { kind: "full", key: prev.key, citation: c, result: prev.result } : { kind: "full", key: fresh(counter2), citation: c, result: { status: "unchecked" } };
  }
}
function quoteRecord(q, prev, counter2) {
  return prev === null ? { key: fresh(counter2), quote: q, result: { status: "unchecked" } } : { key: prev.key, quote: q, result: prev.result };
}
function assignKeys(extraction, counter2, carry = NO_CARRY) {
  const { citations, quotes } = extraction;
  const order = issueOrder(
    citations.map((c) => c.start),
    quotes.map((q) => q.start)
  );
  const state = { n: counter2 };
  const outC = [];
  const outQ = [];
  for (const { quote, index } of order) {
    if (quote) {
      outQ.push(quoteRecord(quotes[index], carry.quotes[index] ?? null, state));
    } else {
      const c = citations[index];
      outC.push(citationRecord(c, carry.citations[index] ?? null, state));
    }
  }
  return { citations: outC, quotes: outQ, keyCounter: state.n };
}
function citationIsIssue(r) {
  if (r.kind === "full") return r.result.status !== "verified";
  return r.kind === "short" && r.citation.value.kind === "short" && r.citation.value.targetStart === null;
}
function slotIssue(layer, slot) {
  if (slot.quote) {
    const q = layer.quotes[slot.index];
    return { key: q.key, issue: q.result.status !== "match" };
  }
  const r = layer.citations[slot.index];
  return r.kind === "other" ? null : { key: r.key, issue: citationIsIssue(r) };
}
function keptOverrides(previous, layer, carried) {
  const byKey = new Map(previous.map((o) => [o.key, o]));
  const order = issueOrder(
    layer.citations.map((r) => r.citation.start),
    layer.quotes.map((r) => r.quote.start)
  );
  const out = [];
  for (const slot of order) {
    const item = slotIssue(layer, slot);
    const o = item === null ? void 0 : byKey.get(item.key);
    if (item !== null && item.issue && carried.has(item.key) && o !== void 0) out.push(o);
  }
  return out;
}
var NO_CARRY, fresh;
var init_anchor_keys = __esm({
  "packages/engine/src/anchor-keys.ts"() {
    "use strict";
    NO_CARRY = { citations: [], quotes: [] };
    fresh = (counter2) => {
      const key = `k${String(counter2.n)}`;
      counter2.n += 1;
      return key;
    };
  }
});

// packages/engine/src/equal.ts
var hasOwn, isObject, arraysEqual, objectsEqual, structuralEqual;
var init_equal = __esm({
  "packages/engine/src/equal.ts"() {
    "use strict";
    hasOwn = (o, key) => Object.prototype.hasOwnProperty.call(o, key);
    isObject = (v) => typeof v === "object" && v !== null;
    arraysEqual = (a, b) => {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (!structuralEqual(a[i], b[i])) return false;
      }
      return true;
    };
    objectsEqual = (a, b) => {
      const keys = Object.keys(a);
      if (keys.length !== Object.keys(b).length) return false;
      for (const key of keys) {
        if (!hasOwn(b, key)) return false;
        if (!structuralEqual(a[key], b[key])) return false;
      }
      return true;
    };
    structuralEqual = (a, b) => {
      if (a === b) return true;
      if (typeof a === "number" && typeof b === "number") {
        return Number.isNaN(a) && Number.isNaN(b);
      }
      if (!isObject(a) || !isObject(b)) return false;
      if (Array.isArray(a)) return Array.isArray(b) && arraysEqual(a, b);
      if (Array.isArray(b)) return false;
      return objectsEqual(a, b);
    };
  }
});

// packages/engine/src/anchor.ts
function creationEdit(length) {
  return { from: 0, oldTo: 0, newTo: length };
}
function withLayer(draft, layer) {
  return {
    text: draft.text,
    spans: draft.spans,
    runs: draft.runs,
    citations: layer.citations,
    quotes: layer.quotes,
    overrides: layer.overrides,
    keyCounter: layer.keyCounter
  };
}
function mapRange(range, edit) {
  const { start, end } = range;
  const { from, oldTo, newTo } = edit;
  const untouched = from === oldTo ? from <= start || from >= end : oldTo <= start || from >= end;
  if (!untouched) return null;
  const delta = start >= oldTo ? newTo - oldTo : 0;
  return { start: start + delta, end: end + delta };
}
function fitsLengths(edit, oldLength, newLength) {
  const { from, oldTo, newTo } = edit;
  const ints = Number.isInteger(from) && Number.isInteger(oldTo) && Number.isInteger(newTo);
  return ints && from >= 0 && from <= oldTo && oldTo <= oldLength && from <= newTo && newTo <= newLength && newTo - oldTo === newLength - oldLength;
}
function indexByMappedStart(records, rangeOf, edit) {
  const index = /* @__PURE__ */ new Map();
  if (edit === null) return index;
  for (const record of records) {
    const m = mapRange(rangeOf(record), edit);
    if (m !== null) index.set(m.start, { record, end: m.end });
  }
  return index;
}
function sameTarget(old, next, links) {
  if (old === null || next === null) return old === next;
  const key = links.oldKeyAt.get(old);
  return key !== void 0 && links.newKeyAt.get(next) === key;
}
function citationCarries(p, c, links) {
  const prev = p.record.citation;
  if (p.end !== c.end || prev.text !== c.text) return false;
  if (p.record.kind === "full") {
    return c.value.kind !== "short" && c.value.kind !== "other" && structuralEqual(prev.value, c.value) && prev.normalised === c.normalised && prev.caseName === c.caseName;
  }
  return p.record.kind === "short" && c.value.kind === "short" && structuralEqual(withoutTarget(prev.value), withoutTarget(c.value)) && sameTarget(targetOf(prev.value), targetOf(c.value), links);
}
function carryCitations(prev, citations, edit, links) {
  const keyed = prev.citations.filter(isKeyed);
  const index = indexByMappedStart(keyed, (r) => r.citation, edit);
  return citations.map((c) => {
    const p = index.get(c.start);
    if (p === void 0 || !citationCarries(p, c, links)) return null;
    links.newKeyAt.set(c.start, p.record.key);
    return p.record;
  });
}
function quoteCarries(p, q, links) {
  const prev = p.record.quote;
  const attached = links.newKeyAt.get(q.citationStart);
  return p.end === q.end && prev.text === q.text && prev.rule === q.rule && attached !== void 0 && attached === links.oldKeyAt.get(prev.citationStart);
}
function carryQuotes(prev, quotes, edit, links) {
  const index = indexByMappedStart(prev.quotes, (r) => r.quote, edit);
  return quotes.map((q) => {
    const p = index.get(q.start);
    return p !== void 0 && quoteCarries(p, q, links) ? p.record : null;
  });
}
function keysByStart(prev) {
  const out = /* @__PURE__ */ new Map();
  for (const r of prev.citations) if (r.kind !== "other") out.set(r.citation.start, r.key);
  return out;
}
function carriedKeys(records) {
  return records.flatMap((r) => r === null ? [] : [r.key]);
}
function reanchor(prev, draft, edit, extraction) {
  const mapping = fitsLengths(edit, prev.text.length, draft.text.length) ? edit : null;
  const links = { oldKeyAt: keysByStart(prev), newKeyAt: /* @__PURE__ */ new Map() };
  const citations = carryCitations(prev, extraction.citations, mapping, links);
  const quotes = carryQuotes(prev, extraction.quotes, mapping, links);
  const layer = assignKeys(extraction, prev.keyCounter, { citations, quotes });
  const carried = /* @__PURE__ */ new Set([...carriedKeys(citations), ...carriedKeys(quotes)]);
  const overrides2 = keptOverrides(prev.overrides, layer, carried);
  return { ...layer, overrides: overrides2 };
}
var withoutTarget, targetOf, isKeyed;
var init_anchor = __esm({
  "packages/engine/src/anchor.ts"() {
    "use strict";
    init_anchor_keys();
    init_equal();
    init_anchor_keys();
    withoutTarget = (v) => v.kind === "short" ? { ...v, targetStart: null } : v;
    targetOf = (v) => v.kind === "short" ? v.targetStart : null;
    isKeyed = (r) => r.kind !== "other";
  }
});

// packages/engine/src/abbreviations.ts
function buildLengthIndex(extra) {
  const index = /* @__PURE__ */ new Map();
  for (const a of allEntries(extra)) {
    const bucket = index.get(a.length) ?? /* @__PURE__ */ new Set();
    bucket.add(a);
    index.set(a.length, bucket);
  }
  return index;
}
function buildFirstUnitIndex(extra) {
  const index = /* @__PURE__ */ new Map();
  for (const a of allEntries(extra)) {
    const key = a.charAt(0);
    index.set(key, [...index.get(key) ?? [], a]);
  }
  for (const bucket of index.values()) bucket.sort((x, y) => x.length - y.length);
  return index;
}
function buildAbbreviationIndex(extra) {
  const longest = allEntries(extra).reduce((m, a) => a.length > m ? a.length : m, 0);
  return { byLength: buildLengthIndex(extra), byFirstUnit: buildFirstUnitIndex(extra), longest };
}
function isAbbreviationEndingAt(text, i, index = BASE_ABBREVIATION_INDEX) {
  if (!Number.isInteger(i) || i < 0 || i >= text.length || text.charAt(i) !== ".") return false;
  for (const [length, entries] of index.byLength) {
    const start = i - length + 1;
    if (start < 0) continue;
    if (entries.has(text.slice(start, i + 1)) && isAbbreviationContext(text, start)) return true;
  }
  return false;
}
function abbreviationsStartingAt(text, at, limit, index = BASE_ABBREVIATION_INDEX) {
  if (!Number.isInteger(at) || at < 0 || at >= text.length) return [];
  const bound = Math.min(limit, text.length);
  const ends = [];
  for (const a of index.byFirstUnit.get(text.charAt(at)) ?? []) {
    if (at + a.length <= bound && text.startsWith(a, at)) ends.push(at + a.length);
  }
  return ends;
}
var LEGAL_ABBREVIATIONS, ENTITY_SUFFIX_WORDS, allEntries, BASE_ABBREVIATION_INDEX, isWhitespace, isAbbreviationContext;
var init_abbreviations = __esm({
  "packages/engine/src/abbreviations.ts"() {
    "use strict";
    LEGAL_ABBREVIATIONS = [
      "Id.",
      "v.",
      "Inc.",
      "Corp.",
      "Ltd.",
      "Co.",
      "L.P.",
      "N.A.",
      "L.L.C.",
      "No.",
      "Cir.",
      "Dist.",
      "Ct.",
      "Fed.",
      "Supp.",
      "et al."
    ];
    ENTITY_SUFFIX_WORDS = [
      "Inc.",
      "LLC",
      "L.L.C.",
      "Ltd.",
      "Co.",
      "Corp.",
      "L.P.",
      "N.A."
    ];
    allEntries = (extra) => [
      ...new Set([...LEGAL_ABBREVIATIONS, ...extra].filter((a) => a.length > 0))
    ];
    BASE_ABBREVIATION_INDEX = buildAbbreviationIndex([]);
    isWhitespace = (unit) => /\s/.test(unit);
    isAbbreviationContext = (text, start) => start === 0 || isWhitespace(text.charAt(start - 1)) || text.charAt(start - 1) === "(";
  }
});

// packages/engine/src/citations/party-lex.ts
function isWUnit(ch) {
  if (ch.length !== 1) return false;
  const u = ch.charCodeAt(0);
  if (u >= 48 && u <= 57) return true;
  return W_PUNCT.has(ch) || LETTER.test(ch);
}
function wWidthEndingAt(text, k, lo) {
  const u = text.charCodeAt(k);
  if (!isLow(u)) return isWUnit(text.charAt(k)) ? 1 : 0;
  if (k - 1 < lo) return k > 0 ? -1 : 0;
  if (!isHigh(text.charCodeAt(k - 1))) return 0;
  return LETTER.test(text.slice(k - 1, k + 1)) ? 2 : 0;
}
function isPartyWordUnitAt(text, i) {
  if (i < 0 || i >= text.length) return false;
  const u = text.charCodeAt(i);
  if (isHigh(u)) return isLow(text.charCodeAt(i + 1)) && LETTER.test(text.slice(i, i + 2));
  return wWidthEndingAt(text, i, 0) > 0;
}
function readWordTokenBefore(text, end, lo) {
  let j = end;
  while (j > lo) {
    const width3 = wWidthEndingAt(text, j - 1, lo);
    if (width3 < 0) return null;
    if (width3 === 0) break;
    j -= width3;
  }
  if (j === end) return null;
  if (j === lo && lo > 0) return null;
  return { start: j, end };
}
function readTokenBefore(text, end, lo) {
  if (end - 1 >= lo && text[end - 1] === "&") {
    return end - 2 >= lo && text[end - 2] === " " ? { start: end - 1, end } : null;
  }
  return readWordTokenBefore(text, end, lo);
}
var LETTER, W_PUNCT, isHigh, isLow;
var init_party_lex = __esm({
  "packages/engine/src/citations/party-lex.ts"() {
    "use strict";
    LETTER = new RegExp("^\\p{L}$", "u");
    W_PUNCT = /* @__PURE__ */ new Set([".", "'", "\u2019", "-"]);
    isHigh = (u) => u >= 55296 && u <= 56319;
    isLow = (u) => u >= 56320 && u <= 57343;
  }
});

// packages/engine/src/citations/reporters.json
var reporters_default;
var init_reporters = __esm({
  "packages/engine/src/citations/reporters.json"() {
    reporters_default = [
      "A.",
      "A.2d",
      "A.3d",
      "A.D.",
      "A.D.2d",
      "A.D.3d",
      "A.E.C.",
      "A.K. Marsh.",
      "A.L.R.",
      "A.L.R. 2d",
      "A.L.R. 3d",
      "A.L.R. 4th",
      "A.L.R. 5th",
      "A.L.R. 6th",
      "A.L.R. Fed.",
      "A.L.R. Fed. 2d",
      "A.M.C.",
      "AOA",
      "AWCC",
      "AZ",
      "Abb.",
      "Abb. Adm.",
      "Abb. Ct. App.",
      "Abb. N. Cas.",
      "Abb. Pr.",
      "Abbotts",
      "Add.",
      "Adm. Rec.",
      "Adv. S.",
      "Agric. Dec.",
      "Aik.",
      "Ala.",
      "Ala. 2d",
      "Ala. App.",
      "Alaska",
      "Alaska Fed.",
      "Alb. Law J.",
      "Allen",
      "Am. & Eng. R. Cas.",
      "Am. Ann. Cas.",
      "Am. B.R.",
      "Am. Dec.",
      "Am. Disabilities Dec.",
      "Am. Jur.",
      "Am. Law Reg.",
      "Am. Law T.",
      "Am. Law T. Rep. Bankr.",
      "Am. Law T. Rep. U.S. Cts.",
      "Am. Law. Rec.",
      "Am. Lead. Cas.",
      "Am. Neg. Ca.",
      "Am. Neg. Cas.",
      "Am. Neg. Cases",
      "Am. Rep.",
      "Am. Ry. Rep.",
      "Am. Samoa",
      "Am. Samoa 2d",
      "Am. Samoa 3d",
      "Am. St. Rep.",
      "Am. Tribal Law",
      "Amer. L. Rev.",
      "Amer. Law J.",
      "Amer. Law T. Rep.",
      "Ant. N.P. Cas.",
      "App. D.C.",
      "Ariz.",
      "Ariz. Adv. Rep.",
      "Ariz. App.",
      "Arizona Cases Digest",
      "Ark.",
      "Ark. Adv. Op.",
      "Ark. App.",
      "Armstrong. Election Cases",
      "Auto. Cas.",
      "Auto. Cas.2d",
      "B. Mon.",
      "B.R.",
      "B.T.A.",
      "BCA",
      "BNA OSHC",
      "BNH",
      "Backes",
      "Bail.",
      "Bail. Eq.",
      "Baldw.",
      "Balt. C. Rep.",
      "Balt. Law Trans.",
      "Ban. & A.",
      "Bankr. Ct. Rep.",
      "Bankr. L. Rep.",
      "Barb.",
      "Barb. Ch.",
      "Baxt.",
      "Bay",
      "Bedell",
      "Bee",
      "Beeler",
      "Ben.",
      "Bibb",
      "Bigelow. Ins. Rep.",
      "Binn.",
      "Biss.",
      "Black",
      "Blackf.",
      "Bland",
      "Blatchf.",
      "Blatchf. & H.",
      "Blatchf. Pr. Cas.",
      "Blume Sup. Ct. Trans.",
      "Blume Unrep. Op.",
      "Bond",
      "Bosw.",
      "Boyce",
      "Bradf.",
      "Brayt.",
      "Breese",
      "Brev.",
      "Brief Times Rptr.",
      "Brightly",
      "Brock.",
      "Brown Adm.",
      "Brunn. Coll. Cas.",
      "Buchanan",
      "Bur.",
      "Busb.",
      "Busb. Eq.",
      "Bush",
      "C.B.",
      "C.C.A.",
      "C.C.L.J.",
      "C.C.P.A.",
      "C.M.A.",
      "C.M.R.",
      "CCH OSHD",
      "CIT",
      "CJ C.A.R.",
      "CO",
      "COA",
      "Cai. Cas.",
      "Cai. R.",
      "Cal.",
      "Cal. 2d",
      "Cal. 3d",
      "Cal. 3d Spec. Trib Supp.",
      "Cal. 4th",
      "Cal. 5th",
      "Cal. 4th CJP Supp.",
      "Cal. 5th CJP Supp.",
      "Cal. App.",
      "Cal. App. 2d",
      "Cal. App. 3d",
      "Cal. App. 4th",
      "Cal. App. 5th",
      "Cal. App. Supp.",
      "Cal. App. Supp. 2d",
      "Cal. App. Supp. 3d",
      "Cal. App. Supp. 4th",
      "Cal. App. Supp. 5th",
      "Cal. Bankr. Ct. Rep.",
      "Cal. Comp. Cases",
      "Cal. Daily Op. Serv.",
      "Cal. Dist. Ct.",
      "Cal. I.A.C.",
      "Cal. Law J.",
      "Cal. Law J. & Lit. Rev.",
      "Cal. Rptr.",
      "Cal. Rptr. 2d",
      "Cal. Rptr. 3d",
      "Cal. Sup.",
      "Cal. Super. Ct.",
      "Cal. Unrep.",
      "Cal. WCC",
      "Call",
      "Cam. & Nor.",
      "Car. L. Rep.",
      "Cates.",
      "Cent. Law J.",
      "Chand.",
      "Charlton",
      "Chase",
      "Chest.",
      "Chev.",
      "Chev. Eq.",
      "Chi. Law J.",
      "Chi. Leg. News",
      "Chit. Cr. Law",
      "Cin. L. Bull.",
      "Cin. Sup. Ct. Rep.",
      "Cl. Ch.",
      "Cl. Ct.",
      "Cliff.",
      "Codd. Dig.",
      "Code Rep.",
      "Coffey",
      "Cold.",
      "Cole. & Cai. Cas.",
      "Cole. Cas.",
      "Collier Bankr. Cas.",
      "Collier Bankr. Cas. 2d",
      "Colo.",
      "Colo. App.",
      "Colo. Bankr. Ct. Rep.",
      "Colo. J.",
      "Colo. J. C.A.R.",
      "Colo. L. Rep.",
      "Colo. N. P.",
      "Comm. Fut. L. Rep.",
      "Comp. Gen.",
      "Conn.",
      "Conn. App.",
      "Conn. Cir. Ct.",
      "Conn. L. Rptr.",
      "Conn. Super. Ct.",
      "Conn. Supp.",
      "Conn. Surr.",
      "Connoly",
      "Cont. Cas. Fed.",
      "Cooke",
      "Cow.",
      "Cox. Manual Trade-Mark Cas.",
      "Crabbe",
      "Cranch",
      "Ct. Cl.",
      "Ct. Cust.",
      "Curt.",
      "Cush.",
      "Cust. B. & Dec.",
      "Cust. Ct.",
      "D. Chip.",
      "D. Haw.",
      "D.A.R.",
      "D.C.",
      "D.C. App.",
      "DJCAR",
      "DNH",
      "DSD",
      "DTA",
      "DTS",
      "Daily Journal DAR",
      "Daily L.N.",
      "Daily Wash. L. Rptr.",
      "Dakota",
      "Dall.",
      "Dallam",
      "Daly",
      "Dana",
      "Davis. L. Ct. Cas.",
      "Day",
      "Day.",
      "Deady",
      "Dec. Com. Pat.",
      "Del.",
      "Del. Cas.",
      "Del. Ch.",
      "Del. Co.",
      "Dem. Sur.",
      "Dem. Surr.",
      "Denio",
      "Des.",
      "Des. Eq.",
      "Dev.",
      "Dev. & Bat.",
      "Dev. & Bat. Eq.",
      "Dev. Eq.",
      "Dickinson",
      "Dill.",
      "Div.",
      "Doug.",
      "Dud.",
      "Dud. Eq.",
      "Dudley Rep.",
      "Duer",
      "Duv.",
      "E.A.D.",
      "E.D. Pa.",
      "E.D. Smith",
      "E.H. Smith",
      "ERC",
      "Edm. Sel. Cas.",
      "Educ. L. Rep.",
      "Edw. Ch.",
      "F.",
      "F.2d",
      "F.3d",
      "F.4th",
      "F. Cas.",
      "F. Supp.",
      "F. Supp. 2d",
      "F. Supp. 3d",
      "F.C.C.",
      "F.C.C.2d",
      "F.L.R.A.",
      "F.R.D.",
      "F.T.C.",
      "FCC Rcd",
      "FCDR",
      "FED App.",
      "FERC",
      "FL",
      "FLW Fed",
      "FMSHRC",
      "FPSC",
      "Fed. Cl.",
      "Fed. R. Serv.",
      "Fed. R. Serv. 2d",
      "Fed. R. Serv. 3d",
      "Fire & Casualty Cas.",
      "Fish. Pat. Cas.",
      "Fish. Pat. Rep.",
      "Fish. Prize Cas.",
      "Fla.",
      "Fla. L. Weekly",
      "Fla. L. Weekly Fed. B",
      "Fla. L. Weekly Fed. C",
      "Fla. L. Weekly Fed. D",
      "Fla. L. Weekly Fed. S",
      "Fla. L. Weekly Supp.",
      "Fla. Supp.",
      "Fla. Supp. 2d",
      "Flip.",
      "Foster",
      "Free. Ch.",
      "Fulton County D. Rep.",
      "G. & J.",
      "G.D.R.",
      "Ga.",
      "Ga. App.",
      "Ga. L. Rep.",
      "Gall.",
      "Georgia Decisions",
      "Gibb. Surr.",
      "Gibbons",
      "Gild.",
      "Gill",
      "Gilm.",
      "Gilmer",
      "Gilp.",
      "Goebel",
      "Grant",
      "Gratt.",
      "Gray",
      "Greene",
      "Guam",
      "Gummere",
      "Gunby",
      "H. & G.",
      "H. & J.",
      "H. & McH.",
      "Hall",
      "Handy",
      "Handy R.",
      "Hard.",
      "Harp.",
      "Harp. Eq.",
      "Harr. Ch.",
      "Harrington",
      "Hasb.",
      "Hask.",
      "Haskell C.C.",
      "Haw.",
      "Haw. App.",
      "Hawks",
      "Hay. & Haz.",
      "Hayw.",
      "Hayw. & H.D.C.",
      "Haz. Reg. Pa.",
      "Haz. U. S. Reg.",
      "Head",
      "Heisk.",
      "Hempst.",
      "Hen. & M.",
      "Hill",
      "Hill & Den.",
      "Hill Eq.",
      "Hilt.",
      "Hoff.",
      "Hoff. Ch.",
      "Hoff. Land Cas.",
      "Hoff. Op.",
      "Holmes",
      "Hopk. Ch.",
      "Hopk. Works.",
      "Houston",
      "How.",
      "How. App. Cas.",
      "How. N.P.",
      "How. Pr.",
      "Howard",
      "Howison",
      "Hughes",
      "Hum.",
      "Hun",
      "Hunt Mer. Mag.",
      "I. & N. Dec.",
      "I.C.C.",
      "I.C.C.2d",
      "I.R.B.",
      "IL",
      "Idaho",
      "Ill.",
      "Ill. 2d",
      "Ill. App.",
      "Ill. App. 2d",
      "Ill. App. 3d",
      "Ill. C.C.",
      "Ill. Cir. Ct.",
      "Ill. Ct. Cl.",
      "Ill. Dec.",
      "Ind.",
      "Ind. App.",
      "Ind. Cl. Comm.",
      "Ind. Dec.",
      "Ind. L. Rep.",
      "Indian Terr.",
      "Ins. L.J.",
      "Int. Rev. Rec.",
      "Interior Dec.",
      "Iowa",
      "Ired.",
      "Ired. Eq.",
      "J.J. Marsh.",
      "JTS",
      "Jeff.",
      "Johns.",
      "Johns. Cas.",
      "Johns. Ch.",
      "Jones",
      "Jones & S.",
      "Jones Eq.",
      "Jones Law",
      "Jour. Fr. Inst.",
      "Jour. Jur.",
      "Juris P.R.",
      "Just.",
      "Kan.",
      "Kan. App.",
      "Kan. App. 2d",
      "Kelly",
      "Keyes",
      "Kirby",
      "Kulp",
      "Ky.",
      "Ky. App.",
      "Ky. L. Rptr.",
      "Ky. L. Summ.",
      "Ky. Op.",
      "L. Ed.",
      "L. Ed. 2d",
      "L.R.A.",
      "LA",
      "LCR",
      "La.",
      "La. Ann.",
      "La. App.",
      "La. Law J.",
      "Lack. L.N.",
      "Lack.Jur.",
      "Lanc. L. Rev.",
      "Lans.",
      "Lans. Ch.",
      "Law & Eq. Rep.",
      "Law J. Q.B.",
      "Law Rep.",
      "Law Reporter",
      "Lea.",
      "Leg. Int.",
      "Leg. Op.",
      "Leg. Rec. Rep.",
      "Legal Gaz.",
      "Lehigh",
      "Leigh",
      "Liquor Tax Rep.",
      "Litt.",
      "Litt. Sel. Cas.",
      "Liv. Law Mag.",
      "Lock. Rev. Cas.",
      "Low.",
      "Luz. L.R.",
      "M.J.",
      "M.S.P.B.",
      "M.S.P.R.",
      "M.T.C.A.",
      "M.T.C.R.",
      "MDBT",
      "MDLR",
      "ME",
      "ML",
      "MP",
      "MS",
      "MSPB",
      "MT",
      "MacA. Pat. Cas.",
      "MacArth.",
      "MacArth. & M.",
      "Mackey",
      "Mann. Unrep. Cas.",
      "Mart.",
      "Mart. & Yer.",
      "Marvel",
      "Mason C.C.",
      "Mass.",
      "Mass. App. Ct.",
      "Mass. App. Dec.",
      "Mass. App. Div.",
      "Mass. App. Div. Adv. Sh.",
      "Mass. L. Rptr.",
      "Mass. Supp.",
      "McAll.",
      "McCahon",
      "McCanless",
      "McCord",
      "McCord Eq.",
      "McGl.",
      "McGrath",
      "McLean",
      "McMul.",
      "McMul. Eq.",
      "Md.",
      "Md. App.",
      "Md. Ch.",
      "Md. Law Rec.",
      "Me.",
      "Meigs",
      "Met.",
      "Mich.",
      "Mich. App.",
      "Mich. Ct. Cl.",
      "Mich. Lawy.",
      "Mich. N.P.",
      "Mich. Pr.",
      "Miles",
      "Mill",
      "Mills Surr.",
      "Minn.",
      "Minor",
      "Misc.",
      "Misc. 2d",
      "Misc. 3d",
      "Miss.",
      "Miss. Dec.",
      "Mo.",
      "Mo. App.",
      "Monag.",
      "Mont.",
      "Montg.",
      "Month. Jur.",
      "Month. West. Jur.",
      "Morr. Min. Rep.",
      "Morr. St. Cas.",
      "Morris",
      "Munf.",
      "Mur.",
      "Myrick",
      "N. Chip.",
      "N. Mar. I.",
      "N. Mar. I. Commw.",
      "N. Y. City H. Rec.",
      "N.C.",
      "N.C. App.",
      "N.D.",
      "N.E.",
      "N.E.2d",
      "N.E.3d",
      "N.H.",
      "N.J.",
      "N.J. Admin.",
      "N.J. Admin. 2d",
      "N.J. Eq.",
      "N.J. Law J.",
      "N.J. Misc.",
      "N.J. Super.",
      "N.J. Tax",
      "N.J.L.",
      "N.J.L.J.",
      "N.L.R.B.",
      "N.M.",
      "N.M. Ct. App.",
      "N.M. St. B. Bull.",
      "N.M.B.",
      "N.R.C.",
      "N.T.S.B.",
      "N.W.",
      "N.W.2d",
      "N.W.3d",
      "N.Y.",
      "N.Y.2d",
      "N.Y.3d",
      "N.Y. Ann. Cas.",
      "N.Y. Ch. Ann.",
      "N.Y. City Ct. Rep.",
      "N.Y. Civ. Proc. R.",
      "N.Y. Crim.",
      "N.Y. Leg. Obs.",
      "N.Y. Proc. Ct. Ass.",
      "N.Y. St. Rep.",
      "N.Y. Sup. Ct.",
      "N.Y. Super. Ct.",
      "N.Y.L.J.",
      "N.Y.S.",
      "N.Y.S.2d",
      "N.Y.S.3d",
      "NCA",
      "NCBC",
      "ND",
      "ND App",
      "NDLR",
      "NLRB No.",
      "NM",
      "NMCA",
      "NMCERT",
      "NMSC",
      "NV",
      "NY Slip Op",
      "Nat. Bank. Reg.",
      "Navajo Rptr.",
      "Neb.",
      "Neb. Ct. App.",
      "Nev.",
      "Nev. Adv. Op. No.",
      "Nev. Adv. Rep.",
      "Newb. Adm.",
      "Niles Reg.",
      "Northumb. L.J.",
      "Nott & McC.",
      "O. Supp.",
      "O.B.A.J.",
      "O.G.",
      "O.R.W.",
      "O.S.U.",
      "OK",
      "OK AG",
      "OK CIV APP",
      "OK CR",
      "OK JUD ETH",
      "Ohio",
      "Ohio App.",
      "Ohio App. 2d",
      "Ohio App. 3d",
      "Ohio App. Unrep.",
      "Ohio B.",
      "Ohio C.A.",
      "Ohio C.C.",
      "Ohio C.C. Dec.",
      "Ohio Ch.",
      "Ohio Cir. Dec.",
      "Ohio Dec.",
      "Ohio Dec. Reprint",
      "Ohio F. Dec.",
      "Ohio Law Rep.",
      "Ohio Law. Abs.",
      "Ohio Misc.",
      "Ohio Misc. 2d",
      "Ohio N.P.",
      "Ohio Op.",
      "Ohio Op. 2d",
      "Ohio Op. 3d",
      "Ohio St.",
      "Ohio St. 2d",
      "Ohio St. 3d",
      "Oil & Gas Rep.",
      "Okl Jud.",
      "Okla.",
      "Okla. Crim.",
      "Okla. Trib.",
      "Olcott",
      "Op. O.L.C.",
      "Ops.Cal.Atty.Gen.",
      "Or.",
      "Or. App.",
      "Or. Tax",
      "Otto",
      "Overt.",
      "P.",
      "P.2d",
      "P.3d",
      "P.C.L.J.",
      "P.H.",
      "P.L.R.",
      "P.O.R.",
      "P.R. Dec.",
      "P.R. Fed.",
      "P.R. Offic. Trans.",
      "P.R. Sent.",
      "P.R.R.",
      "P.U.R.",
      "P.U.R.3d",
      "P.U.R.4th",
      "PA",
      "Pa.",
      "Pa. C.",
      "Pa. Commw.",
      "Pa. Corp.",
      "Pa. D.",
      "Pa. D. & C.",
      "Pa. D. & C.2d",
      "Pa. D. & C.3d",
      "Pa. D. & C.4th",
      "Pa. D. & C.5th",
      "Pa. Fid.",
      "Pa. Just. L. Rep.",
      "Pa. Super.",
      "Pac. Law Mag.",
      "Paige Ch.",
      "Paine",
      "Park. Cr.",
      "Parsons",
      "Patton & Heath",
      "Pears.",
      "Peck",
      "Pelt.",
      "Pen. & W.",
      "Penn. Law J.",
      "Penne.",
      "Pennewill",
      "Pennyp.",
      "Pet.",
      "Pet. Adm.",
      "Pet. C.C.",
      "Pet. Cir. C.R.",
      "Phil. Eq.",
      "Phil. Law",
      "Phila.",
      "Pick.",
      "Pickle",
      "Pin.",
      "Pitts L.J.",
      "Pitts. Rpts.",
      "Port.",
      "Posey",
      "Pow. Surr.",
      "Pub. Lands Dec.",
      "Quart. Law J.",
      "R.I.",
      "R.I. Dec.",
      "Rad. Reg.",
      "Rand.",
      "Rawle",
      "Rec. Co. Ct.",
      "Redf.",
      "Rep. Cont. El.",
      "Rep. Cont. Elect. Case.",
      "Rice",
      "Rice Eq.",
      "Rich.",
      "Rich. Cas.",
      "Rich. Eq.",
      "Ril.",
      "Ril. Eq.",
      "Rob.",
      "Robards",
      "Robb.",
      "Root",
      "S. & M.",
      "S. Ct.",
      "S.C.",
      "S.C. Eq.",
      "S.C.L.",
      "S.D.",
      "S.E.",
      "S.E.2d",
      "S.T.B.",
      "S.W.",
      "S.W.2d",
      "S.W.3d",
      "SCDB",
      "SD",
      "SEC Docket",
      "SEC Jud. Dec.",
      "Sadler",
      "San Fran. Law J.",
      "Sand. Ch.",
      "Sandf.",
      "Sarat. Ch. Sent.",
      "Sawy.",
      "Scam.",
      "Sch. Reg.",
      "Seld. Notes",
      "Serg. & Rawle",
      "Shan.",
      "Shan. Cas.",
      "Sickels",
      "Silv. Ct. App.",
      "Silv. Sup.",
      "Smith & H.",
      "Sneed",
      "So.",
      "So. 2d",
      "So. 3d",
      "Som. L.J.",
      "Speers",
      "Speers Eq.",
      "Sprague",
      "State Rptr.",
      "Stew.",
      "Stew. & P.",
      "Stock.",
      "Storey",
      "Story",
      "Strob.",
      "Strob. Eq.",
      "Sumn.",
      "Super. Ct. Jud.",
      "Swan",
      "Sweeny",
      "Syllabi",
      "T.B. Mon.",
      "T.C.",
      "T.C. Memo.",
      "T.C. No.",
      "T.C. Summary Opinion",
      "T.C.A.",
      "T.C.M.",
      "TN WC",
      "TN WC App.",
      "TNT",
      "TSPR",
      "Taney",
      "Tapp. Rep.",
      "Tay.",
      "Taylor",
      "Teiss.",
      "Tenn.",
      "Tenn. App.",
      "Tenn. Ch. App.",
      "Tenn. Ch. R.",
      "Tenn. Crim. App.",
      "Tenn. Leg. Rep.",
      "Terry",
      "Tex.",
      "Tex. Bus.",
      "Tex. Civ. App.",
      "Tex. Crim.",
      "Tex. Ct. App.",
      "Tex. L. R.",
      "Tex. Law J.",
      "Tex. Sup. Ct. J.",
      "Tex.Bankr.Ct.Rep.",
      "Thomp. & Cook",
      "Thompson",
      "Tiess.",
      "Tiffany",
      "Trans. App.",
      "Tread.",
      "Treas. Dec.",
      "Treas. Dec. Int. Rev.",
      "Tuck. & Cl.",
      "Tuck. Surr.",
      "Tyl.",
      "Tyng",
      "U. S. Law J.",
      "U.S.",
      "U.S. App. D.C.",
      "U.S. Law Int.",
      "U.S.L.W.",
      "USCMA",
      "UT",
      "UT App",
      "Unemployment Ins. Rep.",
      "Utah",
      "Utah 2d",
      "Utah Adv. Rep.",
      "V.I.",
      "VI Super",
      "VT",
      "Va.",
      "Va. App.",
      "Va. Cas.",
      "Va. Ch. Dec.",
      "Va. Cir.",
      "Va. Col. Dec.",
      "Va. Dec.",
      "Va. Law J.",
      "Va. Law Rep.",
      "Van Ness",
      "Vaux",
      "Vet. App.",
      "Vroom",
      "Vt.",
      "Vt. Super.",
      "W. Va.",
      "W.L.B.",
      "W.L.J.",
      "W.L.M.",
      "W.N.C.",
      "W.W. Harr.",
      "WI",
      "WI App",
      "WY",
      "Walk.",
      "Walk. Ch.",
      "Walker",
      "Wall.",
      "Wall. Jr.",
      "Wall. Jr. Append.",
      "Ware",
      "Wash.",
      "Wash. 2d",
      "Wash. 3d",
      "Wash. App.",
      "Wash. App. 2d",
      "Wash. C. C.",
      "Wash. Co.",
      "Wash. Terr.",
      "Watts",
      "Watts & Serg.",
      "Week. Law Gaz.",
      "Week. No.",
      "Wend.",
      "West Coast Rep.",
      "West. Jur.",
      "Whart.",
      "Whart. Hom.",
      "Whart. St. Tr.",
      "Wheat.",
      "Wheel. Cr. Cas.",
      "White & W.",
      "Will.",
      "Willson",
      "Wilson",
      "Win.",
      "Wis.",
      "Wis. 2d",
      "Wkly. Dig.",
      "Woodb. & M.",
      "Woods",
      "Woolw.",
      "Wright",
      "Wyo.",
      "Yates Sel. Cas.",
      "Yeates",
      "Yer.",
      "York"
    ];
  }
});

// packages/engine/src/citations/reporters.ts
function collapseReporter(token) {
  return token.replace(/[. ]/g, "");
}
function firstIndexBy(entries, key) {
  const index = /* @__PURE__ */ new Map();
  entries.forEach((entry, i) => {
    const k = key(entry);
    if (k.length > 0 && !index.has(k)) index.set(k, i);
  });
  return index;
}
function lookupReporter(token) {
  const at = exactIndex.get(token) ?? collapsedIndex.get(collapseReporter(token));
  return at === void 0 ? null : REPORTERS[at] ?? null;
}
var REPORTERS, exactIndex, collapsedIndex, REPORTER_ABBREVIATIONS, LEGAL_ABBREVIATION_INDEX;
var init_reporters2 = __esm({
  "packages/engine/src/citations/reporters.ts"() {
    "use strict";
    init_abbreviations();
    init_reporters();
    REPORTERS = reporters_default;
    exactIndex = firstIndexBy(REPORTERS, (e) => e);
    collapsedIndex = firstIndexBy(
      REPORTERS,
      collapseReporter
    );
    REPORTER_ABBREVIATIONS = REPORTERS.filter((r) => r.endsWith("."));
    LEGAL_ABBREVIATION_INDEX = buildAbbreviationIndex(REPORTER_ABBREVIATIONS);
  }
});

// packages/engine/src/citations/signals.ts
function startsWithSignal(text, start, end) {
  if (!isOffset(start) || !isOffset(end)) return false;
  const bound = Math.min(end, text.length);
  for (const signal of SIGNALS) {
    const e = start + signal.length;
    if (e > bound || !text.startsWith(signal, start)) continue;
    if (e === bound || text[e] === " " || text[e] === ",") return true;
  }
  return false;
}
function gapSignalsAt(text, at, limit) {
  if (!isOffset(at) || !Number.isInteger(limit)) return [];
  const bound = Math.min(limit, text.length);
  const ends = /* @__PURE__ */ new Set();
  for (const signal of GAP_SIGNALS) {
    const e = at + signal.length;
    if (e <= bound && text.startsWith(signal, at)) ends.add(e);
  }
  return [...ends].sort((a, b) => a - b);
}
var SIGNALS, GAP_SIGNAL_COUNT, lowerFirst, CAPITALISED_GAP_SIGNALS, GAP_SIGNALS, isOffset;
var init_signals = __esm({
  "packages/engine/src/citations/signals.ts"() {
    "use strict";
    SIGNALS = [
      "See",
      "See also",
      "See, e.g.,",
      "E.g.,",
      "Accord",
      "Cf.",
      "But see",
      "Compare",
      "Citing",
      "Quoting",
      "But cf.",
      "Contra",
      "E.g.",
      "See generally"
    ];
    GAP_SIGNAL_COUNT = 10;
    lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);
    CAPITALISED_GAP_SIGNALS = SIGNALS.slice(0, GAP_SIGNAL_COUNT);
    GAP_SIGNALS = [
      ...CAPITALISED_GAP_SIGNALS,
      ...CAPITALISED_GAP_SIGNALS.map(lowerFirst)
    ];
    isOffset = (n) => Number.isInteger(n) && n >= 0;
  }
});

// packages/engine/src/citations/party.ts
function isLegalAbbreviation(word) {
  if (word === "v.") return false;
  return LEGAL_ABBREVIATION_INDEX.byLength.get(word.length)?.has(word) ?? false;
}
function isCapitalisedWord(text, start, end) {
  if (!isOffset2(start) || !isOffset2(end) || end <= start || end > text.length) return false;
  const word = text.slice(start, end);
  if (CAPITALISED.test(word) || SINGLE_CAPITAL_INITIAL.test(word)) return true;
  return isLegalAbbreviation(word);
}
function tokenBeforeSpace(text, t, lo) {
  const s = t.start;
  if (s - 1 < lo || text[s - 1] !== " ") return null;
  return readTokenBefore(text, s - 1, lo);
}
function tokenBeforeComma(text, t, lo) {
  const s = t.start;
  if (s - 2 < lo || text[s - 1] !== " " || text[s - 2] !== ",") return null;
  return readWordTokenBefore(text, s - 2, lo);
}
function connectorFrom(text, t, lo) {
  const word = wordOf(text, t);
  if (SINGLE_CONNECTORS.has(word)) return t;
  if (word !== "rel.") return null;
  const ex = tokenBeforeSpace(text, t, lo);
  return ex !== null && wordOf(text, ex) === "ex" ? ex : null;
}
function step(text, t, state, leftSide, lo) {
  const cap = isCapitalisedWord(text, t.start, t.end);
  const toR = { accept: true, state: "R", leftSide, from: t, via: "space" };
  if (state === "E") {
    const suffix = SUFFIXES.has(wordOf(text, t)) && tokenBeforeComma(text, t, lo) !== null;
    if (suffix) return { accept: true, state: "S", leftSide, from: t, via: "comma" };
    return cap ? toR : null;
  }
  if (cap) return toR;
  if (state === "S") return null;
  const connector = connectorFrom(text, t, lo);
  if (connector !== null)
    return { accept: false, state: "K", leftSide, from: connector, via: "space" };
  if (state === "R" && !leftSide && wordOf(text, t) === "v.") {
    return { accept: false, state: "E", leftSide: true, from: t, via: "space" };
  }
  return null;
}
function longestRunStart(text, c) {
  const lo = Math.max(0, c - PARTY_SCAN);
  let tok = readWordTokenBefore(text, c, lo);
  let state = "E";
  let leftSide = false;
  let best = null;
  while (tok !== null) {
    const next = step(text, tok, state, leftSide, lo);
    if (next === null) break;
    if (next.accept) {
      if (c - next.from.start > MAX_PARTY) return "too_long";
      best = next.from.start;
    }
    ({ state, leftSide } = next);
    tok = next.via === "comma" ? tokenBeforeComma(text, next.from, lo) : tokenBeforeSpace(text, next.from, lo);
  }
  return best;
}
function startsWithEntry(words, i, entry) {
  if (i + entry.length >= words.length) return false;
  return entry.every((w, k) => words[i + k] === w);
}
function strippedWordIndex(words) {
  let i = 0;
  let changed = true;
  while (changed) {
    changed = false;
    const entry = PARTY_STOP_LIST.find((e) => startsWithEntry(words, i, e));
    if (entry !== void 0) {
      i += entry.length;
      changed = true;
    }
    for (; ; ) {
      const connector = CONNECTORS.find((e) => startsWithEntry(words, i, e));
      if (connector === void 0) break;
      i += connector.length;
      changed = true;
    }
  }
  return i;
}
function partyStartFor(text, c) {
  if (!isOffset2(c) || c > text.length) return null;
  const best = longestRunStart(text, c);
  if (best === null || best === "too_long") return null;
  const words = text.slice(best, c).split(" ");
  const i = strippedWordIndex(words);
  if (i >= words.length || words[i] === "v.") return null;
  return words.slice(0, i).reduce((offset, w) => offset + w.length + 1, best);
}
var MAX_PARTY, PARTY_SCAN, CONNECTORS, PARTY_STOP_LIST, CAPITALISED, SINGLE_CAPITAL_INITIAL, SUFFIXES, SINGLE_CONNECTORS, isOffset2, wordOf;
var init_party = __esm({
  "packages/engine/src/citations/party.ts"() {
    "use strict";
    init_abbreviations();
    init_party_lex();
    init_reporters2();
    init_signals();
    MAX_PARTY = 80;
    PARTY_SCAN = 2 * MAX_PARTY + 1;
    CONNECTORS = [
      ["&"],
      ["of"],
      ["the"],
      ["and"],
      ["ex", "rel."]
    ];
    PARTY_STOP_LIST = [
      ...SIGNALS,
      "In",
      "As",
      "Under",
      "Following",
      "Applying",
      "The court in",
      "The Court in"
    ].map((entry) => entry.split(" "));
    CAPITALISED = new RegExp("^\\p{Lu}[\\p{L}0-9'\u2019-]*$", "u");
    SINGLE_CAPITAL_INITIAL = /^[A-Z]\.$/;
    SUFFIXES = new Set(ENTITY_SUFFIX_WORDS);
    SINGLE_CONNECTORS = /* @__PURE__ */ new Set(["&", "of", "the", "and"]);
    isOffset2 = (n) => Number.isInteger(n) && n >= 0;
    wordOf = (text, t) => text.slice(t.start, t.end);
  }
});

// packages/engine/src/citations/case-name.ts
function isRange(text, s, t) {
  return Number.isInteger(s) && Number.isInteger(t) && s >= 0 && s <= t && t <= text.length;
}
function hasPartyShape(text, s, t) {
  const first = text.charAt(s);
  const last = text.charAt(t - 1);
  if (!(isLetter(first) || isDigit(first)) || last === " " || last === ",") return false;
  for (let i = s; i < t; i++) {
    const u = text.charAt(i);
    if (!isPartyUnit(u)) return false;
    if (u === " " && i + 1 < t && text.charAt(i + 1) === " ") return false;
  }
  return true;
}
function markAbbreviationPeriods(text, s, t) {
  const marked = /* @__PURE__ */ new Set();
  for (let j = s; j < t; j++) {
    if (j !== s && text.charAt(j - 1) !== " ") continue;
    for (const end of abbreviationsStartingAt(text, j, t, LEGAL_ABBREVIATION_INDEX)) {
      for (let k = j; k < end; k++) if (text.charAt(k) === ".") marked.add(k);
    }
  }
  return marked;
}
function closesInitial(text, s, i) {
  const c = i - 1;
  return c >= s && isAsciiCapital(text.charAt(c)) && (c === s || text.charAt(c - 1) === " ");
}
function periodsAllowed(text, s, t) {
  let marked = null;
  for (let i = s; i < t; i++) {
    if (text.charAt(i) !== "." || closesInitial(text, s, i)) continue;
    marked ??= markAbbreviationPeriods(text, s, t);
    if (!marked.has(i)) return false;
  }
  return true;
}
function hasDigitPattern(text, s, t) {
  let first = -1;
  for (let i = s; i + 1 < t && first < 0; i++) {
    if (isDigit(text.charAt(i)) && text.charAt(i + 1) === " ") first = i;
  }
  if (first < 0) return false;
  for (let k = t - 1; k >= first + 4; k--) {
    if (isDigit(text.charAt(k)) && text.charAt(k - 1) === " ") return true;
  }
  return false;
}
function isPartyName(text, start, end) {
  if (!isRange(text, start, end)) return false;
  const length = end - start;
  if (length < 1 || length > MAX_PARTY) return false;
  if (!hasPartyShape(text, start, end)) return false;
  const inner = text.indexOf(V, start);
  if (inner >= 0 && inner + V.length <= end) return false;
  if (startsWithSignal(text, start, end)) return false;
  return periodsAllowed(text, start, end) && !hasDigitPattern(text, start, end);
}
function splitCaseName(text, start, end) {
  if (!isRange(text, start, end) || end - start < MIN_CASE_NAME) return null;
  if (text.charAt(end - 1) !== ",") return null;
  const body = end - 1;
  const k = text.indexOf(V, start);
  if (k < 0 || k + V.length > body) return null;
  const again = text.indexOf(V, k + 1);
  if (again >= 0 && again + V.length <= body) return null;
  return { left: [start, k], right: [k + V.length, body] };
}
function isCaseName(text, start, end) {
  const sides = splitCaseName(text, start, end);
  if (sides === null) return false;
  const [ls, le] = sides.left;
  const [rs, re] = sides.right;
  return isPartyName(text, ls, le) && isPartyName(text, rs, re);
}
function beginsWithGapWord(text, s, t) {
  for (const word of GAP_LEADING_WORDS) {
    const e = s + word.length;
    if (e > t || !text.startsWith(word, s)) continue;
    if (e === t || text.charAt(e) === " " || text.charAt(e) === ",") return true;
  }
  return false;
}
function isGapCaseName(text, start, end) {
  if (!isCaseName(text, start, end)) return false;
  const sides = splitCaseName(text, start, end);
  if (sides === null) return false;
  const [ls, le] = sides.left;
  const [rs, re] = sides.right;
  return !beginsWithGapWord(text, ls, le) && !beginsWithGapWord(text, rs, re);
}
function skipP(text, from, limit) {
  let i = from;
  while (i < limit && isP(text.charAt(i))) i++;
  return i;
}
function caseAt(text, x, z, g1) {
  const hi = Math.min(g1, x + MAX_CASE_NAME);
  for (let e = Math.max(z + 1, x + MIN_CASE_NAME); e <= hi; e++) {
    if (text.charAt(e - 1) === "," && isGapCaseName(text, x, e)) return true;
  }
  return false;
}
function matchPrecedingGap(text, g0, g1) {
  if (!isRange(text, g0, g1)) return false;
  const a = skipP(text, g0, g1);
  if (a === g1) return true;
  let z = g1;
  while (z > a && isP(text.charAt(z - 1))) z--;
  if (caseAt(text, a, z, g1)) return true;
  const b = gapSignalsAt(text, a, g1).at(-1);
  if (b === void 0) return false;
  const a2 = skipP(text, b, g1);
  return a2 === g1 || caseAt(text, a2, z, g1);
}
var MAX_CASE_NAME, MIN_CASE_NAME, V, LETTER2, isDigit, isLetter, isAsciiCapital, PUNCT, isPartyUnit, GAP_PUNCT, isP, GAP_LEADING_WORDS;
var init_case_name = __esm({
  "packages/engine/src/citations/case-name.ts"() {
    "use strict";
    init_abbreviations();
    init_party();
    init_reporters2();
    init_signals();
    MAX_CASE_NAME = 2 * MAX_PARTY + 4 + 1;
    MIN_CASE_NAME = 7;
    V = " v. ";
    LETTER2 = new RegExp("^\\p{L}$", "u");
    isDigit = (u) => u >= "0" && u <= "9";
    isLetter = (u) => u.length === 1 && LETTER2.test(u);
    isAsciiCapital = (u) => u >= "A" && u <= "Z" && u.length === 1;
    PUNCT = /* @__PURE__ */ new Set([".", ",", "'", "\u2019", "&", "-", " "]);
    isPartyUnit = (u) => isLetter(u) || isDigit(u) || PUNCT.has(u);
    GAP_PUNCT = /* @__PURE__ */ new Set([",", ";", ":", ".", "(", ")"]);
    isP = (u) => GAP_PUNCT.has(u) || /^\s$/.test(u);
    GAP_LEADING_WORDS = [
      "with",
      ...GAP_SIGNALS.filter((s) => /^[a-z]/.test(s))
    ];
  }
});

// packages/engine/src/citations/cited-name.ts
function tailComma(text, start) {
  if (!Number.isInteger(start) || start < 1 || start > text.length) return null;
  let i = start;
  while (i > 0 && isSpace(text[i - 1])) i -= 1;
  return i > 0 && text[i - 1] === "," ? i - 1 : null;
}
function inReName(text, c) {
  const lo = Math.max(0, c - IN_RE_WINDOW);
  const span = text.slice(lo, c);
  const found = Math.max(span.lastIndexOf("In re "), span.lastIndexOf("In Re "));
  if (found < 0) return void 0;
  const at = lo + found;
  const before = at === 0 ? void 0 : text[at - 1];
  if (before !== void 0 && !isSpace(before) && before !== "(") return void 0;
  return isPartyName(text, at + 6, c) ? text.slice(at, c) : void 0;
}
function strictName(text, c) {
  const s = partyStartFor(text, c);
  if (s !== null && isCaseName(text, s, c + 1)) return text.slice(s, c);
  return inReName(text, c);
}
function isNameToken(token) {
  const body = token.length > 2 && token.endsWith(".,") ? token.slice(0, -1) : token;
  return NAME_TOKEN.test(body);
}
function tokenStart(text, end) {
  let s = end;
  while (s > 0 && !isSpace(text[s - 1])) s -= 1;
  return s;
}
function inBefore(text, s) {
  if (s < 3 || text.slice(s - 3, s) !== "In ") return null;
  return s - 3 === 0 || isSpace(text[s - 4]) ? s - 3 : null;
}
function scanLeft(text, c) {
  let left = c;
  let pos = c;
  let sawV = false;
  for (; ; ) {
    const s = tokenStart(text, pos);
    if (s === pos || c - s > MAX_NAME) break;
    const token = text.slice(s, pos);
    if (token === "re" || token === "Re") {
      const inAt = inBefore(text, s);
      if (inAt !== null && c - inAt <= MAX_NAME) return { left: inAt, inRe: true };
      if (token === "re") break;
    } else if (token === "v.") {
      if (sawV) break;
      sawV = true;
    } else if (!isNameToken(token) && !DIGITS.test(token) && !TOLERANT_CONNECTORS.has(token)) {
      break;
    }
    left = s;
    if (s === 0 || text[s - 1] !== " ") break;
    pos = s - 1;
  }
  return { left, inRe: false };
}
function startsWithEntry2(words, i, entry) {
  return i + entry.length < words.length && entry.every((w, k) => words[i + k] === w);
}
function trimmedIndex(words) {
  let i = 0;
  for (; ; ) {
    const entry = [...PARTY_STOP_LIST, ...CONNECTORS].find((e) => startsWithEntry2(words, i, e));
    if (entry === void 0) return i;
    i += entry.length;
  }
}
function acceptedName(text, scan, c) {
  const words = text.slice(scan.left, c).split(" ");
  if (scan.inRe) return words.length >= 3 ? words.join(" ") : void 0;
  const rest = words.slice(trimmedIndex(words));
  const v = rest.indexOf("v.");
  return v >= 1 && v < rest.length - 1 ? rest.join(" ") : void 0;
}
function tolerantName(text, c) {
  return acceptedName(text, scanLeft(text, c), c);
}
function citedNameFor(text, start) {
  const c = tailComma(text, start);
  if (c === null) return void 0;
  const strict = strictName(text, c);
  const tolerant = tolerantName(text, c);
  if (strict === void 0) return tolerant;
  return extendsStrictSafely(strict, tolerant) ? tolerant : strict;
}
function extendsStrictSafely(strict, tolerant) {
  if (tolerant === void 0 || tolerant.length <= strict.length || !tolerant.endsWith(strict)) {
    return false;
  }
  const added = tolerant.slice(0, tolerant.length - strict.length).split(/\s+/);
  return !added.some((w) => w.endsWith("."));
}
var MAX_NAME, IN_RE_WINDOW, NAME_TOKEN, DIGITS, TOLERANT_CONNECTORS, isSpace;
var init_cited_name = __esm({
  "packages/engine/src/citations/cited-name.ts"() {
    "use strict";
    init_case_name();
    init_party();
    MAX_NAME = MAX_CASE_NAME - 1;
    IN_RE_WINDOW = MAX_PARTY + 6;
    NAME_TOKEN = new RegExp("^\\p{Lu}[\\p{L}\\p{N}'\u2019.-]*$", "u");
    DIGITS = /^[0-9]+$/;
    TOLERANT_CONNECTORS = /* @__PURE__ */ new Set([
      "of",
      "the",
      "and",
      "for",
      "&",
      "de",
      "la"
    ]);
    isSpace = (ch) => ch !== void 0 && /\s/.test(ch);
  }
});

// packages/engine/src/result.ts
function ok(value) {
  return { ok: true, value };
}
function err(error) {
  return { ok: false, error };
}
var init_result = __esm({
  "packages/engine/src/result.ts"() {
    "use strict";
  }
});

// packages/engine/src/citations/lex.ts
function isAsciiDigitAt(text, i) {
  const u = text.charCodeAt(i);
  return u >= CODE_0 && u <= CODE_9;
}
function isWordChar(unit) {
  return WORD_CHAR.test(unit);
}
function codePointAt(text, i) {
  if (i < 0 || i >= text.length) return "";
  const end = isHigh2(text.charCodeAt(i)) && isLow2(text.charCodeAt(i + 1)) ? i + 2 : i + 1;
  return text.slice(i, end);
}
function codePointBefore(text, p) {
  if (p <= 0 || p > text.length) return "";
  const start = isLow2(text.charCodeAt(p - 1)) && isHigh2(text.charCodeAt(p - 2)) ? p - 2 : p - 1;
  return text.slice(start, p);
}
function isWordCharBefore(text, p) {
  return isWordChar(codePointBefore(text, p));
}
function isWordCharAt(text, p) {
  return isWordChar(codePointAt(text, p));
}
function digitCount(n) {
  return String(n).length;
}
function readInt(text, at, range) {
  if (at < 0 || !isAsciiDigitAt(text, at)) return null;
  if (text.charCodeAt(at) === CODE_0) return null;
  const maxDigits = digitCount(range.max);
  let end = at;
  let value = 0;
  while (end < text.length && isAsciiDigitAt(text, end)) {
    if (end - at === maxDigits) return null;
    value = value * 10 + (text.charCodeAt(end) - CODE_0);
    end += 1;
  }
  if (value < range.min || value > range.max) return null;
  return { value, end };
}
function readSpaces(text, at, min = 1, max = 1) {
  if (at < 0) return null;
  let end = at;
  while (end < text.length && text[end] === SPACE) {
    if (end - at === max) return null;
    end += 1;
  }
  return end - at < min ? null : end;
}
function readLiteral(text, at, literal) {
  if (at < 0 || literal.length === 0) return null;
  return text.startsWith(literal, at) ? at + literal.length : null;
}
var VOLUME_RANGE, PAGE_RANGE, PINCITE_RANGE, YEAR_RANGE, DOC_NUMBER_RANGE, WORD_CHAR, CODE_0, CODE_9, SPACE, isHigh2, isLow2;
var init_lex = __esm({
  "packages/engine/src/citations/lex.ts"() {
    "use strict";
    VOLUME_RANGE = { min: 1, max: 99999 };
    PAGE_RANGE = { min: 1, max: 99999 };
    PINCITE_RANGE = { min: 1, max: 99999 };
    YEAR_RANGE = { min: 1600, max: 2999 };
    DOC_NUMBER_RANGE = { min: 1, max: 9999999 };
    WORD_CHAR = /^[\p{L}\p{N}]$/u;
    CODE_0 = 48;
    CODE_9 = 57;
    SPACE = " ";
    isHigh2 = (u) => u >= 55296 && u <= 56319;
    isLow2 = (u) => u >= 56320 && u <= 57343;
  }
});

// packages/engine/src/citations/pincite.ts
function readShort(text, at) {
  let end = at;
  while (end < text.length && isAsciiDigitAt(text, end)) {
    if (end - at === MAX_SHORT_DIGITS) return null;
    end += 1;
  }
  return end === at || isWordCharAt(text, end) ? null : end;
}
function readItem(text, at) {
  const page = readInt(text, at, PINCITE_RANGE);
  if (page === null) return null;
  const dash = text[page.end] === "-" || text[page.end] === "\u2013";
  const shortEnd = dash ? readShort(text, page.end + 1) : null;
  if (shortEnd !== null) return { first: page.value, end: shortEnd };
  return isWordCharAt(text, page.end) ? null : { first: page.value, end: page.end };
}
function startsDatabaseYear(text, at) {
  const year = readInt(text, at, YEAR_RANGE);
  if (year === null || year.end - at !== 4 || text[year.end] !== " ") return false;
  return UPPERCASE.test(text.charAt(year.end + 1));
}
function readLaterItem(text, at, o) {
  const comma = readLiteral(text, at, ",");
  const start = comma === null ? null : readSpaces(text, comma);
  if (start === null || o.startsMember(text, start) || startsDatabaseYear(text, start)) {
    return null;
  }
  return readItem(text, start);
}
function readPinciteExpression(text, at, o) {
  const head = at < 0 ? null : readItem(text, at);
  if (head === null) return null;
  let end = head.end;
  for (let items = 1; o.list && items < MAX_PINCITE_ITEMS; items += 1) {
    const next = readLaterItem(text, end, o);
    if (next === null || next.end - at > MAX_PINCITE_LENGTH) break;
    end = next.end;
  }
  return { first: head.first, end };
}
var MAX_PINCITE_ITEMS, MAX_PINCITE_LENGTH, MAX_SHORT_DIGITS, UPPERCASE;
var init_pincite = __esm({
  "packages/engine/src/citations/pincite.ts"() {
    "use strict";
    init_lex();
    MAX_PINCITE_ITEMS = 5;
    MAX_PINCITE_LENGTH = 24;
    MAX_SHORT_DIGITS = 5;
    UPPERCASE = new RegExp("^\\p{Lu}$", "u");
  }
});

// packages/engine/src/citations/grammar.ts
function resolveReporterAt(text, at, follow) {
  if (at < 0) return null;
  const last = Math.min(at + MAX_REPORTER_TOKEN, text.length - 1);
  for (let e = last; e > at; e -= 1) {
    if (text[e] !== " ") continue;
    const reporter = lookupReporter(text.slice(at, e));
    if (reporter === null) continue;
    const result = follow(reporter, e);
    if (result !== null) return result;
  }
  return null;
}
function readCommaSpace(text, at) {
  const comma = readLiteral(text, at, ",");
  return comma === null ? null : readSpaces(text, comma);
}
function readBoundedInt(text, at, range) {
  const n = readInt(text, at, range);
  return n === null || isWordCharAt(text, n.end) ? null : n;
}
function readMemberCore(text, at) {
  const vol = readInt(text, at, VOLUME_RANGE);
  if (vol === null) return null;
  const tokenStart2 = readSpaces(text, vol.end);
  if (tokenStart2 === null) return null;
  return resolveReporterAt(text, tokenStart2, (reporter, e) => {
    const page = readBoundedInt(text, e + 1, PAGE_RANGE);
    if (page === null) return null;
    return { member: { volume: vol.value, reporter, page: page.value }, end: page.end };
  });
}
function startsMember(text, at) {
  const vol = readInt(text, at, VOLUME_RANGE);
  const tokenStart2 = vol === null ? null : readSpaces(text, vol.end);
  if (tokenStart2 === null) return false;
  const hit = resolveReporterAt(
    text,
    tokenStart2,
    (_r, e) => isAsciiDigitAt(text, e + 1) ? true : null
  );
  return hit === true;
}
function readPincite(text, at) {
  const n = readCommaSpace(text, at);
  if (n === null || startsMember(text, n)) return null;
  const read = readPinciteExpression(text, n, { list: true, startsMember });
  return read === null ? null : { value: read.first, end: read.end };
}
function readMember(text, at) {
  const core = readMemberCore(text, at);
  if (core === null) return null;
  const pin = readPincite(text, core.end);
  if (pin === null) return core;
  return { member: { ...core.member, pincite: pin.value }, end: pin.end };
}
function matchParallelTail(text, at, members) {
  const out = [...members];
  let end = at;
  while (out.length < MAX_MEMBERS) {
    const start = readCommaSpace(text, end);
    const next = start === null ? null : readMember(text, start);
    if (next === null) break;
    out.push(next.member);
    end = next.end;
  }
  return { members: out, end };
}
function isYearToken(token) {
  if (token.length !== 4) return false;
  const year = readInt(token, 0, YEAR_RANGE);
  return year !== null && year.end === 4;
}
function isCourtText(court) {
  if (court.length < 1 || court.length > MAX_COURT_LENGTH) return false;
  const tokens = court.split(" ");
  if (tokens.some((t) => t.length === 0 || COURT_FORBIDDEN.test(t))) return false;
  return !isYearToken(tokens[tokens.length - 1] ?? "");
}
function findClose(text, from) {
  const limit = Math.min(from + MAX_PAREN_CONTENT, text.length - 1);
  for (let i = from; i <= limit; i += 1) {
    const ch = text[i];
    if (ch === ")") return i;
    if (ch === "(") return null;
  }
  return null;
}
function parseContent(content, end) {
  const sp = content.lastIndexOf(" ");
  const lastToken = content.slice(sp + 1);
  if (!isYearToken(lastToken)) return isCourtText(content) ? { end, court: content } : null;
  const year = Number(lastToken);
  if (sp < 0) return { end, year };
  const court = content.slice(0, sp);
  return isCourtText(court) ? { end, court, year } : null;
}
function matchParenthetical(text, at) {
  const open2 = readLiteral(text, at, " (");
  if (open2 === null) return null;
  const close2 = findClose(text, open2);
  if (close2 === null) return null;
  return parseContent(text.slice(open2, close2), close2 + 1);
}
function buildValue(members, paren) {
  const extra = {
    ...paren?.court === void 0 ? {} : { court: paren.court },
    ...paren?.year === void 0 ? {} : { year: paren.year }
  };
  const [first] = members;
  if (members.length === 1 && first !== void 0) return { kind: "reporter", ...first, ...extra };
  return { kind: "parallel", members, ...extra };
}
function matchReporterAt(text, p) {
  if (!isAsciiDigitAt(text, p) || isWordCharBefore(text, p)) return null;
  const first = readMember(text, p);
  if (first === null) return null;
  const tail = matchParallelTail(text, first.end, [first.member]);
  const paren = matchParenthetical(text, tail.end);
  return { start: p, end: paren?.end ?? tail.end, value: buildValue(tail.members, paren) };
}
var MAX_REPORTER_TOKEN, MAX_MEMBERS, MAX_COURT_LENGTH, MAX_PAREN_CONTENT, COURT_FORBIDDEN;
var init_grammar = __esm({
  "packages/engine/src/citations/grammar.ts"() {
    "use strict";
    init_lex();
    init_pincite();
    init_reporters2();
    MAX_REPORTER_TOKEN = 40;
    MAX_MEMBERS = 4;
    MAX_COURT_LENGTH = 40;
    MAX_PAREN_CONTENT = MAX_COURT_LENGTH + 5;
    COURT_FORBIDDEN = /[\s()"“”]/u;
  }
});

// packages/engine/src/citations/lexis-courts.json
var lexis_courts_default;
var init_lexis_courts = __esm({
  "packages/engine/src/citations/lexis-courts.json"() {
    lexis_courts_default = [
      "Ala. App.",
      "Ala. Civ. App.",
      "Ala. Crim. App.",
      "Ala.",
      "Alas. App.",
      "Alas.",
      "Ariz. App.",
      "Ariz. App. Unpub.",
      "Ariz.",
      "Ariz. Tax",
      "Ariz. Unpub.",
      "Ark. App.",
      "Ark.",
      "BTA",
      "Bankr.",
      "CAAF",
      "CCA",
      "CCPA",
      "CMA",
      "CMR",
      "Cal. App.",
      "Cal. App. Unpub.",
      "Cal. Comm. Jud. Perform.",
      "Cal. Jud. Ethics Op.",
      "Cal.",
      "Cal. Super.",
      "Colo. App.",
      "Colo. Discipl.",
      "Colo.",
      "Conn. App.",
      "Conn. Cir.",
      "Conn.",
      "Conn. Super.",
      "Ct. Intl. Trade",
      "Cust. Ct.",
      "D.C. App.",
      "D.C. Super.",
      "Dakota",
      "Del. C.P.",
      "Del. Ch.",
      "Del. Fam. Ct.",
      "Del.",
      "Del. Super.",
      "Fla. App.",
      "Fla.",
      "Ga. App.",
      "Ga.",
      "Guam",
      "Haw. App.",
      "Haw.",
      "Ida. App.",
      "Ida. App. Unpub.",
      "Ida.",
      "Ill. App.",
      "Ill. App. Unpub.",
      "Ill. Ct. Cl.",
      "Ill.",
      "Ind. App.",
      "Ind. App. Unpub.",
      "Ind.",
      "Ind. Tax",
      "Indian Terr.",
      "Iowa App.",
      "Iowa Sup.",
      "Kan. App.",
      "Kan. App. Unpub.",
      "Kan.",
      "Kan. Unpub.",
      "Ky. App.",
      "Ky. App. Unpub.",
      "Ky.",
      "Ky. Unpub.",
      "La. App.",
      "La. App. Unpub.",
      "La.",
      "Mass. App. Div.",
      "Mass. App.",
      "Mass. App. Unpub.",
      "Mass. LCR",
      "Mass.",
      "Mass. Super.",
      "Md. App.",
      "Md. Cir. Ct.",
      "Md.",
      "Md. Tax",
      "Me.",
      "Me. Super.",
      "Me. Unpub.",
      "Mich. App.",
      "Mich.",
      "Minn. App.",
      "Minn. App. Unpub.",
      "Minn. Dist.",
      "Minn.",
      "Minn. Tax",
      "Miss. App.",
      "Miss.",
      "Mo. App.",
      "Mo.",
      "Mont. Dist.",
      "Mont.",
      "Mont. Water",
      "N. Mar. I.",
      "N.C. App.",
      "N.C.",
      "N.D. App.",
      "N.D.",
      "N.H.",
      "N.H. Super.",
      "N.J. Ch.",
      "N.J.",
      "N.J. Misc.",
      "N.J. Prerog. Ct.",
      "N.J. Sup. Ct.",
      "N.J. Super.",
      "N.J. Super. Unpub.",
      "N.M. App.",
      "N.M. App. Unpub.",
      "N.M.",
      "N.M. Unpub.",
      "N.Y. App. Div.",
      "N.Y.",
      "N.Y. Misc.",
      "NCBC",
      "Neb. App.",
      "Neb.",
      "Nev.",
      "Nev. Unpub.",
      "Ohio App.",
      "Ohio",
      "Ohio Misc.",
      "Okla. Civ. App.",
      "Okla. Crim. App.",
      "Okla. JUD",
      "Okla.",
      "Ore. App.",
      "Ore.",
      "Ore. Tax",
      "PR App.",
      "PR Sup.",
      "Pa. Commw.",
      "Pa. Commw. Unpub.",
      "Pa. Dist. & Cnty. Dec.",
      "Pa. Jud. Disc.",
      "Pa.",
      "Pa. Super.",
      "Pa. Super. Unpub.",
      "Phila. Ct. Com. Pl.",
      "Phila. Cty. Rptr.",
      "R.I.",
      "R.I. Super.",
      "S.C. App.",
      "S.C. App. Unpub.",
      "S.C.",
      "S.C. Unpub.",
      "S.D.",
      "Tax Ct. Memo",
      "Tax Ct. Summary",
      "Tenn. App.",
      "Tenn. Ch. App.",
      "Tenn. Crim. App.",
      "Tenn.",
      "Tex. App.",
      "Tex. Crim. App.",
      "Tex. Crim. App. Unpub.",
      "Tex.",
      "U.S. App.",
      "U.S. CMCR",
      "U.S. Claims",
      "U.S. Commerce Ct.",
      "U.S. Ct. Cl.",
      "U.S. Dist.",
      "U.S.",
      "U.S. Tax Ct.",
      "U.S. Vet. App.",
      "Utah App.",
      "Utah",
      "V.I.",
      "V.I. Supreme",
      "Va. App.",
      "Va. Cir.",
      "Va.",
      "Va. Unpub.",
      "Vt.",
      "Vt. Super.",
      "Vt. Unpub.",
      "W. Va.",
      "Wash. App.",
      "Wash.",
      "Wash. Terr.",
      "Wisc. App.",
      "Wisc. Cir.",
      "Wisc.",
      "Wyo."
    ];
  }
});

// packages/engine/src/citations/lexis-courts.ts
function lookupLexisCourt(court) {
  const at = lexisExactIndex.get(court) ?? lexisCollapsedIndex.get(collapseReporter(court));
  return at === void 0 ? null : LEXIS_COURTS[at] ?? null;
}
function isYearToken2(token) {
  const year = readInt(token, 0, YEAR_RANGE);
  return year !== null && year.end === token.length;
}
function isUnlistedToken(token) {
  return UNLISTED_TOKEN_START.test(token) && !UNLISTED_FORBIDDEN.test(token) && !isYearToken2(token) && token !== "LEXIS";
}
function isUnlistedLexisCourt(court) {
  if (court.length < 1 || court.length > MAX_LEXIS_COURT) return false;
  const tokens = court.split(" ");
  if (tokens[0] === "WL" || !tokens.every(isUnlistedToken)) return false;
  return lookupLexisCourt(court) === null;
}
var LEXIS_COURTS, lexisExactIndex, lexisCollapsedIndex, MAX_LEXIS_COURT, UNLISTED_FORBIDDEN, UNLISTED_TOKEN_START;
var init_lexis_courts2 = __esm({
  "packages/engine/src/citations/lexis-courts.ts"() {
    "use strict";
    init_lex();
    init_lexis_courts();
    init_reporters2();
    LEXIS_COURTS = lexis_courts_default;
    lexisExactIndex = firstIndexBy(LEXIS_COURTS, (e) => e);
    lexisCollapsedIndex = firstIndexBy(
      LEXIS_COURTS,
      collapseReporter
    );
    MAX_LEXIS_COURT = 40;
    UNLISTED_FORBIDDEN = /[\s()"“”,]/u;
    UNLISTED_TOKEN_START = /^[A-Z0-9]/;
  }
});

// packages/engine/src/citations/format.ts
function isIntIn(n, range) {
  return typeof n === "number" && Number.isInteger(n) && n >= range.min && n <= range.max;
}
function isOptIntIn(n, range) {
  return n === void 0 || isIntIn(n, range);
}
function isReporter(r) {
  return typeof r === "string" && exactIndex.has(r);
}
function isOptCourt(c) {
  return c === void 0 || typeof c === "string" && isCourtText(c);
}
function membersOf(v) {
  if (v.kind === "reporter") return [v];
  return v.kind === "parallel" ? v.members : [];
}
function eachMember(field3, test) {
  return { field: field3, ok: (v) => membersOf(v).every(test) };
}
function isLexisFlag(v) {
  const flag = v.lexisCourtListed;
  return v.designator === "WL" ? flag === void 0 : typeof flag === "boolean";
}
function isLexisCourtPart(v) {
  const c = v.lexisCourt;
  if (v.designator === "WL") return c === void 0;
  if (typeof c !== "string") return false;
  return v.lexisCourtListed === true ? lexisExactIndex.has(c) : isUnlistedLexisCourt(c);
}
function isFullKind(v) {
  return v.kind === "reporter" || v.kind === "parallel" || v.kind === "database";
}
function validateFullValue(v) {
  if (!isFullKind(v)) return err({ kind: "invalid_citation", field: "kind" });
  const failed2 = CHECKS.find((c) => !c.ok(v));
  return failed2 === void 0 ? ok(v) : err({ kind: "invalid_citation", field: failed2.field });
}
function layoutMember(m) {
  const core = [String(m.volume), m.reporter, String(m.page)].join(" ");
  return m.pincite === void 0 ? core : `${core}, ${String(m.pincite)}`;
}
function layoutParenthetical(court, year) {
  const parts = [court, year === void 0 ? void 0 : String(year)].filter(
    (p) => p !== void 0
  );
  return parts.length === 0 ? "" : ` (${parts.join(" ")})`;
}
function layoutDatabase(v) {
  const designator = v.designator === "WL" ? "WL" : `${v.lexisCourt ?? ""} LEXIS`;
  const core = [String(v.year), designator, String(v.number)].join(" ");
  return v.pincite === void 0 ? core : `${core}, at *${String(v.pincite)}`;
}
function layoutParallel(v) {
  return v.members.map(layoutMember).join(", ") + layoutParenthetical(v.court, v.year);
}
function layout(v) {
  if (v.kind === "database") return layoutDatabase(v);
  if (v.kind === "parallel") return layoutParallel(v);
  return layoutMember(v) + layoutParenthetical(v.court, v.year);
}
function format(value) {
  const valid = validateFullValue(value);
  return valid.ok ? ok(layout(valid.value)) : valid;
}
var MIN_MEMBERS, CHECKS;
var init_format = __esm({
  "packages/engine/src/citations/format.ts"() {
    "use strict";
    init_result();
    init_grammar();
    init_lex();
    init_lexis_courts2();
    init_reporters2();
    MIN_MEMBERS = 2;
    CHECKS = [
      eachMember("volume", (m) => isIntIn(m.volume, VOLUME_RANGE)),
      eachMember("reporter", (m) => isReporter(m.reporter)),
      eachMember("page", (m) => isIntIn(m.page, PAGE_RANGE)),
      {
        field: "pincite",
        ok: (v) => v.kind === "database" ? isOptIntIn(v.pincite, PINCITE_RANGE) : membersOf(v).every((m) => isOptIntIn(m.pincite, PINCITE_RANGE))
      },
      { field: "court", ok: (v) => v.kind === "database" || isOptCourt(v.court) },
      { field: "lexisCourtListed", ok: (v) => v.kind !== "database" || isLexisFlag(v) },
      { field: "lexisCourt", ok: (v) => v.kind !== "database" || isLexisCourtPart(v) },
      {
        field: "year",
        ok: (v) => v.kind === "database" ? isIntIn(v.year, YEAR_RANGE) : isOptIntIn(v.year, YEAR_RANGE)
      },
      {
        field: "members",
        ok: (v) => v.kind !== "parallel" || v.members.length >= MIN_MEMBERS && v.members.length <= MAX_MEMBERS
      },
      { field: "number", ok: (v) => v.kind !== "database" || isIntIn(v.number, DOC_NUMBER_RANGE) }
    ];
  }
});

// packages/engine/src/citations/link.ts
function pairsOf(value) {
  switch (value.kind) {
    case "reporter":
      return [pairKey(value.volume, value.reporter)];
    case "parallel":
      return value.members.map((m) => pairKey(m.volume, m.reporter));
    case "database":
      return [];
  }
}
function afterFull(state, value, start) {
  const byPair = new Map(state.byPair);
  for (const key of pairsOf(value)) byPair.set(key, start);
  return { prev: start, byPair };
}
function targetOf2(value, state) {
  if (value.kind !== "short") return null;
  if (value.form === "id") return state.prev;
  return state.byPair.get(pairKey(value.volume, value.reporter)) ?? null;
}
function step2(m, state) {
  const v = m.value;
  switch (v.kind) {
    case "reporter":
    case "parallel":
    case "database":
      return { match: m, state: afterFull(state, v, m.start) };
    case "other":
      return { match: m, state: { prev: null, byPair: state.byPair } };
    case "short": {
      const targetStart = targetOf2(v, state);
      const match = { ...m, value: { ...v, targetStart } };
      return { match, state: { prev: targetStart, byPair: state.byPair } };
    }
  }
}
function linkShortForms(matches) {
  const out = [];
  let state = { prev: null, byPair: /* @__PURE__ */ new Map() };
  for (const m of matches) {
    const s = step2(m, state);
    out.push(s.match);
    state = s.state;
  }
  return out;
}
var pairKey;
var init_link = __esm({
  "packages/engine/src/citations/link.ts"() {
    "use strict";
    pairKey = (volume, reporter) => `${String(volume)} ${reporter}`;
  }
});

// packages/engine/src/boundary.ts
function isInsideCitation(b, ranges) {
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = lo + hi >>> 1;
    const r = ranges[mid];
    if (r === void 0) return false;
    if (b <= r.start) hi = mid - 1;
    else if (b >= r.end) lo = mid + 1;
    else return true;
  }
  return false;
}
function terminatorEndBefore(text, b) {
  let i = b - 1;
  if (!isWhitespace2(text.charAt(i))) return -1;
  while (i >= 0 && isWhitespace2(text.charAt(i))) i -= 1;
  while (i >= 0 && isCloser(text.charAt(i))) i -= 1;
  return i >= 0 && isTerminator(text.charAt(i)) ? i : -1;
}
function wordRunEnd(text, start) {
  let e = start;
  while (e < text.length && isPartyWordUnitAt(text, e)) {
    e += isHighSurrogate(text.charCodeAt(e)) ? 2 : 1;
  }
  return e;
}
function isInitialBeforeCapitalisedWord(text, i) {
  if (!Number.isInteger(i) || i < 1 || text.charAt(i) !== ".") return false;
  if (!isAsciiUpper(text.charAt(i - 1))) return false;
  if (i >= 2 && text.charAt(i - 2) !== " ") return false;
  if (text.charAt(i + 1) !== " ") return false;
  const end = wordRunEnd(text, i + 2);
  if (text.slice(i + 2, end) === "Id.") return false;
  return isCapitalisedWord(text, i + 2, end);
}
function isBoundaryAt(text, b, citationRanges, index = LEGAL_ABBREVIATION_INDEX) {
  if (!Number.isInteger(b) || b <= 0 || b >= text.length) return false;
  if (isWhitespace2(text.charAt(b))) return false;
  const i = terminatorEndBefore(text, b);
  if (i < 0) return false;
  if (isInsideCitation(b, citationRanges)) return false;
  if (isAbbreviationEndingAt(text, i, index)) return false;
  return !isInitialBeforeCapitalisedWord(text, i);
}
function countBoundaries(text, from, to, citationRanges, cap, index = LEGAL_ABBREVIATION_INDEX) {
  let count = 0;
  if (!(cap > 0)) return count;
  const first = Math.max(Math.floor(from) + 1, 1);
  const last = Math.min(Math.floor(to), text.length - 1);
  for (let b = first; b <= last; b += 1) {
    if (!isWhitespace2(text.charAt(b - 1))) continue;
    if (!isBoundaryAt(text, b, citationRanges, index)) continue;
    count += 1;
    if (count >= cap) return count;
  }
  return count;
}
var WHITESPACE, isWhitespace2, isCloser, isTerminator, isAsciiUpper, isHighSurrogate;
var init_boundary = __esm({
  "packages/engine/src/boundary.ts"() {
    "use strict";
    init_abbreviations();
    init_party_lex();
    init_party();
    init_reporters2();
    WHITESPACE = /\s/;
    isWhitespace2 = (unit) => unit.length > 0 && WHITESPACE.test(unit);
    isCloser = (unit) => unit === '"' || unit === "\u201D" || unit === "'" || unit === "\u2019" || unit === ")";
    isTerminator = (unit) => unit === "." || unit === "?" || unit === "!";
    isAsciiUpper = (unit) => unit.length === 1 && unit >= "A" && unit <= "Z";
    isHighSurrogate = (u) => u >= 55296 && u <= 56319;
  }
});

// packages/engine/src/citations/quotes.ts
function hasContent(text, pair) {
  return NON_WHITESPACE.test(text.slice(pair.open + 1, pair.close));
}
function pairStraight(text) {
  const out = [];
  let open2 = -1;
  for (let i = text.indexOf(STRAIGHT); i >= 0; i = text.indexOf(STRAIGHT, i + 1)) {
    if (open2 < 0) {
      open2 = i;
    } else {
      out.push({ open: open2, close: i });
      open2 = -1;
    }
  }
  return out;
}
function pairCurly(text) {
  const out = [];
  let open2 = -1;
  for (let i = 0; i < text.length; i++) {
    const u = text.charAt(i);
    if (u === CURLY_OPEN) {
      open2 = i;
    } else if (u === CURLY_CLOSE && open2 >= 0) {
      out.push({ open: open2, close: i });
      open2 = -1;
    }
  }
  return out;
}
function dropOpeningInsideKept(sorted) {
  const out = [];
  let lastClose = -1;
  for (const p of sorted) {
    if (p.open > lastClose) {
      out.push(p);
      lastClose = p.close;
    }
  }
  return out;
}
function pairQuoteMarks(text) {
  const pairs = [...pairStraight(text), ...pairCurly(text)];
  const sorted = pairs.filter((p) => hasContent(text, p)).sort((a, b) => a.open - b.open);
  return dropOpeningInsideKept(sorted);
}
function firstStartingAfter(cits, at) {
  let lo = 0;
  let hi = cits.length;
  while (lo < hi) {
    const mid = lo + hi >>> 1;
    const c = cits[mid];
    if (c !== void 0 && c.start <= at) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
function lastEndingBy(cits, at) {
  let lo = 0;
  let hi = cits.length;
  while (lo < hi) {
    const mid = lo + hi >>> 1;
    const c = cits[mid];
    if (c !== void 0 && c.end <= at) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}
function precedingTarget(text, pair, cits) {
  const x = cits[firstStartingAfter(cits, pair.close)];
  if (x === void 0 || !isAttachable(x)) return null;
  if (!matchPrecedingGap(text, pair.close + 1, x.start)) return null;
  return countBoundaries(text, pair.close, x.start, cits, 2) <= 1 ? x : null;
}
function isFollowGap(text, from, to) {
  for (let i = from; i < to; i++) {
    const u = text.charAt(i);
    if (!FOLLOW_PUNCT.has(u) && !WHITESPACE2.test(u)) return false;
  }
  return true;
}
function followingTarget(text, pair, cits) {
  const y = cits[lastEndingBy(cits, pair.open)];
  if (y === void 0 || !isAttachable(y)) return null;
  if (!isFollowGap(text, y.end, pair.open)) return null;
  return countBoundaries(text, y.start, pair.open, cits, 1) === 0 ? y : null;
}
function quoteOf(text, pair, citationStart, rule) {
  const start = pair.open + 1;
  return { start, end: pair.close, text: text.slice(start, pair.close), citationStart, rule };
}
function attachQuotes(text, pairs, cits) {
  const out = [];
  for (const pair of pairs) {
    const x = precedingTarget(text, pair, cits);
    if (x !== null) {
      out.push(quoteOf(text, pair, x.start, "preceding"));
      continue;
    }
    const y = followingTarget(text, pair, cits);
    if (y !== null) out.push(quoteOf(text, pair, y.start, "following"));
  }
  return out;
}
var STRAIGHT, CURLY_OPEN, CURLY_CLOSE, NON_WHITESPACE, WHITESPACE2, FOLLOW_PUNCT, isAttachable;
var init_quotes = __esm({
  "packages/engine/src/citations/quotes.ts"() {
    "use strict";
    init_boundary();
    init_case_name();
    STRAIGHT = '"';
    CURLY_OPEN = "\u201C";
    CURLY_CLOSE = "\u201D";
    NON_WHITESPACE = /\S/;
    WHITESPACE2 = /^\s$/;
    FOLLOW_PUNCT = /* @__PURE__ */ new Set([",", ";", ":", "("]);
    isAttachable = (c) => c.value.kind !== "other";
  }
});

// packages/engine/src/citations/grammar-db.ts
function matchDatabaseAt(text, p) {
  if (p < 0 || p >= text.length || isWordCharBefore(text, p)) return null;
  const year = readInt(text, p, YEAR_RANGE);
  if (year === null) return null;
  const afterYear = readSpaces(text, year.end);
  if (afterYear === null) return null;
  const head = readDesignator(text, afterYear);
  if (head === null) return null;
  const docNumber = readBoundedInt2(text, head.end, DOC_NUMBER_RANGE);
  if (docNumber === null) return null;
  const pincite = readPincite2(text, docNumber.end);
  const afterPincite = pincite === null ? docNumber.end : pincite.end;
  const paren = readParenthetical(text, afterPincite);
  const value = {
    kind: "database",
    year: year.value,
    ...head.value,
    number: docNumber.value,
    ...pincite === null ? {} : { pincite: pincite.value }
  };
  return { start: p, end: paren === null ? afterPincite : paren.end, value };
}
function readDesignator(text, at) {
  const wl = readLiteral(text, at, WL);
  if (wl !== null) {
    const end2 = readSpaces(text, wl);
    if (end2 !== null) return { value: { designator: "WL" }, end: end2 };
  }
  const court = readLexisCourt(text, at);
  if (court === null) return null;
  const designator = lexisDesignator(court.value);
  const end = readSpaces(text, court.end);
  return end === null || designator === null ? null : { value: designator, end };
}
function lexisDesignator(court) {
  if (court.split(" ").some(isYearToken3)) return null;
  const entry = lookupLexisCourt(court);
  if (entry !== null) return { designator: "LEXIS", lexisCourtListed: true, lexisCourt: entry };
  return isUnlistedLexisCourt(court) ? { designator: "LEXIS", lexisCourtListed: false, lexisCourt: court } : null;
}
function readLexisCourt(text, at) {
  let tokenStart2 = at;
  for (; ; ) {
    const tokenEnd = readCourtToken(text, tokenStart2, at + MAX_COURT_LENGTH + 1 + LEXIS.length);
    if (tokenEnd === null) return null;
    if (text.slice(tokenStart2, tokenEnd) === LEXIS) {
      if (tokenStart2 === at) return null;
      return { value: text.slice(at, tokenStart2 - 1), end: tokenEnd };
    }
    if (tokenEnd - at > MAX_COURT_LENGTH) return null;
    const next = readSpaces(text, tokenEnd);
    if (next === null) return null;
    tokenStart2 = next;
  }
}
function readCourtToken(text, at, limit) {
  let end = at;
  while (end < text.length && !COURT_TOKEN_END.test(text.charAt(end))) {
    if (end === limit) return null;
    end += 1;
  }
  return end === at ? null : end;
}
function isYearToken3(token) {
  const year = readInt(token, 0, YEAR_RANGE);
  return year !== null && year.end === token.length;
}
function readBoundedInt2(text, at, range) {
  const n = readInt(text, at, range);
  return n === null || isWordCharAt(text, n.end) ? null : n;
}
function readPincite2(text, at) {
  const lead = readLiteral(text, at, PINCITE_LEAD);
  if (lead === null) return null;
  const read = readPinciteExpression(text, lead, { list: false, startsMember: () => false });
  return read === null ? null : { value: read.first, end: read.end };
}
function readParenthetical(text, at) {
  const open2 = readSpaces(text, at);
  if (open2 === null || text[open2] !== "(") return null;
  const limit = open2 + 1 + MAX_COURT_LENGTH + 1 + 4;
  const found = text.slice(open2 + 1, limit + 1).indexOf(")");
  if (found === -1) return null;
  const close2 = open2 + 1 + found;
  return isParentheticalContent(text.slice(open2 + 1, close2)) ? { end: close2 + 1 } : null;
}
function isParentheticalContent(content) {
  const lastSpace = content.lastIndexOf(" ");
  const last = content.slice(lastSpace + 1);
  if (!isYearToken3(last)) return isCourtText(content);
  return lastSpace === -1 || isCourtText(content.slice(0, lastSpace));
}
var WL, LEXIS, PINCITE_LEAD, COURT_TOKEN_END;
var init_grammar_db = __esm({
  "packages/engine/src/citations/grammar-db.ts"() {
    "use strict";
    init_lex();
    init_grammar();
    init_lexis_courts2();
    init_pincite();
    WL = "WL";
    LEXIS = "LEXIS";
    PINCITE_LEAD = ", at *";
    COURT_TOKEN_END = /[\s()"“”]/u;
  }
});

// packages/engine/src/citations/grammar-other.ts
function isAsciiAlnumAt(text, i) {
  const u = text.charCodeAt(i);
  return u >= 48 && u <= 57 || u >= 65 && u <= 90 || u >= 97 && u <= 122;
}
function readSubdivision(text, at) {
  if (text[at] !== "(") return null;
  let i = at + 1;
  while (isAsciiAlnumAt(text, i) && i - at - 1 < MAX_SUBDIVISION) i += 1;
  if (i === at + 1 || text[i] !== ")") return null;
  return i + 1;
}
function readSectionCore(text, at) {
  let i = at;
  for (; ; ) {
    if (isAsciiAlnumAt(text, i)) i += 1;
    else if ((text[i] === "." || text[i] === "-") && isAsciiAlnumAt(text, i + 1)) i += 2;
    else return i;
    if (i - at > MAX_SECTION) return i;
  }
}
function readSection(text, at) {
  if (at < 0 || !isAsciiDigitAt(text, at) || text.charCodeAt(at) < CODE_1) return null;
  let end = readSectionCore(text, at);
  for (; ; ) {
    if (end - at > MAX_SECTION) return null;
    const next = readSubdivision(text, end);
    if (next === null) break;
    end = next;
  }
  if (end - at > MAX_SECTION || isWordCharAt(text, end)) return null;
  return end;
}
function readSectionSign(text, at) {
  return readLiteral(text, at, "\xA7\xA7 ") ?? readLiteral(text, at, "\xA7 ");
}
function matchCodeAt(text, p) {
  const title = readInt(text, p, TITLE_RANGE);
  if (title === null) return null;
  const usc = readLiteral(text, title.end, " U.S.C. ");
  const cfr = usc === null ? readLiteral(text, title.end, " C.F.R. ") : null;
  const afterCode = usc ?? cfr;
  if (afterCode === null) return null;
  const sectionStart = readSectionSign(text, afterCode);
  if (sectionStart === null) return null;
  const end = readSection(text, sectionStart);
  if (end === null) return null;
  const form = usc !== null ? "usc" : "cfr";
  const value = {
    kind: "other",
    form,
    title: title.value,
    section: text.slice(sectionStart, end)
  };
  return { start: p, end, value };
}
function matchFedRuleAt(text, p) {
  const afterPrefix = readLiteral(text, p, "Fed. R. ");
  if (afterPrefix === null) return null;
  for (const set of FED_RULE_SETS) {
    const ruleStart = readLiteral(text, afterPrefix, set);
    if (ruleStart === null) continue;
    const end = readSection(text, ruleStart);
    if (end === null) return null;
    const value = {
      kind: "other",
      form: "fed_rule",
      section: text.slice(ruleStart, end)
    };
    return { start: p, end, value };
  }
  return null;
}
function matchOtherAt(text, p) {
  if (p < 0 || p >= text.length || isWordCharBefore(text, p)) return null;
  return isAsciiDigitAt(text, p) ? matchCodeAt(text, p) : matchFedRuleAt(text, p);
}
var TITLE_RANGE, MAX_SECTION, MAX_SUBDIVISION, FED_RULE_SETS, CODE_1;
var init_grammar_other = __esm({
  "packages/engine/src/citations/grammar-other.ts"() {
    "use strict";
    init_lex();
    TITLE_RANGE = { min: 1, max: 999 };
    MAX_SECTION = 40;
    MAX_SUBDIVISION = 8;
    FED_RULE_SETS = [
      "Civ. P. ",
      "Crim. P. ",
      "App. P. ",
      "Bankr. P. ",
      "Evid. "
    ];
    CODE_1 = 49;
  }
});

// packages/engine/src/citations/grammar-short.ts
function idLeftContextOk(text, p) {
  if (p === 0) return true;
  const before = text.charAt(p - 1);
  return WHITESPACE3.test(before) || ID_OPENERS.has(before);
}
function readPinciteAt(text, at) {
  return readPinciteExpression(text, at, { list: true, startsMember });
}
function matchIdAt(text, p) {
  if (!isOffset3(p) || !idLeftContextOk(text, p)) return null;
  const idEnd = readLiteral(text, p, "Id.");
  if (idEnd === null) return null;
  const atEnd = readLiteral(text, idEnd, " at ");
  const page = atEnd === null ? null : readPinciteAt(text, atEnd);
  if (page === null) {
    return { start: p, end: idEnd, value: { kind: "short", form: "id", targetStart: null } };
  }
  const value = { kind: "short", form: "id", pincite: page.first, targetStart: null };
  return { start: p, end: page.end, value };
}
function startsLegalAbbreviation(unit) {
  const entries = LEGAL_ABBREVIATION_INDEX.byFirstUnit.get(unit) ?? [];
  return entries.some((a) => a !== "v.");
}
function partyFastAccept(text, p) {
  if (!isOffset3(p) || p >= text.length) return false;
  if (p > 0 && isPartyWordUnitAt(text, p - 1)) return false;
  const head = text.slice(p, p + 2);
  return UPPERCASE_START.test(head) || startsLegalAbbreviation(text.charAt(p));
}
function matchPartyTailAt(text, c) {
  const volStart = readLiteral(text, c, ", ");
  const vol = volStart === null ? null : readInt(text, volStart, VOLUME_RANGE);
  if (vol === null || text[vol.end] !== " ") return null;
  return resolveReporterAt(text, vol.end + 1, (reporter, e) => {
    const pageStart = readLiteral(text, e, " at ");
    const page = pageStart === null ? null : readPinciteAt(text, pageStart);
    if (page === null) return null;
    return { volume: vol.value, reporter, page: page.first, end: page.end };
  });
}
function firstTailComma(text, p) {
  const last = Math.min(p + MAX_PARTY, text.length - 1);
  for (let c = p + 1; c <= last; c += 1) {
    if (text[c] !== ",") continue;
    const tail = matchPartyTailAt(text, c);
    if (tail !== null) return { c, tail };
  }
  return null;
}
function matchPartyShortAt(text, p) {
  if (!partyFastAccept(text, p)) return null;
  const found = firstTailComma(text, p);
  if (found === null || partyStartFor(text, found.c) !== p) return null;
  const { c, tail } = found;
  const value = {
    kind: "short",
    form: "party",
    party: text.slice(p, c),
    volume: tail.volume,
    reporter: tail.reporter,
    pincite: tail.page,
    targetStart: null
  };
  return { start: p, end: tail.end, value };
}
function matchShortAt(text, p) {
  const id = matchIdAt(text, p);
  const party = matchPartyShortAt(text, p);
  if (id === null) return party;
  if (party === null) return id;
  return party.end > id.end ? party : id;
}
var ID_OPENERS, WHITESPACE3, UPPERCASE_START, isOffset3;
var init_grammar_short = __esm({
  "packages/engine/src/citations/grammar-short.ts"() {
    "use strict";
    init_lex();
    init_grammar();
    init_pincite();
    init_party();
    init_party_lex();
    init_reporters2();
    ID_OPENERS = /* @__PURE__ */ new Set(["(", "[", '"', "\u201C", "\u2018", "'"]);
    WHITESPACE3 = /^\s$/u;
    UPPERCASE_START = new RegExp("^\\p{Lu}", "u");
    isOffset3 = (n) => Number.isInteger(n) && n >= 0;
  }
});

// packages/engine/src/citations/scan.ts
function capped(m) {
  return m !== null && m.end > m.start && m.end - m.start <= MAX_MATCH ? m : null;
}
function fullAt(w, q) {
  return capped(matchDatabaseAt(w, q)) ?? capped(matchReporterAt(w, q));
}
function fullStartsInside(w, m) {
  for (let q = m.start + 1; q < m.end; q += 1) {
    if (fullAt(w, q) !== null) return true;
  }
  return false;
}
function otherAt(w, q) {
  const m = capped(matchOtherAt(w, q));
  return m === null || fullStartsInside(w, m) ? null : m;
}
function matchInWindow(w, q) {
  const bounded = !isWordCharBefore(w, q);
  if (bounded) {
    const full = fullAt(w, q);
    if (full !== null) return full;
  }
  const short = capped(matchShortAt(w, q));
  if (short !== null) return short;
  return bounded ? otherAt(w, q) : null;
}
function matchAt(text, p) {
  if (!Number.isInteger(p) || p < 0 || p >= text.length) return null;
  const lo = Math.max(0, p - LOOKBEHIND);
  const w = text.slice(lo, p + LOOKAHEAD);
  const m = matchInWindow(w, p - lo);
  return m === null ? null : { start: m.start + lo, end: m.end + lo, value: m.value };
}
function scanRange(text, from, until) {
  const out = [];
  let p = Number.isInteger(from) && from > 0 ? from : 0;
  while (p < text.length && !until(p)) {
    const m = matchAt(text, p);
    if (m === null) {
      p += 1;
    } else {
      out.push(m);
      p = m.end;
    }
  }
  return out;
}
var MAX_MATCH, LOOKAHEAD, LOOKBEHIND;
var init_scan = __esm({
  "packages/engine/src/citations/scan.ts"() {
    "use strict";
    init_grammar_db();
    init_grammar_other();
    init_grammar_short();
    init_grammar();
    init_lex();
    init_party();
    MAX_MATCH = 512;
    LOOKAHEAD = 2 * MAX_MATCH;
    LOOKBEHIND = PARTY_SCAN + 1;
  }
});

// packages/engine/src/citations/extract.ts
function normalisedOf(value, written) {
  if (!isFull(value)) return void 0;
  const canonical = format(value);
  return canonical.ok && canonical.value !== written ? canonical.value : void 0;
}
function toCitation(text, m) {
  const written = text.slice(m.start, m.end);
  const base = { start: m.start, end: m.end, text: written, value: m.value };
  const normalised = normalisedOf(m.value, written);
  const name = isFull(m.value) ? citedNameFor(text, m.start) : void 0;
  return {
    ...base,
    ...normalised === void 0 ? {} : { normalised },
    ...name === void 0 ? {} : { caseName: name }
  };
}
function extractFromMatches(text, matches) {
  const citations = linkShortForms(matches).map((m) => toCitation(text, m));
  const quotes = attachQuotes(text, pairQuoteMarks(text), citations);
  return { citations, quotes };
}
function extract(text) {
  return extractFromMatches(text, scanRange(text, 0, never));
}
var never, isFull;
var init_extract = __esm({
  "packages/engine/src/citations/extract.ts"() {
    "use strict";
    init_cited_name();
    init_format();
    init_link();
    init_quotes();
    init_scan();
    never = () => false;
    isFull = (v) => v.kind === "reporter" || v.kind === "parallel" || v.kind === "database";
  }
});

// packages/engine/src/citations/incremental.ts
function firstStartAfter(matches, x) {
  let lo = 0;
  let hi = matches.length;
  while (lo < hi) {
    const mid = lo + hi >>> 1;
    if (matches[mid].start > x) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}
function containing(matches, x) {
  const i = firstStartAfter(matches, x) - 1;
  const m = i >= 0 ? matches[i] : void 0;
  return m !== void 0 && m.start < x && x < m.end ? m : null;
}
function isLanding(matches, x, oldLength) {
  return x >= 0 && x < oldLength && containing(matches, x) === null;
}
function leftResync(matches, x) {
  if (x <= 0) return 0;
  return containing(matches, x)?.start ?? x;
}
function isConsistent(edit, newLength) {
  const { from, oldTo, newTo } = edit;
  const ints = Number.isInteger(from) && Number.isInteger(oldTo) && Number.isInteger(newTo);
  const oldLength = newLength - (newTo - oldTo);
  return ints && from >= 0 && from <= oldTo && from <= newTo && newTo <= newLength && oldTo <= oldLength;
}
function shiftedFrom(matches, x, delta) {
  const out = [];
  for (let i = firstStartAfter(matches, x - 1); i < matches.length; i += 1) {
    const m = matches[i];
    out.push({ ...m, start: m.start + delta, end: m.end + delta });
  }
  return out;
}
function rescan(prev, edit, newText) {
  if (!isConsistent(edit, newText.length)) return scanRange(newText, 0, never2);
  const delta = edit.newTo - edit.oldTo;
  const oldLength = newText.length - delta;
  const s = leftResync(prev, edit.from - LOOKAHEAD - 1);
  const rightFloor = edit.newTo + LOOKBEHIND;
  let q = newText.length;
  const until = (p) => {
    if (p < rightFloor || !isLanding(prev, p - delta, oldLength)) return false;
    q = p;
    return true;
  };
  const fresh2 = scanRange(newText, s, until);
  const kept = prev.slice(0, firstStartAfter(prev, s - 1));
  return [...kept, ...fresh2, ...shiftedFrom(prev, q - delta, delta)];
}
var never2;
var init_incremental = __esm({
  "packages/engine/src/citations/incremental.ts"() {
    "use strict";
    init_scan();
    never2 = () => false;
  }
});

// packages/engine/src/citation-layer.ts
function matchOf(r) {
  const { start, end, value } = r.citation;
  return { start, end, value: unlinked(value) };
}
function matchesOf(doc) {
  return doc.citations.map(matchOf);
}
function creationLayer(text) {
  return { ...assignKeys(extract(text), 0), overrides: [] };
}
function reanchorStage({ prev, draft, edit }) {
  if (prev === null) return creationLayer(draft.text);
  const matches = rescan(matchesOf(prev), edit, draft.text);
  return reanchor(prev, draft, edit, extractFromMatches(draft.text, matches));
}
var unlinked;
var init_citation_layer = __esm({
  "packages/engine/src/citation-layer.ts"() {
    "use strict";
    init_anchor();
    init_extract();
    init_incremental();
    unlinked = (v) => v.kind === "short" ? { ...v, targetStart: null } : v;
  }
});

// packages/engine/src/spans.ts
function isMergeable(a, b) {
  if (a.origin !== b.origin) return false;
  if (hasRunId(a) !== hasRunId(b)) return false;
  return a.runId === b.runId;
}
function checkOne(span, prevStart, cursor, textLength) {
  if (!isOffset4(span.start) || !Number.isInteger(span.end)) return violation(cursor, "coverage");
  if (span.end <= span.start) return violation(span.start, "empty");
  if (span.start < prevStart) return violation(span.start, "unsorted");
  if (span.start < cursor) return violation(span.start, "overlap");
  if (span.start > cursor) return violation(cursor, "gap");
  if (span.end > textLength) return violation(textLength, "coverage");
  return ok(void 0);
}
function checkCoverage(textLength, spans) {
  if (!isOffset4(textLength)) return violation(0, "coverage");
  let cursor = 0;
  let prevStart = 0;
  for (const span of spans) {
    const checked2 = checkOne(span, prevStart, cursor, textLength);
    if (!checked2.ok) return checked2;
    prevStart = span.start;
    cursor = span.end;
  }
  if (cursor !== textLength) return violation(cursor, "coverage");
  return ok(void 0);
}
function mergeAll(spans) {
  const out = [];
  for (const span of spans) {
    const last = out[out.length - 1];
    if (last !== void 0 && isMergeable(last.provenance, span.provenance)) {
      out[out.length - 1] = extend(last, span);
    } else {
      out.push(span);
    }
  }
  return out;
}
function normaliseSpans(textLength, spans) {
  const checked2 = checkCoverage(textLength, spans);
  if (!checked2.ok) return checked2;
  return ok(mergeAll(spans));
}
function mergeSeams(spans, seams) {
  const wanted = seams.filter((s) => Number.isInteger(s) && s >= 1 && s < spans.length);
  if (wanted.length === 0) return spans;
  const seamSet = new Set(wanted);
  const out = [];
  spans.forEach((span, i) => {
    const last = out[out.length - 1];
    if (last !== void 0 && seamSet.has(i) && isMergeable(last.provenance, span.provenance)) {
      out[out.length - 1] = extend(last, span);
    } else {
      out.push(span);
    }
  });
  return out;
}
function spanIndexAt(spans, offset) {
  let lo = 0;
  let hi = spans.length - 1;
  while (lo <= hi) {
    const mid = lo + hi >>> 1;
    const span = spans[mid];
    if (span === void 0) return -1;
    if (offset < span.start) hi = mid - 1;
    else if (offset >= span.end) lo = mid + 1;
    else return mid;
  }
  return -1;
}
function runExtents(spans) {
  const extents = /* @__PURE__ */ new Map();
  for (const span of spans) {
    const runId2 = span.provenance.runId;
    if (runId2 === void 0) continue;
    const prev = extents.get(runId2);
    extents.set(runId2, prev === void 0 ? [span.start, span.end] : [prev[0], span.end]);
  }
  return extents;
}
var hasRunId, violation, isOffset4, extend;
var init_spans = __esm({
  "packages/engine/src/spans.ts"() {
    "use strict";
    init_result();
    hasRunId = (p) => Object.prototype.hasOwnProperty.call(p, "runId");
    violation = (offset, kind) => err({ kind: "invalid_spans", offset, violation: kind });
    isOffset4 = (n) => Number.isInteger(n) && n >= 0;
    extend = (last, next) => ({
      start: last.start,
      end: next.end,
      provenance: last.provenance
    });
  }
});

// packages/engine/src/relabel.ts
function searchRun(runs, runId2) {
  let lo = 0;
  let hi = runs.length - 1;
  while (lo <= hi) {
    const mid = lo + hi >>> 1;
    const run = runs[mid];
    if (run === void 0) break;
    if (run.runId === runId2) return mid;
    if (run.runId < runId2) lo = mid + 1;
    else hi = mid - 1;
  }
  return -(lo + 1);
}
function addOriginalLength(runs, provenance, length) {
  const runId2 = provenance.runId;
  if (provenance.origin !== "AI" || runId2 === void 0 || length <= 0) return runs;
  const i = searchRun(runs, runId2);
  const out = runs.slice();
  const found = runs[i];
  if (i >= 0 && found !== void 0) {
    out[i] = { ...found, originalLength: found.originalLength + length };
  } else {
    out.splice(-i - 1, 0, { runId: runId2, originalLength: length, editedCount: 0, relabelled: false });
  }
  return out;
}
function addEdited(runs, amounts) {
  let out = null;
  for (const [runId2, amount] of amounts) {
    const i = searchRun(runs, runId2);
    const found = runs[i];
    if (i < 0 || found === void 0 || amount <= 0) continue;
    out ??= runs.slice();
    out[i] = { ...found, editedCount: found.editedCount + amount };
  }
  return out ?? runs;
}
function countDeleted(runs, actor, deletedPieces) {
  if (actor !== "HUM") return runs;
  const amounts = /* @__PURE__ */ new Map();
  for (const piece of deletedPieces) {
    const runId2 = piece.provenance.runId;
    if (piece.provenance.origin !== "AI" || runId2 === void 0) continue;
    amounts.set(runId2, (amounts.get(runId2) ?? 0) + (piece.end - piece.start));
  }
  return addEdited(runs, amounts);
}
function countInserted(runs, actor, spansBefore, at, length) {
  if (actor !== "HUM" || length <= 0) return runs;
  const amounts = /* @__PURE__ */ new Map();
  for (const [runId2, [start, end]] of runExtents(spansBefore)) {
    if (start < at && at < end) amounts.set(runId2, length);
  }
  return addEdited(runs, amounts);
}
function relabelSpans(spans, runIds) {
  return spans.map((span) => {
    const { origin, runId: runId2, timestamp } = span.provenance;
    if (origin !== "AI" || runId2 === void 0 || !runIds.has(runId2)) return span;
    return { start: span.start, end: span.end, provenance: { origin: "AI>HUM", runId: runId2, timestamp } };
  });
}
function relabelRuns(spans, runs, threshold) {
  const flipped = runs.filter((run) => crosses(run, threshold)).map((run) => run.runId);
  if (flipped.length === 0) return ok({ spans, runs, relabelled: flipped });
  const set = new Set(flipped);
  const newRuns = runs.map((run) => set.has(run.runId) ? { ...run, relabelled: true } : run);
  const textLength = spans[spans.length - 1]?.end ?? 0;
  const normalised = normaliseSpans(textLength, relabelSpans(spans, set));
  if (!normalised.ok) return normalised;
  return ok({ spans: normalised.value, runs: newRuns, relabelled: flipped });
}
var crosses;
var init_relabel = __esm({
  "packages/engine/src/relabel.ts"() {
    "use strict";
    init_result();
    init_spans();
    crosses = (run, threshold) => !run.relabelled && run.editedCount / run.originalLength > threshold;
  }
});

// packages/engine/src/ops/splice.ts
function spliceText(text, from, to, inserted) {
  return text.slice(0, from) + inserted + text.slice(to);
}
function findRun(runs, runId2) {
  let lo = 0;
  let hi = runs.length - 1;
  while (lo <= hi) {
    const mid = lo + hi >>> 1;
    const run = runs[mid];
    if (run === void 0) return void 0;
    if (run.runId === runId2) return run;
    if (run.runId < runId2) lo = mid + 1;
    else hi = mid - 1;
  }
  return void 0;
}
function effectiveProvenance(provenance, runs) {
  if (provenance.origin !== "AI" || provenance.runId === void 0) return provenance;
  const run = findRun(runs, provenance.runId);
  if (run === void 0 || !run.relabelled) return provenance;
  return { origin: "AI>HUM", runId: provenance.runId, timestamp: provenance.timestamp };
}
function indexFrom(spans, offset) {
  const i = spanIndexAt(spans, offset);
  return i === -1 ? spans.length : i;
}
function leftPieces(spans, i, from) {
  const out = spans.slice(0, i);
  const cut = spans[i];
  if (cut !== void 0 && cut.start < from) out.push(mkSpan(cut.start, from, cut.provenance));
  return out;
}
function rightPieces(spans, k, to, delta) {
  const out = [];
  const cut = spans[k];
  if (cut !== void 0)
    out.push(mkSpan(Math.max(cut.start, to) + delta, cut.end + delta, cut.provenance));
  for (let idx = k + 1; idx < spans.length; idx += 1) {
    const s = spans[idx];
    if (s !== void 0)
      out.push(delta === 0 ? s : mkSpan(s.start + delta, s.end + delta, s.provenance));
  }
  return out;
}
function deletedBetween(spans, i, from, to) {
  const out = [];
  for (let idx = i; idx < spans.length; idx += 1) {
    const s = spans[idx];
    if (s === void 0 || s.start >= to) break;
    out.push(mkSpan(Math.max(s.start, from), Math.min(s.end, to), s.provenance));
  }
  return out;
}
function spliceSpans(spans, from, to, piece) {
  const inserted = piece === null ? 0 : piece.end - piece.start;
  const i = indexFrom(spans, from);
  const left = leftPieces(spans, i, from);
  const right = rightPieces(spans, indexFrom(spans, to), to, inserted - (to - from));
  const middle = piece === null || inserted === 0 ? [] : [piece];
  const seams = [left.length, left.length + middle.length];
  const deletedPieces = from < to ? deletedBetween(spans, i, from, to) : [];
  return { spans: mergeSeams([...left, ...middle, ...right], seams), deletedPieces };
}
var mkSpan;
var init_splice = __esm({
  "packages/engine/src/ops/splice.ts"() {
    "use strict";
    init_spans();
    mkSpan = (start, end, provenance) => ({
      start,
      end,
      provenance
    });
  }
});

// packages/engine/src/ops/inverse.ts
function makeInverse(prev, next, at, removedText, insertedLength) {
  return {
    kind: "inverse",
    expect: next,
    restore: {
      at,
      removeLength: insertedLength,
      insertText: removedText,
      spans: prev.spans,
      runs: prev.runs,
      citations: prev.citations,
      quotes: prev.quotes,
      overrides: prev.overrides,
      keyCounter: prev.keyCounter
    }
  };
}
function isCurrent(doc, inv) {
  return doc === inv.expect || structuralEqual(doc, inv.expect);
}
function restored(inv) {
  const r = inv.restore;
  return {
    text: spliceText(inv.expect.text, r.at, r.at + r.removeLength, r.insertText),
    spans: r.spans,
    runs: r.runs,
    citations: r.citations,
    quotes: r.quotes,
    overrides: r.overrides,
    keyCounter: r.keyCounter
  };
}
function redo(inv, restoredDoc) {
  const { at, removeLength, insertText } = inv.restore;
  const removedByUndo = inv.expect.text.slice(at, at + removeLength);
  return makeInverse(inv.expect, restoredDoc, at, removedByUndo, insertText.length);
}
function applyInverse(doc, inv) {
  if (!isCurrent(doc, inv)) return err({ kind: "stale_inverse" });
  const document = restored(inv);
  return ok({ document, inverse: redo(inv, document) });
}
var init_inverse = __esm({
  "packages/engine/src/ops/inverse.ts"() {
    "use strict";
    init_equal();
    init_result();
    init_splice();
  }
});

// packages/engine/src/ops/pipeline.ts
function relabelDraft(draft, threshold) {
  const relabelled = relabelRuns(draft.spans, draft.runs, threshold);
  if (!relabelled.ok) return relabelled;
  const { spans, runs } = relabelled.value;
  if (spans === draft.spans && runs === draft.runs) return ok(draft);
  return ok({ text: draft.text, spans, runs });
}
function settleDraft(prev, draft, edit) {
  return withLayer(draft, reanchorStage({ prev, draft, edit }));
}
function finishDraft(prev, draft, edit, threshold) {
  const relabelled = relabelDraft(draft, threshold);
  if (!relabelled.ok) return relabelled;
  return ok(settleDraft(prev, relabelled.value, edit));
}
var init_pipeline = __esm({
  "packages/engine/src/ops/pipeline.ts"() {
    "use strict";
    init_anchor();
    init_citation_layer();
    init_relabel();
    init_result();
  }
});

// packages/engine/src/ops/delete.ts
function deleteEdit(from, to) {
  return { from, oldTo: to, newTo: from };
}
function deleteDraft(doc, from, to, actor) {
  const { spans, deletedPieces } = spliceSpans(doc.spans, from, to, null);
  return {
    text: spliceText(doc.text, from, to, ""),
    spans,
    runs: countDeleted(doc.runs, actor, deletedPieces)
  };
}
function applyDelete(doc, op, threshold) {
  const draft = deleteDraft(doc, op.from, op.to, op.actor);
  const next = finishDraft(doc, draft, deleteEdit(op.from, op.to), threshold);
  if (!next.ok) return next;
  const document = next.value;
  const removed = doc.text.slice(op.from, op.to);
  return ok({ document, inverse: makeInverse(doc, document, op.from, removed, 0) });
}
var init_delete = __esm({
  "packages/engine/src/ops/delete.ts"() {
    "use strict";
    init_relabel();
    init_result();
    init_inverse();
    init_pipeline();
    init_splice();
  }
});

// packages/engine/src/ops/insert.ts
function insertEdit(at, length) {
  return { from: at, oldTo: at, newTo: at + length };
}
function insertDraft(doc, at, text, provenance) {
  const length = text.length;
  const counted = countInserted(
    addOriginalLength(doc.runs, provenance, length),
    provenance.origin,
    doc.spans,
    at,
    length
  );
  const piece = {
    start: at,
    end: at + length,
    provenance: effectiveProvenance(provenance, doc.runs)
  };
  const { spans } = spliceSpans(doc.spans, at, at, piece);
  return { text: spliceText(doc.text, at, at, text), spans, runs: counted };
}
function applyInsert(doc, op, threshold) {
  const draft = insertDraft(doc, op.at, op.text, op.provenance);
  const next = finishDraft(doc, draft, insertEdit(op.at, op.text.length), threshold);
  if (!next.ok) return next;
  const document = next.value;
  return ok({ document, inverse: makeInverse(doc, document, op.at, "", op.text.length) });
}
var init_insert = __esm({
  "packages/engine/src/ops/insert.ts"() {
    "use strict";
    init_relabel();
    init_result();
    init_inverse();
    init_pipeline();
    init_splice();
  }
});

// packages/engine/src/ops/replace.ts
function replaceEdit(from, to, length) {
  return { from, oldTo: to, newTo: from + length };
}
function replaceDraft(doc, op, threshold) {
  const deleted = relabelDraft(deleteDraft(doc, op.from, op.to, op.provenance.origin), threshold);
  if (!deleted.ok) return deleted;
  return relabelDraft(insertDraft(deleted.value, op.from, op.text, op.provenance), threshold);
}
function bothStages(doc, op, threshold) {
  const draft = replaceDraft(doc, op, threshold);
  if (!draft.ok) return draft;
  const edit = replaceEdit(op.from, op.to, op.text.length);
  return ok(settleDraft(doc, draft.value, edit));
}
function applyReplace(doc, op, threshold) {
  const { from, to, text, provenance } = op;
  if (text.length === 0)
    return applyDelete(doc, { kind: "delete", from, to, actor: provenance.origin }, threshold);
  if (from === to)
    return applyInsert(doc, { kind: "insert", at: from, text, provenance }, threshold);
  const next = bothStages(doc, op, threshold);
  if (!next.ok) return next;
  const document = next.value;
  const removed = doc.text.slice(from, to);
  return ok({ document, inverse: makeInverse(doc, document, from, removed, text.length) });
}
var init_replace = __esm({
  "packages/engine/src/ops/replace.ts"() {
    "use strict";
    init_result();
    init_delete();
    init_insert();
    init_inverse();
    init_pipeline();
  }
});

// packages/engine/src/validate.ts
function isLeapYear(year) {
  return year % 4 === 0 && year % 100 !== 0 || year % 400 === 0;
}
function daysInMonth(year, month) {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}
function isTimestamp(value) {
  if (typeof value !== "string") return false;
  const m = TIMESTAMP_RE.exec(value);
  if (m === null) return false;
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > daysInMonth(year, month)) return false;
  return hour <= 23 && minute <= 59 && second <= 59;
}
function isHigh3(unit) {
  return unit >= 55296 && unit <= 56319;
}
function isLow3(unit) {
  return unit >= 56320 && unit <= 57343;
}
function firstUnpairedSurrogate(text) {
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    if (isHigh3(unit)) {
      if (i + 1 < text.length && isLow3(text.charCodeAt(i + 1))) {
        i++;
        continue;
      }
      return i;
    }
    if (isLow3(unit)) return i;
  }
  return null;
}
function isValidBoundary(text, offset) {
  if (!Number.isInteger(offset) || offset < 0 || offset > text.length) return false;
  if (offset === 0 || offset === text.length) return true;
  return !(isHigh3(text.charCodeAt(offset - 1)) && isLow3(text.charCodeAt(offset)));
}
function isOrigin(value) {
  return ORIGINS.some((o) => o === value);
}
function checkProvenance(p) {
  const origin = p.origin;
  if (!isOrigin(origin)) return err({ kind: "invalid_provenance", field: "origin", value: origin });
  const hasRunId2 = Object.prototype.hasOwnProperty.call(p, "runId");
  const runId2 = p.runId;
  const needsRunId = origin === "AI" || origin === "AI>HUM";
  if (needsRunId && (typeof runId2 !== "string" || runId2 === "")) {
    return err({ kind: "invalid_provenance", field: "runId", value: runId2 });
  }
  if (!needsRunId && hasRunId2) {
    return err({ kind: "invalid_provenance", field: "runId", value: runId2 });
  }
  return ok(p);
}
var TIMESTAMP_RE, ORIGINS;
var init_validate = __esm({
  "packages/engine/src/validate.ts"() {
    "use strict";
    init_result();
    TIMESTAMP_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,9})?Z$/;
    ORIGINS = ["HUM", "PST", "AI", "AI>HUM"];
  }
});

// packages/engine/src/ops/validate.ts
function validateConfig(config) {
  if (config === void 0) return ok(DEFAULT_RELABEL_THRESHOLD);
  if (!Object.prototype.hasOwnProperty.call(config, "relabelThreshold")) {
    return ok(DEFAULT_RELABEL_THRESHOLD);
  }
  const t = config.relabelThreshold;
  if (typeof t === "number" && Number.isFinite(t) && t > 0 && t <= 1) return ok(t);
  return err({ kind: "invalid_config", field: "relabelThreshold", value: t });
}
function offsetFields(op) {
  if (op.kind === "insert") return [["at", op.at]];
  return [
    ["from", op.from],
    ["to", op.to]
  ];
}
function checkRange(length, fields) {
  for (const [field3, value] of fields) {
    const inRange = typeof value === "number" && Number.isInteger(value);
    if (!inRange || value < 0 || value > length) {
      return err({ kind: "out_of_range", field: field3, value, length });
    }
  }
  const [first, second] = fields;
  if (first !== void 0 && second !== void 0) {
    const from = first[1];
    const to = second[1];
    if (from > to) return err({ kind: "inverted_range", from, to });
  }
  return ok(void 0);
}
function checkSurrogates(docText, op, fields) {
  for (const [, value] of fields) {
    const offset = value;
    if (!isValidBoundary(docText, offset)) {
      return err({ kind: "split_surrogate", offset, where: "document" });
    }
  }
  if (op.kind === "delete") return ok(void 0);
  const lone = firstUnpairedSurrogate(op.text);
  if (lone !== null) return err({ kind: "split_surrogate", offset: lone, where: "text" });
  return ok(void 0);
}
function checkOpProvenance(op) {
  if (op.kind === "delete") {
    const actor = op.actor;
    if (ORIGINS2.some((o) => o === actor)) return ok(void 0);
    return err({ kind: "invalid_provenance", field: "actor", value: actor });
  }
  const origin = op.provenance.origin;
  if (origin === "AI>HUM")
    return err({ kind: "invalid_provenance", field: "origin", value: origin });
  const checked2 = checkProvenance(op.provenance);
  return checked2.ok ? ok(void 0) : checked2;
}
function checkTimestamp(op) {
  if (op.kind === "delete") return ok(void 0);
  const provenance = op.provenance;
  const value = provenance.timestamp;
  return isTimestamp(value) ? ok(void 0) : err({ kind: "invalid_timestamp", value });
}
function validateCallerOp(doc, op) {
  const fields = offsetFields(op);
  const steps = [
    () => checkRange(doc.text.length, fields),
    () => checkSurrogates(doc.text, op, fields),
    () => checkOpProvenance(op),
    () => checkTimestamp(op)
  ];
  for (const step3 of steps) {
    const result = step3();
    if (!result.ok) return result;
  }
  return ok(op);
}
var DEFAULT_RELABEL_THRESHOLD, ORIGINS2;
var init_validate2 = __esm({
  "packages/engine/src/ops/validate.ts"() {
    "use strict";
    init_result();
    init_validate();
    DEFAULT_RELABEL_THRESHOLD = 0.4;
    ORIGINS2 = ["HUM", "PST", "AI", "AI>HUM"];
  }
});

// packages/engine/src/ops.ts
var init_ops = __esm({
  "packages/engine/src/ops.ts"() {
    "use strict";
    init_delete();
    init_insert();
    init_inverse();
    init_pipeline();
    init_replace();
    init_splice();
    init_validate2();
  }
});

// packages/engine/src/document.ts
function createDocument(text, timestamp) {
  if (!isTimestamp(timestamp)) return err({ kind: "invalid_timestamp", value: timestamp });
  const surrogate = firstUnpairedSurrogate(text);
  if (surrogate !== null) {
    return err({ kind: "split_surrogate", offset: surrogate, where: "text" });
  }
  const spans = text.length === 0 ? [] : [{ start: 0, end: text.length, provenance: { origin: "PST", timestamp } }];
  const draft = { text, spans, runs: [] };
  const layer = reanchorStage({ prev: null, draft, edit: creationEdit(text.length) });
  return ok(withLayer(draft, layer));
}
function noOpAt(op) {
  if (op.kind === "insert") return op.text.length === 0 ? op.at : null;
  if (op.kind === "delete") return op.from === op.to ? op.from : null;
  return op.from === op.to && op.text.length === 0 ? op.from : null;
}
function dispatch(doc, op, threshold) {
  if (op.kind === "insert") return applyInsert(doc, op, threshold);
  if (op.kind === "delete") return applyDelete(doc, op, threshold);
  return applyReplace(doc, op, threshold);
}
function apply(doc, op, config) {
  const threshold = validateConfig(config);
  if (!threshold.ok) return threshold;
  if (op.kind === "inverse") return applyInverse(doc, op);
  const valid = validateCallerOp(doc, op);
  if (!valid.ok) return valid;
  const at = noOpAt(valid.value);
  if (at !== null) return ok({ document: doc, inverse: makeInverse(doc, doc, at, "", 0) });
  return dispatch(doc, valid.value, threshold.value);
}
var init_document = __esm({
  "packages/engine/src/document.ts"() {
    "use strict";
    init_anchor();
    init_citation_layer();
    init_ops();
    init_result();
    init_spans();
    init_validate();
  }
});

// packages/engine/src/segment.ts
var init_segment = __esm({
  "packages/engine/src/segment.ts"() {
    "use strict";
    init_boundary();
    init_extract();
    init_result();
    init_spans();
  }
});

// packages/engine/src/verification.ts
function findKeyed(doc, key) {
  for (const r of doc.citations) {
    if (r.kind !== "other" && r.key === key) return r;
  }
  return null;
}
function fullAt2(doc, start) {
  for (const r of doc.citations) {
    if (r.kind === "full" && r.citation.start === start) return r;
  }
  return null;
}
function verificationOf(doc, key) {
  const rec = findKeyed(doc, key);
  if (rec === null) return null;
  if (rec.kind === "full") return rec.result;
  const value = rec.citation.value;
  if (value.kind !== "short" || value.targetStart === null) return UNCHECKED;
  const target = fullAt2(doc, value.targetStart);
  return target === null ? UNCHECKED : target.result;
}
var UNCHECKED;
var init_verification = __esm({
  "packages/engine/src/verification.ts"() {
    "use strict";
    init_equal();
    init_result();
    init_validate();
    UNCHECKED = { status: "unchecked" };
  }
});

// packages/engine/src/issues.ts
var init_issues = __esm({
  "packages/engine/src/issues.ts"() {
    "use strict";
    init_anchor_keys();
    init_result();
    init_validate();
  }
});

// packages/engine/src/codes/check-types.ts
var rangeKey, fault;
var init_check_types = __esm({
  "packages/engine/src/codes/check-types.ts"() {
    "use strict";
    rangeKey = (start, end) => `${String(start)}:${String(end)}`;
    fault = (index, rule) => ({ index, rule });
  }
});

// packages/engine/src/codes/build.ts
function resultOf(s) {
  switch (s.status) {
    case "verified":
      return { status: "verified", clusterId: s.clusterId ?? "" };
    case "wrong_case":
      return {
        status: "wrong_case",
        clusterId: s.clusterId ?? "",
        foundName: s.foundName ?? "",
        ...s.foundYear === void 0 ? {} : { foundYear: s.foundYear }
      };
    case "ambiguous":
      return { status: "ambiguous", candidates: s.candidates ?? [] };
    case "not_found":
      return s.reason === void 0 ? { status: "not_found" } : { status: "not_found", reason: s.reason };
    case "unchecked":
      return s.waitUntil === void 0 ? { status: "unchecked" } : { status: "unchecked", waitUntil: s.waitUntil };
  }
}
function citationRecord2(c, d) {
  if (c.value.kind === "other") return { kind: "other", citation: c };
  if (d === void 0) return null;
  if (c.value.kind === "short") return { kind: "short", key: d.key, citation: c };
  return { kind: "full", key: d.key, citation: c, result: resultOf(d.status) };
}
function citationRecords(done2) {
  const byRange = new Map(done2.draft.citations.map((d) => [rangeKey(d.start, d.end), d]));
  const out = [];
  for (const c of done2.extraction.citations) {
    const rec = citationRecord2(c, byRange.get(rangeKey(c.start, c.end)));
    if (rec === null) return null;
    out.push(rec);
  }
  return out;
}
function quoteRecords(done2) {
  const byRange = new Map(done2.draft.quotes.map((d) => [rangeKey(d.start, d.end), d]));
  const out = [];
  for (const q of done2.extraction.quotes) {
    const d = byRange.get(rangeKey(q.start, q.end));
    if (d === void 0) return null;
    out.push({ key: d.key, quote: q, result: d.result });
  }
  return out;
}
function buildOverrides(done2, citations, quotes) {
  const byKey = /* @__PURE__ */ new Map();
  for (const c of done2.draft.citations) {
    if (c.override !== void 0) byKey.set(c.key, asOverride(c.key, c.override));
  }
  for (const q of done2.draft.quotes) {
    if (q.override !== void 0) byKey.set(q.key, asOverride(q.key, q.override));
  }
  const order = issueOrder(
    citations.map((r) => r.citation.start),
    quotes.map((r) => r.quote.start)
  );
  const out = [];
  for (const { quote, index } of order) {
    const rec = quote ? quotes[index] : citations[index];
    const key = rec === void 0 || !("key" in rec) ? void 0 : rec.key;
    const o = key === void 0 ? void 0 : byKey.get(key);
    if (o !== void 0) out.push(o);
  }
  return out;
}
function build(done2) {
  const citations = citationRecords(done2);
  const quotes = quoteRecords(done2);
  if (citations === null || quotes === null) return err(mismatch());
  const spans = done2.draft.spans.map((s) => ({
    start: s.start,
    end: s.end,
    provenance: s.provenance
  }));
  return ok({
    text: done2.draft.text,
    spans,
    runs: done2.draft.runs,
    citations,
    quotes,
    overrides: buildOverrides(done2, citations, quotes),
    keyCounter: done2.draft.keyCounter
  });
}
var mismatch, asOverride;
var init_build = __esm({
  "packages/engine/src/codes/build.ts"() {
    "use strict";
    init_anchor_keys();
    init_result();
    init_check_types();
    mismatch = () => fault(0, "extractor_mismatch");
    asOverride = (key, o) => ({
      key,
      reason: o.reason,
      timestamp: o.timestamp
    });
  }
});

// packages/engine/src/codes/check-doc.ts
function checkSpanCoverage(d) {
  const r = checkCoverage(d.text.length, toSpans(d));
  if (r.ok) return void 0;
  const { offset, violation: violation2 } = r.error;
  const at = d.spans.find((s) => violation2 === "gap" ? s.start > offset : s.start === offset);
  return fault(violation2 === "coverage" ? 0 : at?.index ?? 0, "coverage");
}
function checkCanonical(d) {
  for (let i = 1; i < d.spans.length; i++) {
    const a = d.spans[i - 1];
    const b = d.spans[i];
    if (a !== void 0 && b !== void 0 && isMergeable(a.provenance, b.provenance)) {
      return fault(b.index, "canonical");
    }
  }
  return void 0;
}
function checkSpanProvenance(d) {
  for (const s of d.spans) {
    if (!checkProvenance(s.provenance).ok) return fault(s.index, "provenance");
  }
  return void 0;
}
function checkSurrogates2(d) {
  return firstUnpairedSurrogate(d.text) === null ? void 0 : fault(0, "surrogate");
}
function checkRunTable(d) {
  for (let i = 0; i < d.runs.length; i++) {
    const r = d.runs[i];
    const prev = d.runs[i - 1];
    if (r === void 0) continue;
    if (prev !== void 0 && prev.runId >= r.runId) return fault(0, "run_invariant");
    if (r.originalLength < 1) return fault(0, "run_invariant");
  }
  return void 0;
}
function checkRunInvariant(d) {
  const table = checkRunTable(d);
  if (table !== void 0) return table;
  const byId = new Map(d.runs.map((r) => [r.runId, r]));
  for (const s of d.spans) {
    const { runId: runId2, origin } = s.provenance;
    if (runId2 === void 0) continue;
    const run = byId.get(runId2);
    const expected = run?.relabelled === true ? "AI>HUM" : "AI";
    if (run === void 0 || origin !== expected) return fault(s.index, "run_invariant");
  }
  return void 0;
}
var toSpans;
var init_check_doc = __esm({
  "packages/engine/src/codes/check-doc.ts"() {
    "use strict";
    init_spans();
    init_validate();
    init_check_types();
    toSpans = (d) => d.spans.map((s) => ({ start: s.start, end: s.end, provenance: s.provenance }));
  }
});

// packages/engine/src/codes/check-citations.ts
function fullPayloadOk(s) {
  switch (s.status) {
    case "verified":
      return isNonEmpty(s.clusterId);
    case "wrong_case":
      return isNonEmpty(s.clusterId) && isNonEmpty(s.foundName) && (s.foundYear === void 0 || s.foundYear >= 1e3 && s.foundYear <= 9999);
    case "ambiguous": {
      const c = s.candidates;
      return c !== void 0 && c.length >= 2 && c.length === s.count && c.every((x) => x !== "") && new Set(c).size === c.length;
    }
    case "not_found":
      return s.reason === void 0 || s.reason !== "";
    case "unchecked":
      return true;
  }
}
function checkFullPayloads(i) {
  for (const c of i.draft.citations) {
    const v = valueOf(i, c);
    if (v === void 0 || v.kind === "short" || v.kind === "other") continue;
    if (!fullPayloadOk(c.status)) return fault(c.index, "bad_field");
  }
  return void 0;
}
function checkQuotePrefix(i) {
  for (const q of i.draft.quotes) {
    if (q.result.status === "mismatch" && q.result.prefixLength >= q.end - q.start) {
      return fault(q.index, "quote_prefix");
    }
  }
  return void 0;
}
function derivedStatus(i, targetStart) {
  if (targetStart === null) return { status: "unchecked" };
  return i.draft.citations.find((c) => c.start === targetStart)?.status;
}
function checkShortForms(i) {
  for (const c of i.draft.citations) {
    const v = valueOf(i, c);
    if (v?.kind !== "short") continue;
    const want = derivedStatus(i, v.targetStart);
    if (want === void 0) continue;
    const countOk = want.status !== "ambiguous" || c.status.status === "ambiguous" && c.status.count === want.count;
    if (c.status.status !== want.status || !countOk || hasPayload(c.status)) {
      return fault(c.index, "short_form_code");
    }
  }
  return void 0;
}
function checkUnverifiable(i) {
  for (const c of i.draft.citations) {
    const v = valueOf(i, c);
    const passing = c.status.status === "verified" || c.status.status === "wrong_case";
    if (passing && v?.kind === "database" && v.lexisCourtListed === false) {
      return fault(c.index, "unverifiable_status");
    }
  }
  return void 0;
}
function checkRefCodes(i) {
  const found = [];
  for (const c of i.draft.citations) {
    if (valueOf(i, c)?.kind === "other") found.push(fault(c.index, "ref_code"));
  }
  for (const r of i.draft.refs) {
    if (r.override !== void 0) found.push(fault(r.override.index, "ref_code"));
  }
  return found.sort((a, b) => a.index - b.index)[0];
}
function citationIsIssue2(i, c) {
  const v = valueOf(i, c);
  if (v === void 0 || v.kind === "other") return void 0;
  if (v.kind === "short") return v.targetStart === null;
  return c.status.status !== "verified";
}
function checkOverrideTargets(i) {
  const found = [];
  for (const c of i.draft.citations) {
    if (c.override !== void 0 && citationIsIssue2(i, c) === false) {
      found.push(fault(c.override.index, "override_target"));
    }
  }
  for (const q of i.draft.quotes) {
    if (q.override !== void 0 && q.result.status === "match") {
      found.push(fault(q.override.index, "override_target"));
    }
  }
  return found.sort((a, b) => a.index - b.index)[0];
}
function checkIssueKeys(i) {
  const keyed = [...i.draft.citations, ...i.draft.quotes].sort((a, b) => a.index - b.index);
  const seen = /* @__PURE__ */ new Set();
  for (const k of keyed) {
    const n = Number(k.key.slice(1));
    if (n >= i.draft.keyCounter || seen.has(k.key)) return fault(k.index, "issue_key");
    seen.add(k.key);
  }
  return void 0;
}
var isNonEmpty, hasPayload, valueOf;
var init_check_citations = __esm({
  "packages/engine/src/codes/check-citations.ts"() {
    "use strict";
    init_check_types();
    isNonEmpty = (s) => s !== void 0 && s !== "";
    hasPayload = (s) => "clusterId" in s || "foundName" in s || "foundYear" in s || "candidates" in s || "reason" in s || "waitUntil" in s;
    valueOf = (i, c) => i.byRange.get(rangeKey(c.start, c.end))?.value;
  }
});

// packages/engine/src/codes/check-extractor.ts
function compareFamily(codes, expected) {
  const want = new Set(expected.map((e) => rangeKey(e.start, e.end)));
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const c of codes) {
    const k = rangeKey(c.start, c.end);
    if (!want.has(k) || seen.has(k)) out.push(fault(c.index, "extractor_mismatch"));
    seen.add(k);
  }
  for (const k of want) if (!seen.has(k)) out.push(fault(0, "extractor_mismatch"));
  return out;
}
function checkExtractor(i) {
  const { citations, quotes } = i.extraction;
  const found = [
    ...compareFamily(
      i.draft.citations,
      citations.filter((c) => c.value.kind !== "other")
    ),
    ...compareFamily(i.draft.quotes, quotes),
    ...compareFamily(
      i.draft.refs,
      citations.filter((c) => c.value.kind === "other")
    )
  ];
  return found.sort((a, b) => a.index - b.index)[0];
}
var init_check_extractor = __esm({
  "packages/engine/src/codes/check-extractor.ts"() {
    "use strict";
    init_check_types();
  }
});

// packages/engine/src/codes/check.ts
function check(draft) {
  const extraction = extract(draft.text);
  const byRange = new Map(extraction.citations.map((c) => [rangeKey(c.start, c.end), c]));
  const input = { draft, extraction, byRange };
  for (const rule of RULES) {
    const f = rule(input);
    if (f !== void 0) return err(f);
  }
  return ok({ draft, extraction });
}
var RULES;
var init_check = __esm({
  "packages/engine/src/codes/check.ts"() {
    "use strict";
    init_extract();
    init_result();
    init_check_doc();
    init_check_citations();
    init_check_extractor();
    init_check_types();
    RULES = [
      (i) => checkSpanCoverage(i.draft),
      (i) => checkCanonical(i.draft),
      (i) => checkSpanProvenance(i.draft),
      (i) => checkSurrogates2(i.draft),
      checkFullPayloads,
      checkQuotePrefix,
      checkShortForms,
      checkUnverifiable,
      checkRefCodes,
      (i) => checkRunInvariant(i.draft),
      checkOverrideTargets,
      checkIssueKeys,
      checkExtractor
    ];
  }
});

// packages/engine/src/declaration.ts
function checkToolName(raw) {
  const name = raw.trim();
  if (name.length < TOOL_NAME_MIN) return err("too_short");
  if (name.length > TOOL_NAME_MAX) return err("too_long");
  if (CONTROL.test(name)) return err("control_character");
  if (firstUnpairedSurrogate(name) !== null) return err("unpaired_surrogate");
  return ok(name);
}
function isSubject(value) {
  return value === "pasted_text" || value === "this_filing";
}
function isDeclaration(value) {
  if (typeof value !== "object" || value === null) return false;
  const v = value;
  if (!isSubject(v.subject)) return false;
  if (v.choice === "none") return v.toolName === void 0;
  if (v.choice !== "declared_ai" || typeof v.toolName !== "string") return false;
  const checked2 = checkToolName(v.toolName);
  return checked2.ok && checked2.value === v.toolName;
}
var TOOL_NAME_MIN, TOOL_NAME_MAX, CONTROL, NON_SPACE;
var init_declaration = __esm({
  "packages/engine/src/declaration.ts"() {
    "use strict";
    init_result();
    init_validate();
    TOOL_NAME_MIN = 2;
    TOOL_NAME_MAX = 100;
    CONTROL = /[\p{Cc}\u2028\u2029]/u;
    NON_SPACE = new RegExp("\\P{White_Space}", "u");
  }
});

// packages/engine/src/codes/doc-declaration.ts
function encodeDeclaration(declaration) {
  const values = declaration.choice === "declared_ai" ? [declaration.subject, declaration.choice, declaration.toolName] : [declaration.subject, declaration.choice];
  return { key: DECLARATION_KEY, values };
}
function decodeDeclaration(values) {
  const [subject, choice, toolName] = values;
  if (values.length < 2 || values.length > 3) return void 0;
  const candidate = toolName === void 0 ? { subject, choice } : { subject, choice, toolName };
  return isDeclaration(candidate) ? candidate : void 0;
}
var DECLARATION_KEY;
var init_doc_declaration = __esm({
  "packages/engine/src/codes/doc-declaration.ts"() {
    "use strict";
    init_declaration();
    DECLARATION_KEY = "d";
  }
});

// packages/engine/src/codes/decode-fields.ts
function decodeInt(s) {
  if (!INT_RE.test(s)) return void 0;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : void 0;
}
function valuesOf(code, key) {
  return code.fields.find((f) => f.key === key)?.values;
}
function single(code, key, parse2) {
  const values = valuesOf(code, key);
  if (values === void 0) return ok(void 0);
  const only = values.length === 1 ? values[0] : void 0;
  const parsed = only === void 0 ? void 0 : parse2(only);
  return parsed === void 0 ? err(BAD) : ok(parsed);
}
function readList(code, key) {
  const values = valuesOf(code, key);
  return values === void 0 || values.length === 0 ? ok(void 0) : ok(values);
}
function readVersion(code) {
  return single(code, "v", (s) => s === "1" ? 1 : void 0);
}
function readDeclaration(code) {
  const values = valuesOf(code, DECLARATION_KEY);
  if (values === void 0) return ok(void 0);
  const declaration = decodeDeclaration(values);
  return declaration === void 0 ? err(BAD) : ok(declaration);
}
function decodeRun(values) {
  const [runId2, orig, edited, flag] = values;
  if (values.length !== 4 || runId2 === void 0) return void 0;
  const originalLength = decodeInt(orig ?? "");
  const editedCount = decodeInt(edited ?? "");
  if (originalLength === void 0 || editedCount === void 0) return void 0;
  if (flag !== "0" && flag !== "1") return void 0;
  return { runId: runId2, originalLength, editedCount, relabelled: flag === "1" };
}
function readRuns(code) {
  const runs = [];
  for (const f of code.fields) {
    if (f.key !== "r") continue;
    const run = decodeRun(f.values);
    if (run === void 0) return void 0;
    runs.push(run);
  }
  return runs;
}
var BAD, INT_RE, KEY_RE, readText, readInt2, readTimestamp, readKey;
var init_decode_fields = __esm({
  "packages/engine/src/codes/decode-fields.ts"() {
    "use strict";
    init_result();
    init_validate();
    init_doc_declaration();
    BAD = "bad";
    INT_RE = /^(0|[1-9][0-9]*)$/;
    KEY_RE = /^k(0|[1-9][0-9]*)$/;
    readText = (code, key) => single(code, key, (s) => s);
    readInt2 = (code, key) => single(code, key, decodeInt);
    readTimestamp = (code, key) => single(code, key, (s) => isTimestamp(s) ? s : void 0);
    readKey = (code, key) => single(code, key, (s) => KEY_RE.test(s) ? s : void 0);
  }
});

// packages/engine/src/codes/decode-header.ts
function decodeHeader(code) {
  const v = readVersion(code);
  const n = readInt2(code, "n");
  const runs = readRuns(code);
  const d = readDeclaration(code);
  if (!v.ok || v.value === void 0 || !n.ok || n.value === void 0 || runs === void 0) {
    return err(bad(code));
  }
  if (!d.ok) return err(bad(code));
  const header = { keyCounter: n.value, runs };
  return ok(d.value === void 0 ? header : { ...header, declaration: d.value });
}
var bad;
var init_decode_header = __esm({
  "packages/engine/src/codes/decode-header.ts"() {
    "use strict";
    init_result();
    init_decode_fields();
    bad = (code) => ({ index: code.index, rule: "bad_field" });
  }
});

// packages/engine/src/codes/syntax.ts
function isCodeName(s) {
  return NAME_SET.has(s);
}
function escapeWith(s, set) {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s.charAt(i);
    out += set.has(ch) ? ESCAPE + ch : ch;
  }
  return out;
}
function escapeText(s) {
  return escapeWith(s, ESCAPED.text);
}
function escapeRetained(s) {
  return escapeWith(s, ESCAPED.retained);
}
function escapePayload(s) {
  return escapeWith(s, ESCAPED.payload);
}
function unescape(s, context) {
  const set = ESCAPED[context];
  let out = "";
  let i = 0;
  while (i < s.length) {
    const ch = s.charAt(i);
    if (ch !== ESCAPE) {
      out += ch;
      i += 1;
      continue;
    }
    const next = i + 1 < s.length ? s.charAt(i + 1) : "";
    if (next === "" || !set.has(next)) return err({ kind: "dangling_escape", index: i });
    out += next;
    i += 2;
  }
  return ok(out);
}
function fieldString(f) {
  return `${f.key}=${f.values.map(escapePayload).join(",")}`;
}
function codeString(name, retained, fields, mode) {
  const head = retained === null ? name : `${name}:${escapeRetained(retained)}`;
  const section = mode === "full" && fields.length > 0 ? `{${fields.map(fieldString).join(";")}}` : "";
  return `[${head}${section}]`;
}
var ESCAPE, CODE_NAMES, NAME_SET, ESCAPED;
var init_syntax = __esm({
  "packages/engine/src/codes/syntax.ts"() {
    "use strict";
    init_result();
    ESCAPE = "\\";
    CODE_NAMES = {
      hum: "HUM",
      pst: "PST",
      ai: "AI",
      aiHum: "AI>HUM",
      citVerified: "CIT \u2713",
      citNotFound: "CIT \u2718",
      citWrongCase: "CIT \u2260",
      citAmbiguous: "CIT ?",
      citUnchecked: "CIT \u2026",
      quoVerified: "QUO \u2713",
      quoMismatch: "QUO \u2718",
      quoUnchecked: "QUO \u2026",
      ref: "REF",
      closeCit: "/CIT",
      closeQuo: "/QUO",
      closeRef: "/REF",
      ovr: "OVR",
      doc: "DOC"
    };
    NAME_SET = new Set(Object.values(CODE_NAMES));
    ESCAPED = {
      text: /* @__PURE__ */ new Set(["\\", "[", "]"]),
      retained: /* @__PURE__ */ new Set(["\\", "[", "]", "{"]),
      payload: /* @__PURE__ */ new Set(["\\", "[", "]", "{", "}", ";", "=", ","])
    };
  }
});

// packages/engine/src/codes/decode.ts
function opt(key, r) {
  if (!r.ok) return err(BAD);
  const out = {};
  if (r.value !== void 0) out[key] = r.value;
  return ok(out);
}
function originOf(name) {
  const map = {
    [CODE_NAMES.hum]: "HUM",
    [CODE_NAMES.pst]: "PST",
    [CODE_NAMES.ai]: "AI",
    [CODE_NAMES.aiHum]: "AI>HUM"
  };
  return map[name];
}
function decodeProvenance(code, origin) {
  const t = readTimestamp(code, "t");
  if (!t.ok || t.value === void 0) return err(bad2(code));
  const base = { origin, timestamp: t.value };
  return ok(code.retained === null ? base : { ...base, runId: code.retained });
}
function decodeStatus(code) {
  switch (code.name) {
    case CODE_NAMES.citVerified: {
      const r = opt("clusterId", readText(code, "cl"));
      return r.ok ? ok({ status: "verified", ...r.value }) : err(BAD);
    }
    case CODE_NAMES.citAmbiguous: {
      const count = decodeInt(code.retained ?? "");
      const r = opt("candidates", readList(code, "cs"));
      return r.ok && count !== void 0 ? ok({ status: "ambiguous", count, ...r.value }) : err(BAD);
    }
    case CODE_NAMES.citNotFound: {
      const r = opt("reason", readText(code, "why"));
      return r.ok ? ok({ status: "not_found", ...r.value }) : err(BAD);
    }
    case CODE_NAMES.citWrongCase: {
      const cl = opt("clusterId", readText(code, "cl"));
      const nm = opt("foundName", readText(code, "nm"));
      const yr = opt("foundYear", readInt2(code, "yr"));
      return cl.ok && nm.ok && yr.ok ? ok({ status: "wrong_case", ...cl.value, ...nm.value, ...yr.value }) : err(BAD);
    }
    case CODE_NAMES.citUnchecked: {
      const r = opt("waitUntil", readTimestamp(code, "wu"));
      return r.ok ? ok({ status: "unchecked", ...r.value }) : err(BAD);
    }
    default:
      return err(BAD);
  }
}
function decodeQuoteResult(code) {
  if (code.name === CODE_NAMES.quoVerified) return ok({ status: "match" });
  if (code.name === CODE_NAMES.quoUnchecked) return ok({ status: "unchecked" });
  const p = readInt2(code, "p");
  return p.ok && p.value !== void 0 ? ok({ status: "mismatch", prefixLength: p.value }) : err(BAD);
}
function familyOf(name) {
  if (name.startsWith("CIT ")) return "cit";
  if (name.startsWith("QUO ")) return "quo";
  return name === CODE_NAMES.ref ? "ref" : void 0;
}
function closeFamily(name) {
  const map = {
    [CODE_NAMES.closeCit]: "cit",
    [CODE_NAMES.closeQuo]: "quo",
    [CODE_NAMES.closeRef]: "ref"
  };
  return map[name];
}
function decodePayload(code, family) {
  if (family === "ref") return ok({ family });
  const r = family === "cit" ? decodeStatus(code) : decodeQuoteResult(code);
  if (!r.ok) return err(bad2(code));
  return ok(
    family === "cit" ? { family, status: r.value } : { family, result: r.value }
  );
}
function decodeOverride(code) {
  const t = readTimestamp(code, "t");
  if (!t.ok || t.value === void 0 || code.retained === null) return err(bad2(code));
  return ok({ index: code.index, reason: code.retained, timestamp: t.value });
}
function open(out, code, family) {
  const payload = decodePayload(code, family);
  const key = readKey(code, "k");
  if (!payload.ok) return payload.error;
  if (family !== "ref" && (!key.ok || key.value === void 0)) return bad2(code);
  const list = family === "cit" ? out.citations : family === "quo" ? out.quotes : out.refs;
  const pending = {
    family,
    index: code.index,
    start: code.offset,
    slot: list.length,
    key: key.ok ? key.value ?? "" : "",
    payload: payload.value
  };
  list.push(void 0);
  out.stacks[family].push(pending);
  out.prev = pending;
  return void 0;
}
function close(out, code, family) {
  const p = out.stacks[family].pop();
  if (p === void 0) return fault2(code.index, "unbalanced_close");
  const base = { index: p.index, start: p.start, end: code.offset };
  const ovr = p.override === void 0 ? {} : { override: p.override };
  const pl = p.payload;
  if (pl.family === "cit") {
    out.citations[p.slot] = { ...base, key: p.key, status: pl.status, ...ovr };
  } else if (pl.family === "quo") {
    out.quotes[p.slot] = { ...base, key: p.key, result: pl.result, ...ovr };
  } else {
    out.refs[p.slot] = { ...base, ...ovr };
  }
  return void 0;
}
function attachOverride(out, code) {
  const target = out.prev;
  if (target === void 0 || target.override !== void 0) {
    return fault2(code.index, "ovr_position");
  }
  const o = decodeOverride(code);
  if (!o.ok) return o.error;
  target.override = o.value;
  return void 0;
}
function spanStart(out, code, origin) {
  const prov = decodeProvenance(code, origin);
  if (!prov.ok) return prov.error;
  out.spans.push({
    index: code.index,
    start: code.offset,
    end: code.offset,
    provenance: prov.value
  });
  return void 0;
}
function handleCode(out, code) {
  const wasPrev = out.prev;
  out.prev = void 0;
  if (code.name === CODE_NAMES.ovr) {
    out.prev = wasPrev;
    const f = attachOverride(out, code);
    out.prev = void 0;
    return f;
  }
  if (code.name === CODE_NAMES.doc) return fault2(code.index, "misplaced_doc");
  const origin = originOf(code.name);
  if (origin !== void 0) return spanStart(out, code, origin);
  const opens = familyOf(code.name);
  if (opens !== void 0) return open(out, code, opens);
  const closes = closeFamily(code.name);
  return closes === void 0 ? fault2(code.index, "unknown_code") : close(out, code, closes);
}
function closeSpans(spans, textLength) {
  return spans.map((s, i) => ({ ...s, end: spans[i + 1]?.start ?? textLength }));
}
function done(xs) {
  return xs.filter((x) => x !== void 0);
}
function decodeTokens(tokens) {
  const first = tokens[0];
  if (first === void 0 || first.kind !== "code" || first.name !== CODE_NAMES.doc) {
    return err(fault2(0, "missing_doc"));
  }
  const header = decodeHeader(first);
  if (!header.ok) return header;
  const out = {
    spans: [],
    citations: [],
    quotes: [],
    refs: [],
    stacks: { cit: [], quo: [], ref: [] },
    prev: void 0
  };
  let text = "";
  let lowest;
  for (const t of tokens.slice(1)) {
    if (t.kind === "text") {
      text += t.text;
      out.prev = void 0;
      continue;
    }
    const f = handleCode(out, t);
    if (f !== void 0 && (lowest === void 0 || f.index < lowest.index)) lowest = f;
  }
  for (const p of [...out.stacks.cit, ...out.stacks.quo, ...out.stacks.ref]) {
    if (lowest === void 0 || p.index < lowest.index) lowest = fault2(p.index, "unclosed_open");
  }
  if (lowest !== void 0) return err(lowest);
  return ok({
    text,
    keyCounter: header.value.keyCounter,
    runs: header.value.runs,
    ...header.value.declaration === void 0 ? {} : { declaration: header.value.declaration },
    spans: closeSpans(out.spans, text.length),
    citations: done(out.citations),
    quotes: done(out.quotes),
    refs: done(out.refs)
  });
}
var fault2, bad2;
var init_decode = __esm({
  "packages/engine/src/codes/decode.ts"() {
    "use strict";
    init_result();
    init_decode_fields();
    init_decode_fields();
    init_decode_header();
    init_syntax();
    fault2 = (index, rule) => ({ index, rule });
    bad2 = (code) => fault2(code.index, "bad_field");
  }
});

// packages/engine/src/codes/lex.ts
function splitTop(s, sep, base) {
  const out = [];
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charAt(i);
    if (c === ESCAPE) i += 1;
    else if (c === sep) {
      out.push({ text: s.slice(start, i), start: base + start });
      start = i + 1;
    }
  }
  out.push({ text: s.slice(start), start: base + start });
  return out;
}
function closingBrace(s) {
  for (let i = 0; i < s.length; i++) {
    const c = s.charAt(i);
    if (c === ESCAPE) i += 1;
    else if (c === "}") return i;
    else if (c === "{") return -1;
  }
  return -1;
}
function unescapeAt(s, ctx, base, sink) {
  const r = unescape(s, ctx);
  if (r.ok) return r.value;
  sink({ index: base + r.error.index, rule: "dangling_escape" });
  return s;
}
function parseField(p, sink) {
  const sides = splitTop(p.text, "=", p.start);
  const key = sides[0]?.text ?? "";
  const valuePart = sides[1];
  if (sides.length !== 2 || valuePart === void 0 || key === "") return void 0;
  const values = splitTop(valuePart.text, ",", valuePart.start).map(
    (v) => unescapeAt(v.text, "payload", v.start, sink)
  );
  return { key, values };
}
function parseFields(rest, base, sink) {
  const end = closingBrace(rest);
  if (end < 0 || end !== rest.length - 1 || end === 0) return void 0;
  const fields = [];
  for (const piece of splitTop(rest.slice(0, end), ";", base)) {
    const f = parseField(piece, sink);
    if (f === void 0) return void 0;
    fields.push(f);
  }
  return fields;
}
function fieldsMatch(schema, fields) {
  const seen = /* @__PURE__ */ new Set();
  for (const f of fields) {
    const known = schema.required.includes(f.key) || schema.optional.includes(f.key) || f.key === schema.repeat;
    if (!known || f.key !== schema.repeat && seen.has(f.key)) return false;
    seen.add(f.key);
  }
  return schema.required.every((k) => seen.has(k));
}
function splitBody(body) {
  const sep = body.search(/[:{]/);
  const nameEnd = sep < 0 ? body.length : sep;
  let pos = nameEnd;
  let retained = null;
  if (body.charAt(pos) === ":") {
    let k = pos + 1;
    while (k < body.length && body.charAt(k) !== "{") k += body.charAt(k) === ESCAPE ? 2 : 1;
    k = Math.min(k, body.length);
    retained = body.slice(pos + 1, k);
    pos = k;
  }
  const retainedStart = nameEnd + 1;
  const fieldsRest = body.charAt(pos) === "{" ? body.slice(pos + 1) : null;
  return {
    name: body.slice(0, nameEnd),
    retained,
    fieldsRest,
    retainedStart,
    fieldsStart: pos + 1
  };
}
function parseCode(body, index, offset, sink) {
  const b = splitBody(body);
  if (!isCodeName(b.name)) {
    sink({ index, rule: "unknown_code" });
    return void 0;
  }
  const schema = SCHEMAS[b.name];
  const bodyBase = index + 1;
  const retained = b.retained === null ? null : unescapeAt(b.retained, "retained", bodyBase + b.retainedStart, sink);
  const fields = b.fieldsRest === null ? [] : parseFields(b.fieldsRest, bodyBase + b.fieldsStart, sink);
  const shapeOk = b.retained !== null === schema.retained && fields !== void 0 && fieldsMatch(schema, fields);
  if (!shapeOk) sink({ index, rule: "bad_field" });
  return { kind: "code", name: b.name, retained, fields: fields ?? [], index, offset };
}
function scanCode(input, start) {
  let j = start + 1;
  while (j < input.length) {
    const c = input.charAt(j);
    if (c === ESCAPE) {
      if (j + 1 >= input.length) return { closed: false, end: input.length, dangling: j };
      j += 2;
    } else if (c === "]") return { closed: true, end: j, dangling: -1 };
    else if (c === "[") return { closed: false, end: j, dangling: -1 };
    else j += 1;
  }
  return { closed: false, end: input.length, dangling: -1 };
}
function trackBalance(code, stacks, sink) {
  const open2 = OPENS[code.name];
  if (open2 !== void 0) stacks[open2].push(code.index);
  const close2 = CLOSES[code.name];
  if (close2 !== void 0 && stacks[close2].pop() === void 0) {
    sink({ index: code.index, rule: "unbalanced_close" });
  }
}
function flush(st, a, b) {
  if (b <= a) return;
  const sink = (f) => void st.faults.push(f);
  const text = unescapeAt(st.input.slice(a, b), "text", a, sink);
  if (text !== "") st.tokens.push({ kind: "text", text });
  st.offset += text.length;
}
function lexOne(st, i) {
  const sink = (f) => void st.faults.push(f);
  const scan = scanCode(st.input, i);
  if (!scan.closed) sink({ index: i, rule: "unterminated_code" });
  if (scan.dangling >= 0) sink({ index: scan.dangling, rule: "dangling_escape" });
  const body = st.input.slice(i + 1, scan.end);
  const code = scan.closed ? parseCode(body, i, st.offset, sink) : void 0;
  if (code !== void 0) {
    st.tokens.push(code);
    trackBalance(code, st.stacks, sink);
  }
  return scan.closed ? scan.end + 1 : scan.end;
}
function lexAll(input) {
  const st = {
    input,
    tokens: [],
    faults: [],
    stacks: { cit: [], quo: [], ref: [] },
    offset: 0
  };
  let i = 0;
  let textStart = 0;
  while (i < input.length) {
    const c = input.charAt(i);
    if (c === ESCAPE) i += 2;
    else if (c === "[") {
      flush(st, textStart, i);
      i = lexOne(st, i);
      textStart = i;
    } else {
      if (c === "]") st.faults.push({ index: i, rule: "unbalanced_close" });
      i += 1;
    }
  }
  flush(st, textStart, input.length);
  return finish(st.tokens, st.stacks, st.faults);
}
function finish(tokens, stacks, faults) {
  for (const family of ["cit", "quo", "ref"]) {
    for (const index of stacks[family]) faults.push({ index, rule: "unclosed_open" });
  }
  const codes = tokens.filter((t) => t.kind === "code");
  const first = codes[0];
  if (first === void 0 || first.index !== 0 || first.name !== CODE_NAMES.doc) {
    faults.push({ index: 0, rule: "missing_doc" });
  }
  for (const c of codes) {
    if (c.name === CODE_NAMES.doc && c.index !== 0)
      faults.push({ index: c.index, rule: "misplaced_doc" });
  }
  let lowest;
  for (const f of faults) {
    const better = lowest === void 0 || f.index < lowest.index || f.index === lowest.index && f.rule === "missing_doc";
    if (better) lowest = f;
  }
  return { tokens, fault: lowest };
}
var NONE, T, RUN_T, K, SCHEMAS, OPENS, CLOSES;
var init_lex2 = __esm({
  "packages/engine/src/codes/lex.ts"() {
    "use strict";
    init_result();
    init_syntax();
    NONE = { retained: false, required: [], optional: [] };
    T = { retained: false, required: ["t"], optional: [] };
    RUN_T = { retained: true, required: ["t"], optional: [] };
    K = { retained: false, required: ["k"], optional: [] };
    SCHEMAS = {
      [CODE_NAMES.doc]: { retained: false, required: ["v", "n"], optional: ["d"], repeat: "r" },
      [CODE_NAMES.hum]: T,
      [CODE_NAMES.pst]: T,
      [CODE_NAMES.ai]: RUN_T,
      [CODE_NAMES.aiHum]: RUN_T,
      [CODE_NAMES.citVerified]: { retained: false, required: ["k"], optional: ["cl"] },
      [CODE_NAMES.citNotFound]: { retained: false, required: ["k"], optional: ["why"] },
      [CODE_NAMES.citWrongCase]: {
        retained: false,
        required: ["k"],
        optional: ["cl", "nm", "yr"]
      },
      [CODE_NAMES.citAmbiguous]: { retained: true, required: ["k"], optional: ["cs"] },
      [CODE_NAMES.citUnchecked]: { retained: false, required: ["k"], optional: ["wu"] },
      [CODE_NAMES.quoVerified]: K,
      [CODE_NAMES.quoMismatch]: { retained: false, required: ["k", "p"], optional: [] },
      [CODE_NAMES.quoUnchecked]: K,
      [CODE_NAMES.ref]: NONE,
      [CODE_NAMES.closeCit]: NONE,
      [CODE_NAMES.closeQuo]: NONE,
      [CODE_NAMES.closeRef]: NONE,
      [CODE_NAMES.ovr]: RUN_T
    };
    OPENS = {
      [CODE_NAMES.citVerified]: "cit",
      [CODE_NAMES.citNotFound]: "cit",
      [CODE_NAMES.citWrongCase]: "cit",
      [CODE_NAMES.citAmbiguous]: "cit",
      [CODE_NAMES.citUnchecked]: "cit",
      [CODE_NAMES.quoVerified]: "quo",
      [CODE_NAMES.quoMismatch]: "quo",
      [CODE_NAMES.quoUnchecked]: "quo",
      [CODE_NAMES.ref]: "ref"
    };
    CLOSES = {
      [CODE_NAMES.closeCit]: "cit",
      [CODE_NAMES.closeQuo]: "quo",
      [CODE_NAMES.closeRef]: "ref"
    };
  }
});

// packages/engine/src/codes/render.ts
function docCode(doc, declaration, mode) {
  const runs = doc.runs.map(
    (r) => field("r", r.runId, String(r.originalLength), String(r.editedCount), r.relabelled ? "1" : "0")
  );
  const d = declaration === null ? [] : [encodeDeclaration(declaration)];
  const fields = [field("v", "1"), field("n", String(doc.keyCounter)), ...d, ...runs];
  return codeString(CODE_NAMES.doc, null, fields, mode);
}
function spanCode(span, mode) {
  const { origin, runId: runId2, timestamp } = span.provenance;
  const fields = [field("t", timestamp)];
  switch (origin) {
    case "HUM":
      return codeString(CODE_NAMES.hum, null, fields, mode);
    case "PST":
      return codeString(CODE_NAMES.pst, null, fields, mode);
    case "AI":
      return codeString(CODE_NAMES.ai, runId2 ?? "", fields, mode);
    case "AI>HUM":
      return codeString(CODE_NAMES.aiHum, runId2 ?? "", fields, mode);
  }
}
function wrongCaseFields(k, result) {
  return [
    k,
    field("cl", result.clusterId),
    field("nm", result.foundName),
    ...result.foundYear === void 0 ? [] : [field("yr", String(result.foundYear))]
  ];
}
function citationOpening(rec, result) {
  const full = rec.kind === "full";
  const key = rec.kind === "other" ? "" : rec.key;
  const k = field("k", key);
  switch (result.status) {
    case "verified":
      return {
        name: CODE_NAMES.citVerified,
        retained: null,
        fields: full ? [k, field("cl", result.clusterId)] : [k]
      };
    case "ambiguous":
      return {
        name: CODE_NAMES.citAmbiguous,
        retained: String(result.candidates.length),
        fields: full ? [k, field("cs", ...result.candidates)] : [k]
      };
    case "wrong_case":
      return {
        name: CODE_NAMES.citWrongCase,
        retained: null,
        fields: full ? wrongCaseFields(k, result) : [k]
      };
    case "not_found":
      return {
        name: CODE_NAMES.citNotFound,
        retained: null,
        fields: full && result.reason !== void 0 ? [k, field("why", result.reason)] : [k]
      };
    case "unchecked":
      return {
        name: CODE_NAMES.citUnchecked,
        retained: null,
        fields: full && result.waitUntil !== void 0 ? [k, field("wu", result.waitUntil)] : [k]
      };
  }
}
function quoteOpening(q) {
  const k = field("k", q.key);
  switch (q.result.status) {
    case "match":
      return { name: CODE_NAMES.quoVerified, retained: null, fields: [k] };
    case "mismatch":
      return {
        name: CODE_NAMES.quoMismatch,
        retained: null,
        fields: [k, field("p", String(q.result.prefixLength))]
      };
    case "unchecked":
      return { name: CODE_NAMES.quoUnchecked, retained: null, fields: [k] };
  }
}
function ovrCode(o, mode) {
  return codeString(CODE_NAMES.ovr, o.reason, [field("t", o.timestamp)], mode);
}
function bare(name, mode) {
  return codeString(name, null, [], mode);
}
function citationEvents(doc, mode, byKey) {
  const out = [];
  for (const rec of doc.citations) {
    const { start, end } = rec.citation;
    if (rec.kind === "other") {
      out.push({ offset: start, rank: RANK.ref, code: bare(CODE_NAMES.ref, mode) });
      out.push({ offset: end, rank: RANK.closeRef, code: bare(CODE_NAMES.closeRef, mode) });
      continue;
    }
    const result = verificationOf(doc, rec.key) ?? { status: "unchecked" };
    const o = citationOpening(rec, result);
    out.push({
      offset: start,
      rank: RANK.cit,
      code: codeString(o.name, o.retained, o.fields, mode)
    });
    const ovr = byKey.get(rec.key);
    if (ovr !== void 0) {
      out.push({ offset: start, rank: RANK.citOvr, code: ovrCode(ovr, mode) });
    }
    out.push({ offset: end, rank: RANK.closeCit, code: bare(CODE_NAMES.closeCit, mode) });
  }
  return out;
}
function quoteEvents(doc, mode, byKey) {
  const out = [];
  for (const q of doc.quotes) {
    const o = quoteOpening(q);
    const { start, end } = q.quote;
    out.push({
      offset: start,
      rank: RANK.quo,
      code: codeString(o.name, o.retained, o.fields, mode)
    });
    const ovr = byKey.get(q.key);
    if (ovr !== void 0) out.push({ offset: start, rank: RANK.quoOvr, code: ovrCode(ovr, mode) });
    out.push({ offset: end, rank: RANK.closeQuo, code: bare(CODE_NAMES.closeQuo, mode) });
  }
  return out;
}
function collectEvents(doc, declaration, mode) {
  const byKey = new Map(doc.overrides.map((o) => [o.key, o]));
  const events = [];
  if (mode === "full")
    events.push({ offset: 0, rank: RANK.doc, code: docCode(doc, declaration, mode) });
  for (const s of doc.spans) {
    events.push({ offset: s.start, rank: RANK.span, code: spanCode(s, mode) });
  }
  events.push(...citationEvents(doc, mode, byKey), ...quoteEvents(doc, mode, byKey));
  return events.sort((a, b) => a.offset - b.offset || a.rank - b.rank);
}
function renderRecord(doc, declaration, mode) {
  const events = collectEvents(doc, declaration, mode);
  const positions = [];
  let out = "";
  let cursor = 0;
  for (const e of events) {
    out += escapeText(doc.text.slice(cursor, e.offset));
    cursor = e.offset;
    out += e.code;
    positions.push({ offset: e.offset, code: e.code });
  }
  out += escapeText(doc.text.slice(cursor));
  return { text: out, positions };
}
function render(doc, mode) {
  return renderRecord(doc, null, mode);
}
var RANK, field;
var init_render = __esm({
  "packages/engine/src/codes/render.ts"() {
    "use strict";
    init_verification();
    init_doc_declaration();
    init_syntax();
    RANK = {
      doc: 0,
      closeQuo: 1,
      closeCit: 2,
      closeRef: 3,
      span: 4,
      cit: 5,
      citOvr: 6,
      ref: 7,
      quo: 8,
      quoOvr: 9
    };
    field = (key, ...values) => ({ key, values });
  }
});

// packages/engine/src/codes/strip.ts
var DOC_OPEN;
var init_strip = __esm({
  "packages/engine/src/codes/strip.ts"() {
    "use strict";
    init_syntax();
    DOC_OPEN = `[${CODE_NAMES.doc}`;
  }
});

// packages/engine/src/codes.ts
function lowestFault(a, b) {
  if (a === void 0 || b === void 0) return a ?? b;
  return b.index < a.index ? b : a;
}
function parseRecord(revealCodesText) {
  const lexed = lexAll(revealCodesText);
  const decoded = decodeTokens(lexed.tokens);
  const lowest = lowestFault(lexed.fault, decoded.ok ? void 0 : decoded.error);
  if (lowest !== void 0) return err(malformed(lowest));
  if (!decoded.ok) return err(malformed(decoded.error));
  const checked2 = check(decoded.value);
  if (!checked2.ok) return err(malformed(checked2.error));
  const built = build(checked2.value);
  if (!built.ok) return err(malformed(built.error));
  return ok({ document: built.value, declaration: checked2.value.draft.declaration ?? null });
}
var malformed;
var init_codes = __esm({
  "packages/engine/src/codes.ts"() {
    "use strict";
    init_build();
    init_check();
    init_decode();
    init_lex2();
    init_result();
    init_render();
    init_strip();
    malformed = (f) => ({
      kind: "malformed_codes",
      index: f.index,
      rule: f.rule
    });
  }
});

// packages/engine/src/index.ts
var init_src = __esm({
  "packages/engine/src/index.ts"() {
    "use strict";
    init_document();
    init_spans();
    init_validate2();
    init_segment();
    init_extract();
    init_format();
    init_verification();
    init_issues();
    init_codes();
    init_declaration();
    init_result();
  }
});

// packages/provenance/src/io/atomic.ts
function dirOf(path) {
  const cut = path.lastIndexOf("/");
  return cut <= 0 ? "/" : path.slice(0, cut);
}
async function atomicWrite(deps, path, data) {
  const made = await deps.fs.mkdirp(dirOf(path));
  if (!made.ok) return made;
  counter += 1;
  const temporary = `${path}.tmp-${String(deps.pid)}-${String(counter)}`;
  const written = await deps.fs.writeFile(temporary, data);
  if (!written.ok) {
    await deps.fs.unlink(temporary);
    return written;
  }
  const moved = await deps.fs.rename(temporary, path);
  if (!moved.ok) {
    await deps.fs.unlink(temporary);
    return moved;
  }
  return ok(void 0);
}
var counter;
var init_atomic = __esm({
  "packages/provenance/src/io/atomic.ts"() {
    "use strict";
    init_src();
    counter = 0;
  }
});

// packages/provenance/src/io/baseline-cache.ts
function digestsOf(baseline) {
  return new Set(Object.values(baseline?.files ?? {}).map((e) => e.sha256));
}
function createBaselineCache(deps, dir) {
  const remove = async (digest) => {
    const gone = await deps.fs.unlink(`${dir}/${digest}`);
    if (gone.ok || gone.error.code === "ENOENT") return ok(void 0);
    return err({ kind: "write_failed", detail: gone.error.code });
  };
  return {
    read: async (digest) => {
      if (!DIGEST_RE.test(digest)) return null;
      const read = await deps.fs.readFile(`${dir}/${digest}`);
      return read.ok ? read.value : null;
    },
    write: async (digest, bytes) => {
      if (!DIGEST_RE.test(digest)) return err({ kind: "write_failed", detail: "bad digest" });
      const written = await atomicWrite(deps, `${dir}/${digest}`, bytes);
      return written.ok ? ok(void 0) : err({ kind: "write_failed", detail: written.error.code });
    },
    release: async (digest, baseline) => {
      if (!DIGEST_RE.test(digest) || digestsOf(baseline).has(digest)) return ok(void 0);
      return remove(digest);
    },
    prune: async (baseline) => {
      const names = await deps.fs.readdir(dir);
      if (!names.ok) return ok(0);
      const named = digestsOf(baseline);
      const stale = names.value.filter((n) => DIGEST_RE.test(n) && !named.has(n));
      for (const digest of stale) {
        const removed = await remove(digest);
        if (!removed.ok) return removed;
      }
      return ok(stale.length);
    }
  };
}
var DIGEST_RE;
var init_baseline_cache = __esm({
  "packages/provenance/src/io/baseline-cache.ts"() {
    "use strict";
    init_src();
    init_atomic();
    DIGEST_RE = /^[0-9a-f]{64}$/u;
  }
});

// packages/provenance/src/io/git.ts
function nulList(bytes) {
  return decoder.decode(bytes).split("\0").filter((p) => p !== "");
}
async function listGitFiles(deps, root) {
  const all = await deps.git.exec(root, [...LIST_BASE, "--others", "--exclude-standard"]);
  if (!all.ok) return { kind: "none" };
  const ignored = await deps.git.exec(root, [...LIST_BASE, "--ignored", "--exclude-standard"]);
  if (!ignored.ok) return { kind: "none" };
  const skip = new Set(nulList(ignored.value));
  const files = [...new Set(nulList(all.value))].filter((p) => !skip.has(p));
  return { kind: "tree", files };
}
function hashable(path) {
  return !path.includes("\n") && !path.startsWith('"');
}
async function hashObjects(deps, root, paths) {
  const carried = paths.filter(hashable);
  if (carried.length === 0) return ok(/* @__PURE__ */ new Map());
  const out = await deps.git.exec(
    root,
    ["hash-object", "--no-filters", "--stdin-paths"],
    encoder.encode(carried.map((p) => `${p}
`).join(""))
  );
  if (!out.ok) return out;
  const ids = decoder.decode(out.value).split("\n").filter((l) => l !== "");
  if (ids.length !== carried.length) return err(failedCall);
  return ok(new Map(carried.map((p, i) => [p, ids[i]])));
}
async function checkBlobs(deps, root, blobIds) {
  const unique = [...new Set(blobIds)];
  if (unique.length === 0) return ok(/* @__PURE__ */ new Map());
  const out = await deps.git.exec(
    root,
    ["cat-file", "--batch-check"],
    encoder.encode(unique.map((id) => `${id}
`).join(""))
  );
  if (!out.ok) return out;
  const lines = decoder.decode(out.value).split("\n").filter((l) => l !== "");
  if (lines.length !== unique.length) return err(failedCall);
  return ok(new Map(unique.map((id, i) => [id, (lines[i] ?? "").split(" ")[1] === "blob"])));
}
function catBlob(deps, root, blobId) {
  if (!/^[0-9a-f]{40}([0-9a-f]{24})?$/u.test(blobId)) return Promise.resolve(err(failedCall));
  return deps.git.exec(root, ["cat-file", "blob", blobId]);
}
var decoder, encoder, LIST_BASE, failedCall;
var init_git = __esm({
  "packages/provenance/src/io/git.ts"() {
    "use strict";
    init_src();
    decoder = new TextDecoder("utf-8");
    encoder = new TextEncoder();
    LIST_BASE = ["ls-files", "-z", "--cached"];
    failedCall = { kind: "failed" };
  }
});

// packages/provenance/src/core/limits.ts
var SIZE_LIMIT, HOOK_DEADLINE_MS, STALE_WINDOW_MS, LABEL_MAX, STDIN_MAX, STDIN_WAIT_MS, LOCK_WAIT_MS, RACY_MS, DIFF_CAP, LOCK_STALE_MS;
var init_limits = __esm({
  "packages/provenance/src/core/limits.ts"() {
    "use strict";
    SIZE_LIMIT = 2e5;
    HOOK_DEADLINE_MS = 2e4;
    STALE_WINDOW_MS = 432e5;
    LABEL_MAX = 80;
    STDIN_MAX = 1048576;
    STDIN_WAIT_MS = 1500;
    LOCK_WAIT_MS = 5e3;
    RACY_MS = 2e3;
    DIFF_CAP = 1500;
    LOCK_STALE_MS = 3e4;
  }
});

// packages/provenance/src/io/lock.ts
async function breakStale(deps, path) {
  const stat = await deps.fs.lstat(path);
  if (!stat.ok || deps.clock.nowMs() - stat.value.mtimeMs <= LOCK_STALE_MS) return false;
  staleCounter += 1;
  const away = `${path}.stale-${String(deps.pid)}-${String(staleCounter)}`;
  const moved = await deps.fs.rename(path, away);
  if (!moved.ok) return false;
  await deps.fs.unlink(away);
  return true;
}
async function acquireLock(deps, path) {
  const started = deps.clock.nowMs();
  for (; ; ) {
    const body = `${String(deps.pid)} ${deps.clock.nowIso()}
`;
    const taken = await deps.fs.writeFile(path, body, true);
    if (taken.ok)
      return ok({
        release: async () => {
          await deps.fs.unlink(path);
        }
      });
    if (taken.error.code !== "EEXIST")
      return err({ kind: "write_failed", detail: taken.error.code });
    if (await breakStale(deps, path)) continue;
    if (deps.clock.nowMs() - started >= LOCK_WAIT_MS) return err({ kind: "lock_timeout" });
    await deps.clock.timer(LOCK_RETRY_MS).done;
  }
}
var LOCK_RETRY_MS, staleCounter;
var init_lock = __esm({
  "packages/provenance/src/io/lock.ts"() {
    "use strict";
    init_src();
    init_limits();
    LOCK_RETRY_MS = 25;
    staleCounter = 0;
  }
});

// packages/provenance/src/core/exclude.ts
function underRecordDirectory(path) {
  return path === RECORD_DIRECTORY || path.startsWith(`${RECORD_DIRECTORY}/`);
}
function endsWithAny(name, suffixes) {
  return suffixes.some((suffix) => name.endsWith(suffix));
}
function isGeneratedName(name) {
  return LOCKFILE_NAMES.has(name) || endsWithAny(name, GENERATED_SUFFIXES);
}
function isSecretName(name) {
  return name === ".env" || name.startsWith(".env.") || endsWithAny(name, SECRET_SUFFIXES) || SECRET_PREFIXES.some((prefix) => name.startsWith(prefix));
}
function isBuiltInExcluded(path) {
  if (underRecordDirectory(path)) return true;
  const segments = path.split("/");
  const name = segments[segments.length - 1] ?? "";
  const directories = segments.slice(0, -1);
  if (directories.some((directory) => OUTPUT_DIRECTORIES.has(directory))) return true;
  return isGeneratedName(name) || isSecretName(name);
}
var RECORD_DIRECTORY, LOCKFILE_NAMES, OUTPUT_DIRECTORIES, GENERATED_SUFFIXES, SECRET_SUFFIXES, SECRET_PREFIXES;
var init_exclude = __esm({
  "packages/provenance/src/core/exclude.ts"() {
    "use strict";
    RECORD_DIRECTORY = ".kiro/provenance";
    LOCKFILE_NAMES = /* @__PURE__ */ new Set([
      "package-lock.json",
      "pnpm-lock.yaml",
      "yarn.lock",
      "bun.lock",
      "Cargo.lock",
      "Gemfile.lock",
      "poetry.lock",
      "composer.lock",
      "go.sum"
    ]);
    OUTPUT_DIRECTORIES = /* @__PURE__ */ new Set([
      "dist",
      "build",
      "out",
      ".next",
      "coverage",
      "target"
    ]);
    GENERATED_SUFFIXES = [".lock", ".min.js", ".min.css", ".map"];
    SECRET_SUFFIXES = [".pem", ".key", ".p12", ".pfx"];
    SECRET_PREFIXES = ["id_rsa", "id_ed25519"];
  }
});

// packages/provenance/src/core/glob.ts
function parseClass(p, j) {
  const s = j + 2;
  let k = s;
  while (p[k] !== void 0 && p[k] !== RBRACKET) k += 1;
  if (p[k] === void 0) return null;
  if (k - s - 1 < 0 || p[k - 1] !== COLON) {
    return { item: { kind: "byte", value: LBRACKET }, at: j, cur: LBRACKET };
  }
  const test = CLASSES.get(decoder2.decode(p.slice(s, k - 1)));
  if (test === void 0) return null;
  return { item: { kind: "class", test }, at: k, cur: 0 };
}
function rangeEnd(p, idx) {
  const c = p[idx];
  if (c === void 0) return null;
  if (c !== BACKSLASH) return { hi: c, at: idx };
  const e = p[idx + 1];
  return e === void 0 ? null : { hi: e, at: idx + 1 };
}
function parseSetBody(p, start) {
  const items = [];
  let j = start;
  let prev = 0;
  for (; ; ) {
    const c = p[j];
    if (c === void 0) return null;
    let cur = c;
    if (c === BACKSLASH) {
      const e = p[j + 1];
      if (e === void 0) return null;
      items.push({ kind: "byte", value: e });
      cur = e;
      j += 1;
    } else if (c === DASH && prev !== 0 && p[j + 1] !== void 0 && p[j + 1] !== RBRACKET) {
      const r = rangeEnd(p, j + 1);
      if (r === null) return null;
      items.push({ kind: "range", lo: prev, hi: r.hi });
      j = r.at;
      cur = 0;
    } else if (c === LBRACKET && p[j + 1] === COLON) {
      const r = parseClass(p, j);
      if (r === null) return null;
      items.push(r.item);
      j = r.at;
      cur = r.cur;
    } else {
      items.push({ kind: "byte", value: c });
    }
    prev = cur;
    j += 1;
    if (p[j] === RBRACKET) return { items, next: j + 1 };
  }
}
function parseSet(p, at) {
  const negated = p[at] === BANG || p[at] === CARET;
  const body = parseSetBody(p, negated ? at + 1 : at);
  return body === null ? null : { token: { kind: "set", negated, items: body.items }, next: body.next };
}
function endSegment(b) {
  const only = b.cur.length === 1 ? b.cur[0] : void 0;
  if (only !== void 0 && only.kind === "star" && only.run >= 2) {
    b.segments.push({ kind: "globstar" });
  } else {
    b.segments.push({ kind: "tokens", tokens: b.cur });
  }
  b.cur = [];
}
function escapeAt(p, i, b) {
  const e = p[i + 1];
  if (e === void 0) return -1;
  if (e === SLASH) endSegment(b);
  else b.cur.push({ kind: "byte", value: e });
  return i + 2;
}
function starAt(p, i, b) {
  let j = i;
  while (p[j] === STAR) j += 1;
  b.cur.push({ kind: "star", run: j - i });
  return j;
}
function compileGlob(pattern) {
  const p = encoder2.encode(pattern);
  const b = { segments: [], cur: [] };
  let i = 0;
  while (i < p.length) {
    const c = p[i];
    if (c === SLASH) {
      endSegment(b);
      i += 1;
    } else if (c === BACKSLASH) {
      i = escapeAt(p, i, b);
      if (i < 0) return NEVER;
    } else if (c === STAR) {
      i = starAt(p, i, b);
    } else if (c === LBRACKET) {
      const set = parseSet(p, i + 1);
      if (set === null) return NEVER;
      b.cur.push(set.token);
      i = set.next;
    } else {
      b.cur.push(c === QUESTION ? { kind: "any" } : { kind: "byte", value: c });
      i += 1;
    }
  }
  endSegment(b);
  return { never: false, segments: b.segments };
}
function inSet(items, b) {
  return items.some((it) => {
    if (it.kind === "byte") return it.value === b;
    if (it.kind === "range") return b >= it.lo && b <= it.hi;
    return it.test(b);
  });
}
function tokenMatches(t, b) {
  if (t.kind === "byte") return t.value === b;
  if (t.kind === "any") return b !== SLASH;
  if (t.kind === "set") return b !== SLASH && inSet(t.items, b) !== t.negated;
  return false;
}
function matchTokens(tokens, text) {
  let ti = 0;
  let bi = 0;
  let starT = -1;
  let starB = 0;
  while (bi < text.length) {
    const t = tokens[ti];
    if (t !== void 0 && t.kind === "star") {
      starT = ti;
      ti += 1;
      starB = bi;
    } else if (t !== void 0 && tokenMatches(t, text[bi])) {
      ti += 1;
      bi += 1;
    } else if (starT >= 0) {
      ti = starT + 1;
      starB += 1;
      bi = starB;
    } else {
      return false;
    }
  }
  while (tokens[ti]?.kind === "star") ti += 1;
  return ti === tokens.length;
}
function matchSegment(seg, text) {
  return seg.kind === "tokens" && matchTokens(seg.tokens, text);
}
function encodeParts(parts) {
  return parts.map((p) => encoder2.encode(p));
}
function matchGlob(glob, text) {
  if (glob.never) return false;
  const pat = glob.segments;
  let pi = 0;
  let ti = 0;
  let starP = -1;
  let starT = 0;
  while (ti < text.length) {
    const seg = pat[pi];
    if (seg !== void 0 && seg.kind === "globstar") {
      if (pi === pat.length - 1) return true;
      starP = pi;
      pi += 1;
      starT = ti;
    } else if (seg !== void 0 && matchSegment(seg, text[ti])) {
      pi += 1;
      ti += 1;
    } else if (starP >= 0) {
      pi = starP + 1;
      starT += 1;
      ti = starT;
    } else {
      return false;
    }
  }
  while (pi < pat.length - 1 && pat[pi]?.kind === "globstar") pi += 1;
  return pi === pat.length;
}
var SLASH, BACKSLASH, STAR, QUESTION, LBRACKET, RBRACKET, COLON, DASH, BANG, CARET, isDigit2, isLower, isUpper, isAlnum, isGraph, CLASSES, NEVER, encoder2, decoder2;
var init_glob = __esm({
  "packages/provenance/src/core/glob.ts"() {
    "use strict";
    SLASH = 47;
    BACKSLASH = 92;
    STAR = 42;
    QUESTION = 63;
    LBRACKET = 91;
    RBRACKET = 93;
    COLON = 58;
    DASH = 45;
    BANG = 33;
    CARET = 94;
    isDigit2 = (b) => b >= 48 && b <= 57;
    isLower = (b) => b >= 97 && b <= 122;
    isUpper = (b) => b >= 65 && b <= 90;
    isAlnum = (b) => isDigit2(b) || isLower(b) || isUpper(b);
    isGraph = (b) => b >= 33 && b <= 126;
    CLASSES = /* @__PURE__ */ new Map([
      ["alnum", isAlnum],
      ["alpha", (b) => isLower(b) || isUpper(b)],
      ["blank", (b) => b === 32 || b === 9],
      ["cntrl", (b) => b < 32 || b === 127],
      ["digit", isDigit2],
      ["graph", isGraph],
      ["lower", isLower],
      ["print", (b) => b >= 32 && b <= 126],
      ["punct", (b) => isGraph(b) && !isAlnum(b)],
      ["space", (b) => b === 32 || b >= 9 && b <= 13],
      ["upper", isUpper],
      ["xdigit", (b) => isDigit2(b) || b >= 65 && b <= 70 || b >= 97 && b <= 102]
    ]);
    NEVER = { never: true, segments: [] };
    encoder2 = new TextEncoder();
    decoder2 = new TextDecoder();
  }
});

// packages/provenance/src/core/ignore.ts
function ruleMatches(rule, parts, isDir) {
  if (rule.dirOnly && !isDir) return false;
  if (rule.anchored) return matchGlob(rule.glob, parts);
  const last = parts[parts.length - 1];
  return last !== void 0 && matchGlob(rule.glob, [last]);
}
function excludedAt(rules, parts, isDir) {
  for (let i = rules.length - 1; i >= 0; i -= 1) {
    const rule = rules[i];
    if (ruleMatches(rule, parts, isDir)) return !rule.negated;
  }
  return false;
}
function isIgnored(rules, path) {
  const parts = encodeParts(path.split("/"));
  for (let depth = 1; depth <= parts.length; depth += 1) {
    if (excludedAt(rules, parts.slice(0, depth), depth < parts.length)) return true;
  }
  return false;
}
function isIgnoredByAny(files, path) {
  return files.some((rules) => isIgnored(rules, path));
}
var init_ignore = __esm({
  "packages/provenance/src/core/ignore.ts"() {
    "use strict";
    init_glob();
  }
});

// packages/provenance/src/core/ignore-parse.ts
function trimTrailingSpaces(line2) {
  let lastSpace = -1;
  for (let i = 0; i < line2.length; i += 1) {
    const ch = line2[i];
    if (ch === " ") {
      if (lastSpace < 0) lastSpace = i;
    } else if (ch === "\\") {
      i += 1;
      if (i >= line2.length) return line2;
      lastSpace = -1;
    } else {
      lastSpace = -1;
    }
  }
  return lastSpace >= 0 ? line2.slice(0, lastSpace) : line2;
}
function parseLine(raw) {
  const line2 = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
  if (line2 === "" || line2.startsWith("#")) return null;
  let pattern = trimTrailingSpaces(line2);
  const negated = pattern.startsWith("!");
  if (negated) pattern = pattern.slice(1);
  const dirOnly = pattern.endsWith("/");
  if (dirOnly) pattern = pattern.slice(0, -1);
  const anchored = pattern.includes("/");
  if (anchored && pattern.startsWith("/")) pattern = pattern.slice(1);
  if (pattern === "") return null;
  return { negated, dirOnly, anchored, glob: compileGlob(pattern) };
}
function parseIgnore(text) {
  const body = text.startsWith("\uFEFF") ? text.slice(1) : text;
  const rules = [];
  for (const raw of body.split("\n")) {
    const rule = parseLine(raw);
    if (rule !== null) rules.push(rule);
  }
  return rules;
}
var init_ignore_parse = __esm({
  "packages/provenance/src/core/ignore-parse.ts"() {
    "use strict";
    init_glob();
  }
});

// packages/provenance/src/io/scan.ts
async function loadIgnoreFiles(deps, root) {
  const found = [];
  for (const name of IGNORE_FILES) {
    const read = await deps.fs.readFile(`${root}/${name}`);
    if (read.ok) {
      found.push(parseIgnore(new TextDecoder("utf-8").decode(read.value)));
    } else if (read.error.code !== "ENOENT") {
      await deps.log.fault({ event: "scan", path: name, reason: "read_failed" });
    }
  }
  return found;
}
function isExcluded(rules, path) {
  return isBuiltInExcluded(path) || isIgnoredByAny(rules, path);
}
async function statFiles(deps, root, paths) {
  const found = [];
  for (let i = 0; i < paths.length; i += STAT_BATCH) {
    const batch = paths.slice(i, i + STAT_BATCH);
    const stats = await Promise.all(batch.map((p) => deps.fs.lstat(`${root}/${p}`)));
    stats.forEach((stat, j) => {
      if (stat.ok && stat.value.kind === "file") {
        found.push({
          path: batch[j],
          size: stat.value.size,
          mtimeMs: stat.value.mtimeMs
        });
      }
    });
  }
  return found;
}
async function walk(deps, root, dir, out) {
  const names = await deps.fs.readdir(dir === "" ? root : `${root}/${dir}`);
  if (!names.ok) return;
  for (const name of [...names.value].sort()) {
    if (WALK_SKIP.has(name)) continue;
    const path = dir === "" ? name : `${dir}/${name}`;
    const stat = await deps.fs.lstat(`${root}/${path}`);
    if (!stat.ok) continue;
    if (stat.value.kind === "dir") await walk(deps, root, path, out);
    else if (stat.value.kind === "file") out.push(path);
  }
}
async function listCandidates(deps, root) {
  const rules = await loadIgnoreFiles(deps, root);
  const tree = await listGitFiles(deps, root);
  const names = [];
  if (tree.kind === "tree") names.push(...tree.files);
  else await walk(deps, root, "", names);
  const kept = names.filter((p) => !isExcluded(rules, p));
  const files = (await statFiles(deps, root, kept)).sort(
    (a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0
  );
  return { git: tree.kind === "tree", files };
}
function decodeUtf8(bytes) {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch (error) {
    if (error instanceof TypeError) return null;
    throw error;
  }
}
async function readCandidate(deps, root, candidate) {
  const { size, mtimeMs } = candidate;
  if (size > READ_FREE_LIMIT_BYTES) return { kind: "over_limit", size, mtimeMs };
  const read = await deps.fs.readFile(`${root}/${candidate.path}`);
  if (!read.ok) {
    return read.error.code === "ENOENT" ? { kind: "absent" } : { kind: "unreadable", code: read.error.code };
  }
  const bytes = read.value;
  if (bytes.includes(0)) return { kind: "binary" };
  const text = decodeUtf8(bytes);
  if (text === null) return { kind: "binary" };
  if (size > SIZE_LIMIT && text.length > SIZE_LIMIT) return { kind: "over_limit", size, mtimeMs };
  return { kind: "text", text, bytes, sha256: deps.sha256(bytes), size, mtimeMs };
}
var READ_FREE_LIMIT_BYTES, WALK_SKIP, IGNORE_FILES, STAT_BATCH;
var init_scan2 = __esm({
  "packages/provenance/src/io/scan.ts"() {
    "use strict";
    init_exclude();
    init_ignore();
    init_ignore_parse();
    init_limits();
    init_git();
    READ_FREE_LIMIT_BYTES = SIZE_LIMIT * 3;
    WALK_SKIP = /* @__PURE__ */ new Set([
      ".git",
      "node_modules",
      "dist",
      "build",
      "out",
      ".next",
      "coverage",
      "target"
    ]);
    IGNORE_FILES = [".kiroignore", ".kiro/provenance/ignore"];
    STAT_BATCH = 64;
  }
});

// packages/provenance/src/core/baseline-codec.ts
function bad3(detail) {
  return err({ kind: "bad_baseline", detail });
}
function entryText(entry) {
  const blob = entry.blob === void 0 ? "" : `, "blob": ${JSON.stringify(entry.blob)}`;
  return `{ "sha256": ${JSON.stringify(entry.sha256)}${blob} }`;
}
function encodeBaseline(baseline) {
  const paths = Object.keys(baseline.files).sort();
  const lines = paths.map((path, index) => {
    const entry = baseline.files[path];
    const comma = index < paths.length - 1 ? "," : "";
    return `    ${JSON.stringify(path)}: ${entryText(entry)}${comma}`;
  });
  const files = lines.length === 0 ? '  "files": {}' : `  "files": {
${lines.join("\n")}
  }`;
  return `{
  "version": 1,
  "at": ${JSON.stringify(baseline.at)},
${files}
}
`;
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseJson(text) {
  try {
    return ok(JSON.parse(text));
  } catch {
    return bad3("not JSON");
  }
}
function decodeEntry(path, value) {
  if (!isRecord(value)) return bad3(`entry is not an object: ${path}`);
  const extra = Object.keys(value).find((key) => key !== "sha256" && key !== "blob");
  if (extra !== void 0) return bad3(`unknown entry key ${extra}: ${path}`);
  const { sha256, blob } = value;
  if (typeof sha256 !== "string" || !SHA256_RE.test(sha256)) return bad3(`bad sha256: ${path}`);
  if (blob === void 0) return ok({ sha256 });
  if (typeof blob !== "string" || !BLOB_RE.test(blob)) return bad3(`bad blob: ${path}`);
  return ok({ sha256, blob });
}
function decodeFiles(value) {
  if (!isRecord(value)) return bad3("files is not an object");
  const pairs = [];
  for (const [path, raw] of Object.entries(value)) {
    const entry = decodeEntry(path, raw);
    if (!entry.ok) return entry;
    pairs.push([path, entry.value]);
  }
  return ok(Object.fromEntries(pairs));
}
function validAt(at) {
  return typeof at === "string" && createDocument("", at).ok;
}
function decodeBaseline(text) {
  const parsed = parseJson(text);
  if (!parsed.ok) return parsed;
  const root = parsed.value;
  if (!isRecord(root)) return bad3("not an object");
  if (root["version"] !== 1) return bad3("unsupported version");
  const at = root["at"];
  if (!validAt(at)) return bad3("bad at");
  const files = decodeFiles(root["files"]);
  if (!files.ok) return files;
  return ok({ version: 1, at, files: files.value });
}
var SHA256_RE, BLOB_RE;
var init_baseline_codec = __esm({
  "packages/provenance/src/core/baseline-codec.ts"() {
    "use strict";
    init_src();
    SHA256_RE = /^[0-9a-f]{64}$/u;
    BLOB_RE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
  }
});

// packages/provenance/src/core/state-codec.ts
function bad4(detail) {
  return err({ kind: "bad_state", detail });
}
function isObj(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseJson2(text) {
  try {
    return ok(JSON.parse(text));
  } catch {
    return bad4("not JSON");
  }
}
function shape(v, where, required, optional = []) {
  if (!isObj(v)) return bad4(`${where} is not an object`);
  const missing = required.find((key) => !(key in v));
  if (missing !== void 0) return bad4(`${where} lacks ${missing}`);
  const extra = Object.keys(v).find((k) => !required.includes(k) && !optional.includes(k));
  return extra === void 0 ? ok(v) : bad4(`${where} has unknown key ${extra}`);
}
function isNum(v) {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}
function isCount(v) {
  return isNum(v) && Number.isInteger(v);
}
function isNullable(v, test) {
  return v === null || test(v);
}
function isStr(v) {
  return typeof v === "string";
}
function decodeWindow(v, where) {
  const s = shape(
    v,
    where,
    ["windowRun", "label", "taskNumber", "kind", "openedAt", "order"],
    ["spec", "taskName"]
  );
  if (!s.ok) return s;
  const o = s.value;
  const { windowRun, label, taskNumber, kind, openedAt, order, spec, taskName } = o;
  if (!isStr(windowRun) || !isStr(label)) return bad4(`bad window text: ${where}`);
  if (!isNullable(taskNumber, isStr)) return bad4(`bad taskNumber: ${where}`);
  if (kind !== "turn" && kind !== "task") return bad4(`bad kind: ${where}`);
  if (!validAt(openedAt) || !isCount(order)) return bad4(`bad openedAt or order: ${where}`);
  if (spec !== void 0 && !isStr(spec)) return bad4(`bad spec: ${where}`);
  if (taskName !== void 0 && (!isStr(taskName) || taskName === ""))
    return bad4(`bad taskName: ${where}`);
  const base = {
    windowRun,
    label,
    taskNumber,
    kind: kind === "turn" ? "turn" : "task",
    openedAt,
    order
  };
  const withSpec = spec === void 0 ? base : { ...base, spec };
  return ok(taskName === void 0 ? withSpec : { ...withSpec, taskName });
}
function decodeList(v, where, item) {
  if (!Array.isArray(v)) return bad4(`${where} is not an array`);
  const out = [];
  for (const [i, raw] of v.entries()) {
    const r = item(raw, `${where}[${String(i)}]`);
    if (!r.ok) return r;
    out.push(r.value);
  }
  return ok(out);
}
function decodeMap(v, where, item) {
  if (!isObj(v)) return bad4(`${where} is not an object`);
  const pairs = [];
  for (const [key, raw] of Object.entries(v)) {
    const r = item(raw, `${where}.${key}`);
    if (!r.ok) return r;
    pairs.push([key, r.value]);
  }
  return ok(Object.fromEntries(pairs));
}
function decodeSession(v, where) {
  const keys = ["lastEventAt", "lastClosedBy", "promptSeen", "noPromptCounted", "windows"];
  const s = shape(v, where, keys);
  if (!s.ok) return s;
  const { lastEventAt, lastClosedBy, promptSeen, noPromptCounted, windows } = s.value;
  if (!validAt(lastEventAt)) return bad4(`bad lastEventAt: ${where}`);
  if (lastClosedBy !== null && !CLOSED_BY.includes(lastClosedBy))
    return bad4(`bad lastClosedBy: ${where}`);
  if (typeof promptSeen !== "boolean" || typeof noPromptCounted !== "boolean")
    return bad4(`bad flag: ${where}`);
  const stack = decodeList(windows, `${where}.windows`, decodeWindow);
  if (!stack.ok) return stack;
  return ok({
    lastEventAt,
    lastClosedBy,
    promptSeen,
    noPromptCounted,
    windows: stack.value
  });
}
function decodeFileCache(v, where) {
  const s = shape(v, where, ["size", "mtimeMs", "digest", "seenMs"]);
  if (!s.ok) return s;
  const { size, mtimeMs, digest, seenMs } = s.value;
  if (!isCount(size) || !isNum(mtimeMs) || !isNum(seenMs)) return bad4(`bad number: ${where}`);
  if (!isStr(digest) || !SHA256_RE2.test(digest)) return bad4(`bad digest: ${where}`);
  return ok({ size, mtimeMs, digest, seenMs });
}
function decodeSkipped(v, where) {
  const s = shape(v, where, ["size", "mtimeMs", "reason"]);
  if (!s.ok) return s;
  const { size, mtimeMs, reason } = s.value;
  if (!isCount(size) || !isNum(mtimeMs) || reason !== "over_limit")
    return bad4(`bad entry: ${where}`);
  return ok({ size, mtimeMs, reason });
}
function decodeState(text) {
  const parsed = parseJson2(text);
  if (!parsed.ok) return parsed;
  const keys = [
    "version",
    "order",
    "lastWindowRun",
    "lastEventAt",
    "recordedAtMs",
    "noSessionIdLogged"
  ];
  const s = shape(parsed.value, "state", [...keys, "sessions", "files", "skipped"]);
  if (!s.ok) return s;
  const r = s.value;
  if (r["version"] !== 1) return bad4("unsupported version");
  const { order, lastWindowRun, lastEventAt, recordedAtMs, noSessionIdLogged } = r;
  if (!isCount(order) || !isNum(recordedAtMs)) return bad4("bad counter");
  if (!isNullable(lastWindowRun, isStr)) return bad4("bad lastWindowRun");
  if (lastEventAt !== null && !validAt(lastEventAt)) return bad4("bad lastEventAt");
  if (typeof noSessionIdLogged !== "boolean") return bad4("bad noSessionIdLogged");
  const sessions = decodeMap(r["sessions"], "sessions", decodeSession);
  if (!sessions.ok) return sessions;
  const files = decodeMap(r["files"], "files", decodeFileCache);
  if (!files.ok) return files;
  const skipped = decodeMap(r["skipped"], "skipped", decodeSkipped);
  if (!skipped.ok) return skipped;
  return ok({
    version: 1,
    order,
    lastWindowRun,
    lastEventAt,
    recordedAtMs,
    noSessionIdLogged,
    sessions: sessions.value,
    files: files.value,
    skipped: skipped.value
  });
}
function sortedMap(map, f) {
  return Object.fromEntries(
    Object.keys(map).sort().map((key) => [key, f(map[key])])
  );
}
function windowJson(w) {
  const base = {
    windowRun: w.windowRun,
    label: w.label,
    taskNumber: w.taskNumber,
    kind: w.kind,
    openedAt: w.openedAt,
    order: w.order
  };
  const withSpec = w.spec === void 0 ? base : { ...base, spec: w.spec };
  return w.taskName === void 0 ? withSpec : { ...withSpec, taskName: w.taskName };
}
function sessionJson(s) {
  return {
    lastEventAt: s.lastEventAt,
    lastClosedBy: s.lastClosedBy,
    promptSeen: s.promptSeen,
    noPromptCounted: s.noPromptCounted,
    windows: s.windows.map(windowJson)
  };
}
function encodeState(state) {
  const json = {
    version: 1,
    order: state.order,
    lastWindowRun: state.lastWindowRun,
    lastEventAt: state.lastEventAt,
    recordedAtMs: state.recordedAtMs,
    noSessionIdLogged: state.noSessionIdLogged,
    sessions: sortedMap(state.sessions, sessionJson),
    files: sortedMap(state.files, (f) => ({
      size: f.size,
      mtimeMs: f.mtimeMs,
      digest: f.digest,
      seenMs: f.seenMs
    })),
    skipped: sortedMap(state.skipped, (k) => ({
      size: k.size,
      mtimeMs: k.mtimeMs,
      reason: k.reason
    }))
  };
  return `${JSON.stringify(json, null, 2)}
`;
}
function encodeSessions(count) {
  return `{ "version": 1, "noPromptEventSessions": ${String(count)} }
`;
}
function badSessions(detail) {
  return err({ kind: "bad_sessions", detail });
}
function decodeSessions(text) {
  let root;
  try {
    root = JSON.parse(text);
  } catch {
    return badSessions("not JSON");
  }
  const s = shape(root, "sessions.json", ["version", "noPromptEventSessions"]);
  if (!s.ok) return badSessions(s.error.detail ?? "bad shape");
  if (s.value["version"] !== 1) return badSessions("unsupported version");
  const n = s.value["noPromptEventSessions"];
  return isCount(n) ? ok(n) : badSessions("bad count");
}
var SHA256_RE2, CLOSED_BY;
var init_state_codec = __esm({
  "packages/provenance/src/core/state-codec.ts"() {
    "use strict";
    init_src();
    init_baseline_codec();
    SHA256_RE2 = /^[0-9a-f]{64}$/u;
    CLOSED_BY = ["postTask", "agentStop", "sweep", "leftover"];
  }
});

// packages/provenance/src/io/store.ts
function failed(kind, error) {
  return { kind, detail: error.code };
}
function safeRelative(path) {
  if (path === "" || path.startsWith("/") || path.includes("\\") || /^[A-Za-z]:/u.test(path))
    return false;
  return path.split("/").every((s) => s !== "" && s !== "." && s !== "..");
}
async function readText2(deps, path) {
  const read = await deps.fs.readFile(path);
  if (read.ok) return ok(new TextDecoder("utf-8").decode(read.value));
  return read.error.code === "ENOENT" ? ok(null) : err(failed("read_failed", read.error));
}
async function writeText(deps, path, text) {
  const written = await atomicWrite(deps, path, text);
  return written.ok ? ok(void 0) : err(failed("write_failed", written.error));
}
async function readDecoded(deps, path, decode2) {
  const text = await readText2(deps, path);
  if (!text.ok) return text;
  return text.value === null ? ok(null) : decode2(text.value);
}
async function pruneEmptyDirs(deps, recordsDir, file) {
  let dir = file.slice(0, file.lastIndexOf("/"));
  while (dir.length > recordsDir.length && dir.startsWith(`${recordsDir}/`)) {
    const removed = await deps.fs.rmdir(dir);
    if (!removed.ok) return;
    dir = dir.slice(0, dir.lastIndexOf("/"));
  }
}
async function listRecordPaths(deps, dir, prefix = "") {
  const names = await deps.fs.readdir(prefix === "" ? dir : `${dir}/${prefix}`);
  if (!names.ok) return [];
  const found = [];
  for (const name of names.value) {
    const rel = prefix === "" ? name : `${prefix}/${name}`;
    const stat = await deps.fs.lstat(`${dir}/${rel}`);
    if (!stat.ok) continue;
    if (stat.value.kind === "dir") found.push(...await listRecordPaths(deps, dir, rel));
    else if (stat.value.kind === "file" && rel.endsWith(".reveal")) found.push(rel.slice(0, -7));
  }
  return found;
}
function recordReader(deps, store) {
  return async (path) => {
    const file = store().recordPath(path);
    if (!file.ok) return file;
    const text = await readText2(deps, file.value);
    if (!text.ok) return text;
    if (text.value === null) return ok(null);
    const parsed = parseRecord(text.value);
    return parsed.ok ? ok(parsed.value) : err({ kind: "tampered_record", detail: parsed.error.kind });
  };
}
function createStore(deps, dir) {
  const recordsDir = `${dir}/records`;
  const recordPath = (path) => safeRelative(path) ? ok(`${recordsDir}/${path}.reveal`) : err({ kind: "write_failed", detail: "unsafe path" });
  const store = {
    dir,
    cacheDir: () => `${dir}/cache`,
    recordPath,
    readRecord: recordReader(deps, () => store),
    writeRecord: async (path, text) => {
      const file = recordPath(path);
      return file.ok ? writeText(deps, file.value, text) : file;
    },
    listRecords: () => listRecordPaths(deps, recordsDir),
    deleteRecord: async (path) => {
      const file = recordPath(path);
      if (!file.ok) return file;
      const removed = await deps.fs.unlink(file.value);
      if (!removed.ok && removed.error.code !== "ENOENT")
        return err(failed("write_failed", removed.error));
      await pruneEmptyDirs(deps, recordsDir, file.value);
      return ok(void 0);
    },
    readBaseline: () => readDecoded(deps, `${dir}/baseline.json`, decodeBaseline),
    writeBaseline: (b) => writeText(deps, `${dir}/baseline.json`, encodeBaseline(b)),
    readState: () => readDecoded(deps, `${dir}/state.json`, decodeState),
    writeState: (s) => writeText(deps, `${dir}/state.json`, encodeState(s)),
    readSessions: async () => {
      const count = await readDecoded(deps, `${dir}/sessions.json`, decodeSessions);
      return count.ok ? ok(count.value ?? 0) : count;
    },
    writeSessions: (n) => writeText(deps, `${dir}/sessions.json`, encodeSessions(n))
  };
  return store;
}
var init_store = __esm({
  "packages/provenance/src/io/store.ts"() {
    "use strict";
    init_src();
    init_baseline_codec();
    init_state_codec();
    init_atomic();
  }
});

// packages/provenance/src/io/faults.ts
function field2(text) {
  return text.replace(/[\s\p{Cc}]/gu, "_");
}
function formatFaultLine(time, fault5) {
  const path = fault5.path === null || fault5.path === "" ? "-" : field2(fault5.path);
  return `${time} ${field2(fault5.event)} ${path} ${fault5.reason}`;
}
function cutLog(bytes) {
  const start = bytes.length - LOG_KEEP_BYTES;
  if (start <= 0) return bytes;
  const tail = bytes.subarray(start);
  if (bytes[start - 1] === 10) return tail;
  const newline = tail.indexOf(10);
  return newline < 0 ? new Uint8Array(0) : tail.subarray(newline + 1);
}
async function trimIfLarge(deps, logPath) {
  const stat = await deps.fs.lstat(logPath);
  if (!stat.ok || stat.value.size <= LOG_MAX_BYTES) return;
  const bytes = await deps.fs.readFile(logPath);
  if (!bytes.ok) return;
  await atomicWrite(deps, logPath, cutLog(bytes.value));
}
function createFaultLog(deps, logPath) {
  return {
    fault: async (fault5) => {
      await trimIfLarge(deps, logPath);
      await deps.fs.appendFile(logPath, `${formatFaultLine(deps.clock.nowIso(), fault5)}
`);
    }
  };
}
function shouldLogOverLimit(skipped, path, size, mtimeMs) {
  const known = skipped[path];
  return known === void 0 || known.size !== size || known.mtimeMs !== mtimeMs;
}
var LOG_MAX_BYTES, LOG_KEEP_BYTES;
var init_faults = __esm({
  "packages/provenance/src/io/faults.ts"() {
    "use strict";
    init_atomic();
    LOG_MAX_BYTES = 256 * 1024;
    LOG_KEEP_BYTES = 128 * 1024;
  }
});

// packages/provenance/src/core/payload.ts
function emptyPayload() {
  return { ...EMPTY };
}
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function stringOrNull(value) {
  return typeof value === "string" ? value : null;
}
function overLimit(text) {
  if (text.length > STDIN_MAX) return true;
  return new TextEncoder().encode(text).length > STDIN_MAX;
}
function specDirectoryName(value) {
  if (typeof value !== "string") return null;
  const parts = value.split(/[\\/]/).filter((part) => part !== "");
  if (parts[parts.length - 1] === "tasks.md") parts.pop();
  const name = parts[parts.length - 1];
  return name === void 0 || name === "" || name === ".." || name === "." ? null : name;
}
function parseJson3(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
function parsePayload(text) {
  if (typeof text !== "string" || overLimit(text)) return emptyPayload();
  const value = parseJson3(text);
  if (!isRecord2(value)) return emptyPayload();
  const sessionId = stringOrNull(value["session_id"]);
  const success = value["task_success"];
  return {
    sessionId: sessionId === "" ? null : sessionId,
    cwd: stringOrNull(value["cwd"]),
    taskName: stringOrNull(value["task_name"]),
    specName: specDirectoryName(value["spec_name"]),
    taskSuccess: typeof success === "boolean" ? success : null
  };
}
var EMPTY;
var init_payload = __esm({
  "packages/provenance/src/core/payload.ts"() {
    "use strict";
    init_limits();
    EMPTY = {
      sessionId: null,
      cwd: null,
      taskName: null,
      specName: null,
      taskSuccess: null
    };
  }
});

// packages/provenance/src/core/label.ts
function clean(text) {
  return text.replace(SPACE_RUN, " ").trim();
}
function cutTitle(title) {
  const points = Array.from(title);
  return points.length <= LABEL_MAX ? title : points.slice(0, LABEL_MAX).join("").trimEnd();
}
function parseTaskName(taskName) {
  const text = taskName === null ? "" : clean(taskName);
  const token = TASK_TOKEN.exec(text);
  const taskNumber = token === null ? null : token[1] ?? null;
  const rest = token === null ? text : text.slice(token[0].length).trim();
  const title = cutTitle(rest);
  return { taskNumber, title: title === "" ? FALLBACK_TITLE : title };
}
function makeLabel(taskName, kind) {
  if (kind === "promptSubmit") return { taskNumber: null, title: TURN_TITLE };
  return parseTaskName(taskName);
}
function windowRunName(taskNumber, title, time, taken) {
  const head = taskNumber === null ? "" : `${taskNumber} `;
  const base = `${head}${title} ${time}`;
  if (!taken.includes(base)) return base;
  let k = 2;
  while (taken.includes(base + "~" + String(k))) k += 1;
  return base + "~" + String(k);
}
function runId(windowRun, n) {
  return windowRun + "." + String(n);
}
function parseRunId(id) {
  const m = RUN_ID.exec(id);
  if (m === null) return { taskNumber: null, title: "?", time: null, suffix: null, n: null };
  const suffix = m[4];
  return {
    taskNumber: m[1] ?? null,
    title: m[2] ?? "",
    time: m[3] ?? null,
    suffix: suffix === void 0 ? null : Number(suffix),
    n: Number(m[5])
  };
}
function describeRun(taskNumber, title) {
  if (taskNumber === null && title === TURN_TITLE) return "written in turn";
  const number = taskNumber === null ? "" : ` ${taskNumber}`;
  const name = title === FALLBACK_TITLE ? "" : ` ${title}`;
  return `written in task${number}${name}`;
}
var FALLBACK_TITLE, TURN_TITLE, SPACE_RUN, TASK_TOKEN, RUN_ID;
var init_label = __esm({
  "packages/provenance/src/core/label.ts"() {
    "use strict";
    init_limits();
    FALLBACK_TITLE = "task";
    TURN_TITLE = "turn";
    SPACE_RUN = /[\s\p{Cc}]+/gu;
    TASK_TOKEN = /^(\d+(?:\.\d+)*)\.?(?= |$)/u;
    RUN_ID = /^(?:(\d+(?:\.\d+)*) )?(.*) (\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ)(?:~(\d+))?\.(\d+)$/su;
  }
});

// packages/provenance/src/core/windows.ts
function fault3(kind) {
  return { kind };
}
function hasId(payload) {
  return payload.sessionId !== null && payload.sessionId !== "";
}
function sessionKey(payload) {
  return payload.sessionId === null || payload.sessionId === "" ? NONE_KEY : payload.sessionId;
}
function entryOf(state, key) {
  return Object.hasOwn(state.sessions, key) ? state.sessions[key] ?? null : null;
}
function withEntry(state, key, entry) {
  return { ...state, sessions: { ...state.sessions, [key]: entry } };
}
function innermost(entry) {
  return entry.windows[entry.windows.length - 1] ?? null;
}
function isStale(entry, nowMs) {
  return nowMs - Date.parse(entry.lastEventAt) > STALE_WINDOW_MS;
}
function sweepStale(state, nowMs) {
  const faults = [];
  const kept = [];
  for (const [key, entry] of Object.entries(state.sessions)) {
    if (!isStale(entry, nowMs)) kept.push([key, entry]);
    else faults.push(...entry.windows.map(() => fault3("window_left_open")));
  }
  if (kept.length === Object.keys(state.sessions).length) return { state, faults };
  return { state: { ...state, sessions: Object.fromEntries(kept) }, faults };
}
function closeLeftover(state, session) {
  const entry = entryOf(state, session);
  if (entry === null || entry.windows.length === 0) return { state, faults: [] };
  const closed = { ...entry, windows: [], lastClosedBy: "leftover" };
  return { state: withEntry(state, session, closed), faults: [fault3("window_left_open")] };
}
function select(state, session) {
  const own = session === null ? null : entryOf(state, session);
  const mine = own === null ? null : innermost(own);
  if (mine !== null) return mine;
  let best = null;
  for (const [key, entry] of Object.entries(state.sessions)) {
    const top = key === session ? null : innermost(entry);
    if (top !== null && (best === null || top.order > best.order)) best = top;
  }
  return best;
}
function nameOf(payload) {
  return payload.taskName === null || payload.taskName === "" ? null : payload.taskName;
}
function freshEntry(now) {
  return {
    lastEventAt: now,
    lastClosedBy: null,
    promptSeen: false,
    noPromptCounted: false,
    windows: []
  };
}
function openNames(state) {
  const names = Object.values(state.sessions).flatMap((s) => s.windows.map((w) => w.windowRun));
  return state.lastWindowRun === null ? names : [...names, state.lastWindowRun];
}
function openWindow(state, entry, event, payload, now) {
  const label = makeLabel(payload.taskName, event);
  const time = now.slice(0, 19) + "Z";
  const windowRun = windowRunName(label.taskNumber, label.title, time, openNames(state));
  const order = state.order + 1;
  const base = {
    windowRun,
    label: label.title,
    taskNumber: label.taskNumber,
    kind: event === "promptSubmit" ? "turn" : "task",
    openedAt: now,
    order
  };
  const spec = event === "preTask" ? payload.specName : null;
  const name = event === "preTask" ? nameOf(payload) : null;
  const withSpec = spec === null ? base : { ...base, spec };
  const win = name === null ? withSpec : { ...withSpec, taskName: name };
  const next = { ...state, order, lastWindowRun: windowRun };
  return { state: next, entry: { ...entry, windows: [...entry.windows, win], lastClosedBy: null } };
}
function closeIndex(entry, name) {
  for (let i = entry.windows.length - 1; i >= 0; i -= 1) {
    const w = entry.windows[i];
    if (w === void 0) continue;
    if (name === null ? w.kind === "task" : w.taskName === name) return i;
  }
  return -1;
}
function closePostTask(entry, payload) {
  const at = closeIndex(entry, nameOf(payload));
  if (at < 0) return { entry, faults: [fault3("no_open_window")] };
  const windows = entry.windows.filter((_, i) => i !== at);
  const lastClosedBy = windows.length === 0 ? "postTask" : entry.lastClosedBy;
  return { entry: { ...entry, windows, lastClosedBy }, faults: [] };
}
function closeAgentStop(entry) {
  const empty = entry.windows.length === 0;
  const quiet = empty && entry.lastClosedBy === "postTask";
  const faults = empty && !quiet ? [fault3("no_open_window")] : [];
  return { entry: { ...entry, windows: [], lastClosedBy: "agentStop" }, faults };
}
function apply2(state, entry, event, p, now) {
  if (event === "promptSubmit") {
    return { ...openWindow(state, { ...entry, promptSeen: true }, event, p, now), faults: [] };
  }
  if (event === "preTask") {
    const name = nameOf(p);
    if (name !== null && innermost(entry)?.taskName === name) return { state, entry, faults: [] };
    return { ...openWindow(state, entry, event, p, now), faults: [] };
  }
  return { state, ...event === "postTask" ? closePostTask(entry, p) : closeAgentStop(entry) };
}
function transition(state, event, session, payload, clock, outsideFound) {
  if (event === "manual" || session === null) return { state, faults: [], countSession: false };
  const now = clock.nowIso();
  const entry = entryOf(state, session) ?? freshEntry(now);
  const applied = apply2(state, entry, event, payload, now);
  const faults = [];
  const logNoId = !hasId(payload) && !state.noSessionIdLogged;
  if (logNoId) faults.push(fault3("no_session_id"));
  faults.push(...applied.faults);
  const count = event === "agentStop" && outsideFound && !entry.promptSeen && !entry.noPromptCounted;
  if (count) faults.push(fault3("no_prompt_events"));
  const done2 = {
    ...applied.entry,
    lastEventAt: now,
    noPromptCounted: applied.entry.noPromptCounted || count
  };
  const next = withEntry(applied.state, session, done2);
  const flagged = logNoId ? { ...next, noSessionIdLogged: true } : next;
  return { state: { ...flagged, lastEventAt: now }, faults, countSession: count };
}
var NONE_KEY;
var init_windows = __esm({
  "packages/provenance/src/core/windows.ts"() {
    "use strict";
    init_label();
    init_limits();
    NONE_KEY = "_none";
  }
});

// packages/provenance/src/core/lines.ts
function splitLines(text) {
  const out = [];
  let from = 0;
  for (let i = text.indexOf("\n"); i !== -1; i = text.indexOf("\n", from)) {
    out.push(text.slice(from, i + 1));
    from = i + 1;
  }
  if (from < text.length) out.push(text.slice(from));
  return out;
}
function lineStarts(text) {
  const starts = [0];
  for (let i = text.indexOf("\n"); i !== -1; i = text.indexOf("\n", i + 1)) {
    starts.push(i + 1);
  }
  return starts;
}
function createLineIndex(text) {
  return { starts: lineStarts(text), length: text.length };
}
function positionAt(index, offset) {
  const at = Math.min(Math.max(offset, 0), index.length);
  let lo = 0;
  let hi = index.starts.length - 1;
  while (lo < hi) {
    const mid = lo + hi + 1 >> 1;
    if ((index.starts[mid] ?? 0) <= at) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, column: at - (index.starts[lo] ?? 0) + 1 };
}
var init_lines = __esm({
  "packages/provenance/src/core/lines.ts"() {
    "use strict";
  }
});

// packages/provenance/src/core/diff.ts
function fnv1a(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}
function startsOf(lines) {
  const out = [0];
  for (const l of lines) out.push((out[out.length - 1] ?? 0) + l.length);
  return out;
}
function myers(a, b, ha, hb) {
  const n = a.length;
  const m = b.length;
  const trace = [];
  for (let d = 0; d <= DIFF_CAP; d++) {
    const cur = new Int32Array(2 * d + 1);
    const prev = trace[d - 1];
    for (let k = -d; k <= d; k += 2) {
      let x;
      if (prev === void 0) x = 0;
      else if (k === -d || k !== d && (prev[k - 1 + d - 1] ?? 0) < (prev[k + 1 + d - 1] ?? 0)) {
        x = prev[k + 1 + d - 1] ?? 0;
      } else x = (prev[k - 1 + d - 1] ?? 0) + 1;
      let y = x - k;
      while (x < n && y < m && ha[x] === hb[y] && a[x] === b[y]) {
        x++;
        y++;
      }
      cur[k + d] = x;
      if (x >= n && y >= m) {
        trace.push(cur);
        return trace;
      }
    }
    trace.push(cur);
  }
  return null;
}
function backtrack(trace, n, m) {
  const steps = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 1; d--) {
    const prev = trace[d - 1];
    const k = x - y;
    const down = k === -d || k !== d && (prev[k - 1 + d - 1] ?? 0) < (prev[k + 1 + d - 1] ?? 0);
    const pk = down ? k + 1 : k - 1;
    const px = prev[pk + d - 1] ?? 0;
    const py = px - pk;
    steps.push(
      down ? { x0: px, y0: py, x1: px, y1: py + 1 } : { x0: px, y0: py, x1: px + 1, y1: py }
    );
    x = px;
    y = py;
  }
  return steps.reverse();
}
function mergeSteps(steps) {
  const out = [];
  for (const s of steps) {
    const last = out[out.length - 1];
    if (last !== void 0 && last.x1 === s.x0 && last.y1 === s.y0) {
      last.x1 = s.x1;
      last.y1 = s.y1;
    } else out.push({ ...s });
  }
  return out;
}
function diffLines(oldText, newText) {
  if (oldText === newText) return [];
  const a = splitLines(oldText);
  const b = splitLines(newText);
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let s = 0;
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  const ma = a.slice(p, a.length - s);
  const mb = b.slice(p, b.length - s);
  const wholeMiddle = [{ x0: 0, y0: 0, x1: ma.length, y1: mb.length }];
  const steps = middleSteps(ma, mb) ?? wholeMiddle;
  const aStarts = startsOf(a);
  const bStarts = startsOf(b);
  return steps.map((st) => ({
    from: aStarts[p + st.x0] ?? 0,
    to: aStarts[p + st.x1] ?? 0,
    text: newText.slice(bStarts[p + st.y0] ?? 0, bStarts[p + st.y1] ?? 0)
  }));
}
function middleSteps(ma, mb) {
  if (ma.length === 0 || mb.length === 0) return [{ x0: 0, y0: 0, x1: ma.length, y1: mb.length }];
  const trace = myers(ma, mb, ma.map(fnv1a), mb.map(fnv1a));
  return trace === null ? null : mergeSteps(backtrack(trace, ma.length, mb.length));
}
var init_diff = __esm({
  "packages/provenance/src/core/diff.ts"() {
    "use strict";
    init_limits();
    init_lines();
  }
});

// packages/provenance/src/core/trim.ts
function isHigh4(code) {
  return code >= 55296 && code <= 56319;
}
function isLow4(code) {
  return code >= 56320 && code <= 57343;
}
function commonPrefix(a, b) {
  const max = Math.min(a.length, b.length);
  let n = 0;
  while (n < max && a.charCodeAt(n) === b.charCodeAt(n)) n++;
  return n;
}
function commonSuffix(a, b, max) {
  let n = 0;
  while (n < max && a.charCodeAt(a.length - 1 - n) === b.charCodeAt(b.length - 1 - n)) n++;
  return n;
}
function safePrefix(oldText, newText) {
  const p = commonPrefix(oldText, newText);
  if (p === 0) return 0;
  const last = oldText.charCodeAt(p - 1);
  if (isHigh4(last)) return p - 1;
  const splitsCrLf = last === CR && (oldText.charCodeAt(p) === LF || newText.charCodeAt(p) === LF);
  return splitsCrLf ? p - 1 : p;
}
function safeSuffix(oldText, newText, max) {
  const s = commonSuffix(oldText, newText, max);
  if (s === 0) return 0;
  const oi = oldText.length - s;
  const ni = newText.length - s;
  const first = oldText.charCodeAt(oi);
  const splitsPair = isLow4(first) ? isHigh4(oldText.charCodeAt(oi - 1)) || isHigh4(newText.charCodeAt(ni - 1)) : first === LF && (oldText.charCodeAt(oi - 1) === CR || newText.charCodeAt(ni - 1) === CR);
  return splitsPair ? s - 1 : s;
}
function commonAffixes(oldText, newText) {
  const prefix = safePrefix(oldText, newText);
  const room = Math.min(oldText.length, newText.length) - prefix;
  return { prefix, suffix: safeSuffix(oldText, newText, room) };
}
function trimHunk(oldDocText, hunk) {
  const oldText = oldDocText.slice(hunk.from, hunk.to);
  const newText = hunk.text;
  const { prefix, suffix } = commonAffixes(oldText, newText);
  const from = hunk.from + prefix;
  const to = hunk.to - suffix;
  const text = newText.slice(prefix, newText.length - suffix);
  if (from === to && text === "") return null;
  return { from, to, text };
}
var CR, LF;
var init_trim = __esm({
  "packages/provenance/src/core/trim.ts"() {
    "use strict";
    CR = 13;
    LF = 10;
  }
});

// packages/provenance/src/core/plan.ts
function existingRunNumbers(doc, windowRun) {
  const prefix = windowRun + ".";
  const out = [];
  for (const run of doc.runs) {
    if (!run.runId.startsWith(prefix)) continue;
    const tail = run.runId.slice(prefix.length);
    if (DIGITS2.test(tail)) out.push(Number(tail));
  }
  return out;
}
function provenanceFor(origin, windowRun, number, timestamp) {
  if (origin === "HUM") return { origin: "HUM", timestamp };
  return { origin: "AI", runId: runId(windowRun, number), timestamp };
}
function planHunks(hunks, origin, windowRun, existing, clock) {
  const timestamp = clock.nowIso();
  let next = existing.reduce((a, b) => Math.max(a, b), 0);
  const ascending = [...hunks].sort((a, b) => a.from - b.from);
  const ops = ascending.map((h) => {
    const number = h.text === "" ? 0 : ++next;
    const provenance = provenanceFor(origin, windowRun, number, timestamp);
    return { kind: "replace", from: h.from, to: h.to, text: h.text, provenance };
  });
  return ops.reverse();
}
var DIGITS2;
var init_plan = __esm({
  "packages/provenance/src/core/plan.ts"() {
    "use strict";
    init_label();
    DIGITS2 = /^[0-9]+$/;
  }
});

// packages/provenance/src/core/update.ts
function changeHunks(oldText, newText) {
  const { prefix, suffix } = commonAffixes(oldText, newText);
  const middle = diffLines(
    oldText.slice(prefix, oldText.length - suffix),
    newText.slice(prefix, newText.length - suffix)
  );
  return middle.map((h) => ({ from: h.from + prefix, to: h.to + prefix, text: h.text }));
}
function applyHunks(doc, hunks, fileText, origin, window, clock) {
  if (hunks.length === 0) return checked(doc, fileText);
  if (origin === "AI" && window === null) {
    return err({ kind: "no_open_window", detail: "an Agent_Change needs a Window_Run" });
  }
  const windowRun = window === null ? "" : window.windowRun;
  const trimmed = hunks.flatMap((h) => trimHunk(doc.text, h) ?? []);
  const ops = planHunks(trimmed, origin, windowRun, existingRunNumbers(doc, windowRun), clock);
  let current = doc;
  for (const op of ops) {
    const applied = apply(current, op);
    if (!applied.ok) return err({ kind: `apply_failed:${applied.error.kind}` });
    current = applied.value.document;
  }
  return checked(current, fileText);
}
function checked(doc, fileText) {
  if (doc.text !== fileText) return err({ kind: "apply_mismatch" });
  return ok(doc);
}
function updateRecord(doc, fileText, origin, window, clock) {
  return applyHunks(doc, changeHunks(doc.text, fileText), fileText, origin, window, clock);
}
function created(text, timestamp) {
  const doc = createDocument(text, timestamp);
  return doc.ok ? ok(doc.value) : err({ kind: `apply_failed:${doc.error.kind}` });
}
function firstRecord(baselineText, baselineAt, fileText, origin, window, clock) {
  if (baselineText === null) return created(fileText, clock.nowIso());
  const doc = created(baselineText, baselineAt);
  if (!doc.ok) return doc;
  return updateRecord(doc.value, fileText, origin, window, clock);
}
function appearedRecord(fileText, origin, window, clock) {
  const doc = created("", clock.nowIso());
  if (!doc.ok) return doc;
  return updateRecord(doc.value, fileText, origin, window, clock);
}
var init_update = __esm({
  "packages/provenance/src/core/update.ts"() {
    "use strict";
    init_src();
    init_diff();
    init_trim();
    init_plan();
  }
});

// packages/provenance/src/io/baseline-text.ts
async function fromGit(deps, root, entry) {
  if (entry.blob === void 0) return null;
  const blob = await catBlob(deps, root, entry.blob);
  return blob.ok && deps.sha256(blob.value) === entry.sha256 ? blob.value : null;
}
async function fromCache(deps, cache, entry) {
  const bytes = await cache.read(entry.sha256);
  return bytes !== null && deps.sha256(bytes) === entry.sha256 ? bytes : null;
}
async function resolveBaselineText(deps, root, cache, entry) {
  const bytes = await fromGit(deps, root, entry) ?? await fromCache(deps, cache, entry);
  return bytes === null ? null : decodeUtf8(bytes);
}
var init_baseline_text = __esm({
  "packages/provenance/src/io/baseline-text.ts"() {
    "use strict";
    init_git();
    init_scan2();
  }
});

// packages/provenance/src/core/renames.ts
function countByDigest(files) {
  const counts = /* @__PURE__ */ new Map();
  for (const file of files) counts.set(file.digest, (counts.get(file.digest) ?? 0) + 1);
  return counts;
}
function isPairable(digest) {
  return digest !== "" && digest !== EMPTY_SHA256;
}
function pairRenames(gone, appeared) {
  const goneCounts = countByDigest(gone);
  const appearedCounts = countByDigest(appeared);
  const target = /* @__PURE__ */ new Map();
  for (const file of appeared) target.set(file.digest, file.path);
  const pairs = [];
  for (const file of gone) {
    const to = target.get(file.digest);
    const unique = goneCounts.get(file.digest) === 1 && appearedCounts.get(file.digest) === 1;
    if (to !== void 0 && isPairable(file.digest) && unique) pairs.push({ from: file.path, to });
  }
  return pairs;
}
var EMPTY_SHA256;
var init_renames = __esm({
  "packages/provenance/src/core/renames.ts"() {
    "use strict";
    EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  }
});

// packages/provenance/src/io/recorder-work.ts
function fault4(w, path, reason) {
  return w.ctx.deps.log.fault({ event: w.ctx.event, path, reason });
}
function attribution(w) {
  const window = w.ctx.window;
  return window === null ? { origin: "HUM", window: null } : { origin: "AI", window };
}
function setHint(w, c, digest) {
  w.files.set(c.path, {
    size: c.size,
    mtimeMs: c.mtimeMs,
    digest,
    seenMs: w.ctx.deps.clock.nowMs()
  });
}
function hintTrusted(w, c) {
  const hint = w.files.get(c.path);
  const same = hint?.size === c.size && hint.mtimeMs === c.mtimeMs;
  return hint !== void 0 && same && hint.mtimeMs + RACY_MS <= hint.seenMs ? hint : null;
}
function removeEntry(w, path) {
  const entry = w.entries.get(path);
  if (entry === void 0) return;
  w.entries.delete(path);
  w.baselineChanged = true;
  w.release.add(entry.sha256);
}
async function loadRecord(w, path) {
  if (!w.recordPaths.has(path)) return null;
  const known = w.slots.get(path);
  if (known !== void 0) return known;
  const read = await w.ctx.store.readRecord(path);
  let slot = { kind: "unreadable" };
  if (read.ok && read.value !== null) slot = { kind: "doc", document: read.value.document };
  else if (!read.ok && read.error.kind === "tampered_record") slot = { kind: "tampered" };
  w.slots.set(path, slot);
  if (slot.kind === "tampered") await fault4(w, path, "tampered_record");
  if (slot.kind === "unreadable") await fault4(w, path, "read_failed");
  return slot;
}
async function commitRecord(w, c, read, doc) {
  const again = await w.ctx.deps.fs.lstat(`${w.ctx.root}/${c.path}`);
  const unchanged = again.ok && again.value.size === c.size && again.value.mtimeMs === c.mtimeMs;
  if (!unchanged || doc.text !== read.text) {
    w.files.delete(c.path);
    return false;
  }
  const written = await w.ctx.store.writeRecord(c.path, renderRecord(doc, null, "full").text);
  if (!written.ok) {
    w.files.delete(c.path);
    await fault4(w, c.path, "write_failed");
    return false;
  }
  w.recordPaths.add(c.path);
  w.slots.set(c.path, { kind: "doc", document: doc });
  setHint(w, c, read.sha256);
  return true;
}
async function removeTracked(w, path) {
  w.files.delete(path);
  const slot = await loadRecord(w, path);
  if (slot !== null && slot.kind !== "doc") return;
  if (slot !== null) {
    const removed = await w.ctx.store.deleteRecord(path);
    if (removed.ok) w.recordPaths.delete(path);
    else await fault4(w, path, "write_failed");
  }
  removeEntry(w, path);
}
var init_recorder_work = __esm({
  "packages/provenance/src/io/recorder-work.ts"() {
    "use strict";
    init_src();
    init_limits();
  }
});

// packages/provenance/src/io/recorder-moves.ts
async function goneFiles(w) {
  const paths = /* @__PURE__ */ new Set([...w.recordPaths, ...w.entries.keys()]);
  const gone = [];
  for (const path of [...paths].sort()) {
    if (w.present.has(path)) continue;
    const slot = await loadRecord(w, path);
    if (slot === null) gone.push({ path, digest: w.entries.get(path)?.sha256 ?? "" });
    else if (slot.kind === "doc") {
      gone.push({ path, digest: w.ctx.deps.sha256(encoder3.encode(slot.document.text)) });
    }
  }
  return gone;
}
async function moveRecord(w, pair, target) {
  const slot = await loadRecord(w, pair.from);
  if (slot === null || slot.kind !== "doc") return;
  const text = renderRecord(slot.document, null, "full").text;
  const written = await w.ctx.store.writeRecord(pair.to, text);
  if (!written.ok) {
    await fault4(w, pair.to, "write_failed");
    return;
  }
  w.recordPaths.add(pair.to);
  w.slots.set(pair.to, slot);
  await removeTracked(w, pair.from);
  w.files.set(pair.to, { ...hintOf(w, target), digest: target.read.sha256 });
}
function hintOf(w, target) {
  return {
    size: target.c.size,
    mtimeMs: target.c.mtimeMs,
    digest: target.read.sha256,
    seenMs: w.ctx.deps.clock.nowMs()
  };
}
async function movePair(w, pair, target) {
  const entry = w.entries.get(pair.from);
  if (entry === void 0) return moveRecord(w, pair, target);
  w.entries.delete(pair.from);
  w.entries.set(pair.to, entry);
  w.baselineChanged = true;
  w.files.delete(pair.from);
  w.files.set(pair.to, hintOf(w, target));
}
async function createAppeared(w, target) {
  if (w.baselineBad) return;
  const { origin, window } = attribution(w);
  const made = appearedRecord(target.read.text, origin, window, w.clock);
  if (!made.ok) {
    await fault4(w, target.c.path, made.error.kind);
    return;
  }
  const done2 = await commitRecord(w, target.c, target.read, made.value);
  if (done2 && origin === "HUM" && target.read.text !== "") w.outside = true;
}
async function settleMoves(w, appeared) {
  const gone = await goneFiles(w);
  const byPath = new Map(appeared.map((a) => [a.c.path, a]));
  const pairs = pairRenames(
    gone,
    appeared.map((a) => ({ path: a.c.path, digest: a.read.sha256 }))
  );
  const moved = new Set(pairs.map((p) => p.to));
  const paired = new Set(pairs.map((p) => p.from));
  for (const pair of pairs) await movePair(w, pair, byPath.get(pair.to));
  for (const { path } of gone) if (!paired.has(path)) await removeTracked(w, path);
  for (const target of appeared) if (!moved.has(target.c.path)) await createAppeared(w, target);
}
var encoder3;
var init_recorder_moves = __esm({
  "packages/provenance/src/io/recorder-moves.ts"() {
    "use strict";
    init_src();
    init_renames();
    init_update();
    init_recorder_work();
    encoder3 = new TextEncoder();
  }
});

// packages/provenance/src/io/recorder-files.ts
async function createWork(ctx, candidates2) {
  const baseline = ctx.baseline.ok ? ctx.baseline.value : null;
  const usable = ctx.stateStatus === "ok";
  const w = {
    ctx,
    clock: { nowIso: () => ctx.eventIso },
    baseline,
    baselineBad: !ctx.baseline.ok,
    baselineChanged: false,
    entries: new Map(Object.entries(baseline?.files ?? {})),
    recordPaths: new Set(await ctx.store.listRecords()),
    slots: /* @__PURE__ */ new Map(),
    files: new Map(usable ? Object.entries(ctx.state.files) : []),
    skipped: new Map(usable ? Object.entries(ctx.state.skipped) : []),
    present: new Set(candidates2.map((c) => c.path)),
    outside: false,
    release: /* @__PURE__ */ new Set()
  };
  if (ctx.stateStatus === "bad") await fault4(w, null, "bad_state");
  if (!ctx.baseline.ok) await fault4(w, null, "bad_baseline");
  for (const path of [...w.entries.keys()]) if (w.recordPaths.has(path)) removeEntry(w, path);
  return w;
}
async function updateExisting(w, c, read, slot) {
  if (slot.kind !== "doc") {
    w.files.delete(c.path);
    return;
  }
  if (slot.document.text === read.text) {
    setHint(w, c, read.sha256);
    return;
  }
  const { origin, window } = attribution(w);
  const next = updateRecord(slot.document, read.text, origin, window, w.clock);
  if (!next.ok) {
    w.files.delete(c.path);
    await fault4(w, c.path, next.error.kind);
    return;
  }
  if (await commitRecord(w, c, read, next.value) && origin === "HUM") w.outside = true;
}
async function firstChange(w, c, read, entry) {
  if (read.sha256 === entry.sha256) {
    setHint(w, c, read.sha256);
    return;
  }
  const { origin, window } = attribution(w);
  const deps = w.ctx.deps;
  const text = await resolveBaselineText(deps, w.ctx.root, w.ctx.cache, entry);
  const at = w.baseline?.at ?? w.ctx.eventIso;
  const made = firstRecord(text, at, read.text, origin, window, w.clock);
  if (!made.ok) {
    w.files.delete(c.path);
    await fault4(w, c.path, made.error.kind);
    return;
  }
  if (!await commitRecord(w, c, read, made.value)) return;
  removeEntry(w, c.path);
  if (text === null) await fault4(w, c.path, "baseline_text_unavailable");
  else if (origin === "HUM") w.outside = true;
}
async function handleText(w, c, read, appeared) {
  const slot = await loadRecord(w, c.path);
  if (slot !== null) return updateExisting(w, c, read, slot);
  const entry = w.entries.get(c.path);
  if (entry !== void 0) return firstChange(w, c, read, entry);
  appeared.push({ c, read });
}
async function handleRead(w, c, read, appeared) {
  if (read.kind !== "over_limit") w.skipped.delete(c.path);
  switch (read.kind) {
    case "text":
      return handleText(w, c, read, appeared);
    case "absent":
      w.present.delete(c.path);
      return;
    case "unreadable":
      w.files.delete(c.path);
      await fault4(w, c.path, "read_failed");
      return;
    case "binary":
      return removeTracked(w, c.path);
    case "over_limit":
      if (shouldLogOverLimit(Object.fromEntries(w.skipped), c.path, read.size, read.mtimeMs)) {
        await fault4(w, c.path, "over_limit");
      }
      w.skipped.set(c.path, { size: read.size, mtimeMs: read.mtimeMs, reason: "over_limit" });
      return removeTracked(w, c.path);
  }
}
function unchangedByHint(w, c) {
  const hint = hintTrusted(w, c);
  if (hint === null) return false;
  const entry = w.entries.get(c.path);
  return w.recordPaths.has(c.path) || entry !== void 0 && entry.sha256 === hint.digest;
}
function deadlineReason(left) {
  return `deadline_reached:${left}`;
}
function overDeadline(w) {
  return w.ctx.deps.clock.nowMs() - w.ctx.startMs > HOOK_DEADLINE_MS;
}
async function visitAll(w, candidates2, appeared) {
  for (const [i, c] of candidates2.entries()) {
    if (overDeadline(w)) {
      const left = candidates2.length - i;
      await fault4(w, null, deadlineReason(left));
      return left;
    }
    if (unchangedByHint(w, c)) continue;
    const read = await readCandidate(w.ctx.deps, w.ctx.root, c);
    await handleRead(w, c, read, appeared);
  }
  return 0;
}
async function finishBaseline(w) {
  if (!w.baselineChanged || w.baseline === null) return;
  const next = { ...w.baseline, files: Object.fromEntries(w.entries) };
  const written = await w.ctx.store.writeBaseline(next);
  if (!written.ok) {
    await fault4(w, null, "write_failed");
    return;
  }
  for (const digest of w.release) {
    const freed = await w.ctx.cache.release(digest, next);
    if (!freed.ok) await fault4(w, null, "write_failed");
  }
}
async function recordFiles(ctx, candidates2) {
  const w = await createWork(ctx, candidates2);
  const appeared = [];
  const notReached = await visitAll(w, candidates2, appeared);
  await settleMoves(w, appeared);
  await finishBaseline(w);
  for (const path of [...w.files.keys()]) if (!w.present.has(path)) w.files.delete(path);
  for (const path of [...w.skipped.keys()]) if (!w.present.has(path)) w.skipped.delete(path);
  const state = {
    ...ctx.state,
    files: Object.fromEntries(w.files),
    skipped: Object.fromEntries(w.skipped)
  };
  return { state, outsideFound: w.outside, notReached };
}
var init_recorder_files = __esm({
  "packages/provenance/src/io/recorder-files.ts"() {
    "use strict";
    init_limits();
    init_update();
    init_faults();
    init_baseline_text();
    init_scan2();
    init_recorder_moves();
    init_recorder_work();
  }
});

// packages/provenance/src/io/stdin.ts
async function collect2(source, gate) {
  const chunks = [];
  let total = 0;
  try {
    for await (const chunk of source) {
      if (gate.stopped) return null;
      total += chunk.length;
      if (total > STDIN_MAX) return null;
      chunks.push(chunk);
    }
  } catch {
    return null;
  }
  const all = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    all.set(chunk, at);
    at += chunk.length;
  }
  return all;
}
function decode(bytes) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return "";
  }
}
async function readStdin(deps) {
  const gate = { stopped: false };
  const timer = deps.clock.timer(STDIN_WAIT_MS);
  const reading = collect2(deps.stdin, gate);
  const bytes = await Promise.race([reading, timer.done.then(() => null)]);
  timer.cancel();
  gate.stopped = true;
  return bytes === null ? "" : decode(bytes);
}
var init_stdin = __esm({
  "packages/provenance/src/io/stdin.ts"() {
    "use strict";
    init_limits();
  }
});

// packages/provenance/src/io/recorder.ts
function parseEvent(name) {
  return EVENTS.find((e) => e === name) ?? null;
}
function normalizeDir(path) {
  const slashed = path.replace(/\\/gu, "/");
  return slashed.length > 1 && slashed.endsWith("/") ? slashed.slice(0, -1) : slashed;
}
function isAbsolute(path) {
  return path.startsWith("/") || /^[A-Za-z]:\//u.test(path);
}
function parentOf(dir) {
  const cut = dir.lastIndexOf("/");
  if (cut < 0) return null;
  if (cut === 0) return dir === "/" ? null : "/";
  return dir.slice(0, cut);
}
async function holdsRecordDir(deps, dir) {
  const base = dir === "/" ? "" : dir;
  const stat = await deps.fs.lstat(`${base}/.kiro/provenance`);
  return stat.ok && stat.value.kind === "dir";
}
async function findWorkspaceRoot(deps, cwd, payloadCwd) {
  for (let dir = normalizeDir(cwd); dir !== null; dir = parentOf(dir)) {
    if (await holdsRecordDir(deps, dir)) return dir;
  }
  if (payloadCwd === null) return null;
  const given = normalizeDir(payloadCwd);
  return isAbsolute(given) && await holdsRecordDir(deps, given) ? given : null;
}
function log(ctx, reason) {
  return ctx.deps.log.fault({ event: ctx.event, path: null, reason });
}
async function logAll(ctx, step3) {
  for (const f of step3.faults) await log(ctx, f.kind);
}
function emptyState(nowMs) {
  return {
    version: 1,
    order: 0,
    lastWindowRun: null,
    lastEventAt: null,
    recordedAtMs: nowMs,
    noSessionIdLogged: false,
    sessions: {},
    files: {},
    skipped: {}
  };
}
async function loadState(store, nowMs) {
  const read = await store.readState();
  let status = "ok";
  if (!read.ok) status = "bad";
  else if (read.value === null) status = "absent";
  return {
    status,
    state: read.ok && read.value !== null ? read.value : emptyState(nowMs)
  };
}
async function sweepAndLeftover(ctx, state, key, nowMs) {
  const swept = sweepStale(state, nowMs);
  await logAll(ctx, swept);
  if (ctx.event !== "promptSubmit" || key === null) return swept.state;
  const left = closeLeftover(swept.state, key);
  await logAll(ctx, left);
  return left.state;
}
async function addSession(ctx) {
  const count = await ctx.store.readSessions();
  if (!count.ok) {
    await log(ctx, "bad_sessions");
    return false;
  }
  const written = await ctx.store.writeSessions(count.value + 1);
  if (!written.ok) await log(ctx, "write_failed");
  return written.ok;
}
function unflagSession(state, key) {
  const entry = Object.hasOwn(state.sessions, key) ? state.sessions[key] : void 0;
  if (entry === void 0) return state;
  return { ...state, sessions: { ...state.sessions, [key]: { ...entry, noPromptCounted: false } } };
}
async function settleSession(ctx, done2, key) {
  for (const f of done2.faults) if (f.kind !== "no_prompt_events") await log(ctx, f.kind);
  if (!done2.countSession || key === null) return done2.state;
  if (!await addSession(ctx)) return unflagSession(done2.state, key);
  await log(ctx, "no_prompt_events");
  return done2.state;
}
async function runLocked(ctx) {
  const { deps, store, event, payload } = ctx;
  const startMs = deps.clock.nowMs();
  const eventIso = deps.clock.nowIso();
  const loaded = await loadState(store, startMs);
  const key = event === "manual" ? null : sessionKey(payload);
  const state = await sweepAndLeftover(ctx, loaded.state, key, startMs);
  const chosen = select(state, key);
  const cache = createBaselineCache(deps, store.cacheDir());
  const candidates2 = await listCandidates(deps, ctx.root);
  const outcome = await recordFiles(
    {
      deps,
      root: ctx.root,
      store,
      cache,
      event,
      state,
      stateStatus: loaded.status,
      baseline: await store.readBaseline(),
      window: chosen === null ? null : { windowRun: chosen.windowRun },
      eventIso,
      startMs
    },
    candidates2.files
  );
  const clock = { nowIso: () => eventIso };
  const done2 = transition(outcome.state, event, key, payload, clock, outcome.outsideFound);
  const next = await settleSession(ctx, done2, key);
  const written = await store.writeState({ ...next, recordedAtMs: startMs });
  if (!written.ok) await log(ctx, "write_failed");
}
async function recordInRoot(ctx) {
  const taken = await acquireLock(ctx.deps, `${ctx.store.dir}/lock`);
  if (!taken.ok) {
    await log(ctx, taken.error.kind);
    return;
  }
  try {
    await runLocked(ctx);
  } finally {
    await taken.value.release();
  }
}
async function runRecord(deps, name, cwd, onLog = () => void 0) {
  const event = parseEvent(name);
  const raw = event === null || event === "manual" ? "" : await readStdin(deps);
  const payload = parsePayload(raw);
  const root = await findWorkspaceRoot(deps, cwd, payload.cwd);
  if (root === null) return;
  const store = createStore(deps, `${root}/.kiro/provenance`);
  const logger = createFaultLog(deps, `${store.dir}/errors.log`);
  onLog(logger);
  const live = { ...deps, log: logger };
  if (event === null) {
    await logger.fault({ event: "unknown", path: null, reason: "unknown_event" });
    return;
  }
  await recordInRoot({ deps: live, root, store, event, payload });
}
var EVENTS;
var init_recorder = __esm({
  "packages/provenance/src/io/recorder.ts"() {
    "use strict";
    init_payload();
    init_windows();
    init_baseline_cache();
    init_faults();
    init_lock();
    init_recorder_files();
    init_scan2();
    init_stdin();
    init_store();
    EVENTS = ["promptSubmit", "agentStop", "preTask", "postTask", "manual"];
  }
});

// packages/provenance/src/core/neutralize.ts
function replacement(code) {
  if (code === 10 || code === 9) return null;
  if (code < 32) return String.fromCharCode(9216 + code);
  if (code === 127) return "\u2421";
  if (code >= 128 && code <= 159) return "\uFFFD";
  return null;
}
function neutralize(text) {
  let out = "";
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charAt(i);
    out += replacement(ch.charCodeAt(0)) ?? ch;
  }
  return out;
}
var init_neutralize = __esm({
  "packages/provenance/src/core/neutralize.ts"() {
    "use strict";
  }
});

// packages/provenance/src/core/check.ts
function recordName(path) {
  return `.kiro/provenance/records/${path}.reveal`;
}
function line(reason, path, name) {
  const label = FAIL_REASONS.has(reason) ? "fail" : "report";
  return { label, reason, path, text: `${label} ${reason}: ${name}` };
}
function compareCodeUnits(a, b) {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}
function recordLines(file, record, hasEntry) {
  const out = [];
  if (hasEntry) out.push(line("orphan_baseline", file.path, file.path));
  if (!record.ok) out.push(line("tampered_record", file.path, recordName(file.path)));
  else if (!hasEntry && record.text !== file.text) out.push(line("stale", file.path, file.path));
  return out;
}
function fileLines(facts, file) {
  const record = Object.hasOwn(facts.records, file.path) ? facts.records[file.path] : void 0;
  const entry = Object.hasOwn(facts.entries, file.path) ? facts.entries[file.path] : void 0;
  if (record !== void 0) return recordLines(file, record, entry !== void 0);
  if (entry === void 0) return [line("no_record", file.path, file.path)];
  return entry === file.digest ? [] : [line("stale", file.path, file.path)];
}
function orphanLines(facts, tracked) {
  const out = [];
  for (const path of Object.keys(facts.records)) {
    if (!tracked.has(path)) out.push(line("orphan_record", path, recordName(path)));
  }
  for (const path of Object.keys(facts.entries)) {
    if (!tracked.has(path)) out.push(line("orphan_baseline", path, path));
  }
  return out;
}
function checkWorkspace(facts) {
  const tracked = new Set(facts.files.map((file) => file.path));
  const all = [
    ...facts.files.flatMap((file) => fileLines(facts, file)),
    ...orphanLines(facts, tracked)
  ].sort((a, b) => compareCodeUnits(a.path, b.path));
  const failures = all.filter((item) => item.label === "fail");
  const reports = all.filter((item) => item.label === "report");
  const lines = all.map((item) => item.text);
  if (all.length === 0) lines.push(`checked ${String(facts.files.length)} files: ok`);
  if (reports.length > 0) lines.push(RECORD_HINT);
  const status = failures.length > 0 || facts.strict && reports.length > 0 ? 1 : 0;
  return { failures, reports, lines, status };
}
var RECORD_HINT, FAIL_REASONS;
var init_check2 = __esm({
  "packages/provenance/src/core/check.ts"() {
    "use strict";
    RECORD_HINT = "run: reveal --record";
    FAIL_REASONS = /* @__PURE__ */ new Set([
      "tampered_record",
      "orphan_record",
      "orphan_baseline"
    ]);
  }
});

// packages/provenance/src/core/legend.ts
function legendLines(wording = "tag") {
  return LEGEND_ITEMS.map((item) => {
    const code = wording === "run" ? item.code.replace("<tag>", "<run>") : item.code;
    return `${code} ${item.words}`;
  });
}
function humNotice() {
  return legendLines()[2] ?? "";
}
function staleLine(path, unrecorded) {
  return `stale: ${path} changed after the last recorded event; ${String(unrecorded)} characters not yet recorded; run: reveal --record`;
}
function noPromptSessionsLine(count) {
  return `Sessions with no prompt events: ${String(count)} counted. In such a session an edit the agent made between tasks is recorded as [HUM]. The count can miss sessions or count one twice; see Limits.`;
}
var LEGEND_ITEMS;
var init_legend = __esm({
  "packages/provenance/src/core/legend.ts"() {
    "use strict";
    LEGEND_ITEMS = [
      { code: "[AI:<tag>]", words: "changed while the agent was working, with the run it belongs to" },
      {
        code: "[AI>HUM:<tag>]",
        words: "agent text in a run that the Engine counts as edited while no agent window was open"
      },
      {
        code: "[HUM]",
        words: "changed while no agent window was open; typing, pasting and other tools are not told apart"
      },
      { code: "[PST]", words: "already in the file when recording started; origin not recorded" }
    ];
  }
});

// packages/provenance/src/core/summary-types.ts
function formatShare(part, whole) {
  const tenths = whole === 0 ? 0 : Math.round(part * 1e3 / whole);
  return `${String(Math.floor(tenths / 10))}.${String(tenths % 10)}`;
}
var ORIGINS3;
var init_summary_types = __esm({
  "packages/provenance/src/core/summary-types.ts"() {
    "use strict";
    ORIGINS3 = ["AI", "AI>HUM", "HUM", "PST"];
  }
});

// packages/provenance/src/core/summary-render.ts
function alignTable(columns, rows) {
  const all = [columns.map((c) => c.head), ...rows];
  const widths = columns.map((_, i) => Math.max(...all.map((r) => width(r[i] ?? ""))));
  return all.map(
    (row) => columns.map((c, i) => {
      const cell = row[i] ?? "";
      const pad = " ".repeat((widths[i] ?? 0) - width(cell));
      return c.right ? pad + cell : cell + pad;
    }).join("  ").trimEnd()
  );
}
function countsLine(counts, characters) {
  const parts = ORIGINS3.map(
    (o) => `${o} ${String(counts[o])} (${formatShare(counts[o], characters)}%)`
  );
  return `${String(characters)} characters: ${parts.join(", ")}`;
}
function stretchLine(s) {
  const where = `${s.path}:${String(s.firstLine)}-${String(s.lastLine)}`;
  return `${where}  ${String(s.length)} chars  ${s.words}  opened ${s.openedAt ?? "-"}`;
}
function windowTable(windows) {
  const columns = [
    { head: "Task", right: false },
    { head: "Label", right: false },
    { head: "Opened", right: false },
    { head: "Files", right: true },
    { head: "Runs", right: true },
    { head: "AI", right: true },
    { head: "AI>HUM", right: true }
  ];
  const rows = windows.map((w) => [
    w.taskNumber ?? "-",
    w.title,
    w.openedAt ?? "-",
    String(w.files),
    String(w.runs),
    String(w.ai),
    String(w.aiHuman)
  ]);
  return alignTable(columns, rows);
}
function fileTable(files) {
  const columns = [
    { head: "File", right: false },
    { head: "Characters", right: true },
    ...ORIGINS3.map((o) => ({ head: o, right: true })),
    { head: "", right: false }
  ];
  const rows = files.map((f) => [
    f.path,
    String(f.characters),
    ...ORIGINS3.map((o) => `${String(f.counts[o])} (${formatShare(f.counts[o], f.characters)}%)`),
    f.stale ? "stale" : ""
  ]);
  return alignTable(columns, rows);
}
function unchangedLine(n) {
  const files = n === 1 ? "1 file" : `${String(n)} files`;
  return `${files} unchanged since recording started, all [PST].`;
}
function sessionsLines(sessions) {
  if (sessions === "unreadable") return [UNREADABLE];
  return sessions > 0 ? [noPromptSessionsLine(sessions)] : [];
}
function closingLines(sessions) {
  return [humNotice(), ...sessionsLines(sessions)];
}
function renderSummary(summary, sessions) {
  const out = [`Total: ${countsLine(summary.total, summary.totalCharacters)}`];
  out.push("Largest untouched agent stretches:");
  if (summary.stretches.length === 0) out.push("none");
  for (const s of summary.stretches) out.push(stretchLine(s));
  out.push(`AI>HUM characters left out of this list: ${String(summary.omittedAiHuman)}`);
  out.push("Agent text by window:");
  if (summary.windows.length === 0) out.push("none");
  else out.push(...windowTable(summary.windows));
  out.push("Files:", ...fileTable(summary.listed));
  if (!summary.all) out.push(unchangedLine(summary.unchangedCount));
  out.push(...closingLines(sessions));
  return out;
}
var UNREADABLE, width;
var init_summary_render = __esm({
  "packages/provenance/src/core/summary-render.ts"() {
    "use strict";
    init_legend();
    init_summary_types();
    UNREADABLE = "Sessions with no prompt events: the count is unreadable (sessions.json does not parse).";
    width = (text) => Array.from(text).length;
  }
});

// packages/provenance/src/core/summary.ts
function emptyCounts() {
  return { AI: 0, "AI>HUM": 0, HUM: 0, PST: 0 };
}
function compareCodeUnits2(a, b) {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}
function normalizePath(path) {
  if (path === null) return null;
  const cleaned = path.replace(/^(\.\/)+/u, "").replace(/\/+$/u, "");
  return cleaned === "" || cleaned === "." ? null : cleaned;
}
function under(path, scope) {
  return scope === null || path === scope || path.startsWith(scope + "/");
}
function windowRunOf(runId2) {
  const name = parseRunId(runId2);
  return name.n === null ? runId2 : runId2.slice(0, runId2.lastIndexOf("."));
}
function recordFile(record) {
  const counts = emptyCounts();
  for (const span of record.doc.spans) counts[span.provenance.origin] += span.end - span.start;
  return { path: record.path, stale: record.stale, characters: record.doc.text.length, counts };
}
function unchangedFile(file) {
  const counts = { ...emptyCounts(), PST: file.length };
  return { path: file.path, stale: file.stale, characters: file.length, counts };
}
function stretchesOf(record) {
  const index = createLineIndex(record.doc.text);
  const out = [];
  for (const span of record.doc.spans) {
    const run = span.provenance.runId;
    if (span.provenance.origin !== "AI" || span.end <= span.start || run === void 0) continue;
    const name = parseRunId(run);
    out.push({
      path: record.path,
      firstLine: positionAt(index, span.start).line,
      lastLine: positionAt(index, span.end - 1).line,
      offset: span.start,
      length: span.end - span.start,
      run,
      windowRun: windowRunOf(run),
      taskNumber: name.taskNumber,
      title: name.title,
      openedAt: name.time,
      words: describeRun(name.taskNumber, name.title)
    });
  }
  return out;
}
function compareStretches(a, b) {
  return b.length - a.length || compareCodeUnits2(a.path, b.path) || a.offset - b.offset;
}
function windowRows(records) {
  const acc = /* @__PURE__ */ new Map();
  for (const record of records) {
    for (const span of record.doc.spans) {
      const { origin, runId: runId2 } = span.provenance;
      if (origin !== "AI" && origin !== "AI>HUM" || runId2 === void 0) continue;
      const key = windowRunOf(runId2);
      const name = parseRunId(runId2);
      const row = {
        windowRun: key,
        taskNumber: name.taskNumber,
        title: name.title,
        openedAt: name.time,
        files: 0,
        runs: 0,
        ai: 0,
        aiHuman: 0
      };
      const entry = acc.get(key) ?? { row, files: /* @__PURE__ */ new Set(), runs: /* @__PURE__ */ new Set() };
      entry.files.add(record.path);
      entry.runs.add(record.path + "\0" + runId2);
      if (origin === "AI") entry.row.ai += span.end - span.start;
      else entry.row.aiHuman += span.end - span.start;
      acc.set(key, entry);
    }
  }
  return [...acc.values()].map((e) => ({ ...e.row, files: e.files.size, runs: e.runs.size })).sort(compareWindows);
}
function compareWindows(a, b) {
  if (a.openedAt !== b.openedAt) {
    if (a.openedAt === null) return 1;
    if (b.openedAt === null) return -1;
    return compareCodeUnits2(a.openedAt, b.openedAt);
  }
  return compareCodeUnits2(a.windowRun, b.windowRun);
}
function isListed(file) {
  const { AI, "AI>HUM": aiHuman, HUM } = file.counts;
  return file.stale || AI + aiHuman + HUM > 0;
}
function buildSummary(records, unchanged, top, all) {
  const files = [...records.map(recordFile), ...unchanged.map(unchangedFile)].sort(
    (a, b) => compareCodeUnits2(a.path, b.path)
  );
  const total = emptyCounts();
  for (const file of files) for (const o of ORIGINS3) total[o] += file.counts[o];
  const stretches = records.flatMap(stretchesOf).sort(compareStretches);
  const listed = all ? files : files.filter(isListed);
  return {
    files,
    total,
    totalCharacters: files.reduce((sum, f) => sum + f.characters, 0),
    stretches: stretches.slice(0, Math.max(0, top)),
    omittedAiHuman: total["AI>HUM"],
    windows: windowRows(records),
    listed,
    unchangedCount: files.length - listed.length,
    all
  };
}
function summarize(input) {
  if (input.records.length === 0 && input.unchanged.length === 0) {
    return { status: 1, lines: [NOTHING_RECORDED], text: NOTHING_RECORDED, summary: null };
  }
  const scope = normalizePath(input.path);
  const records = input.records.filter((r) => under(r.path, scope));
  const unchanged = input.unchanged.filter((u) => under(u.path, scope));
  const summary = records.length + unchanged.length === 0 ? null : buildSummary(records, unchanged, input.top ?? DEFAULT_TOP, input.all === true);
  const lines = summary === null ? [`Nothing recorded under ${scope ?? ""}.`, ...sessionsLines(input.sessions)] : renderSummary(summary, input.sessions);
  return { status: 0, lines, text: lines.join("\n"), summary };
}
var DEFAULT_TOP, NOTHING_RECORDED;
var init_summary = __esm({
  "packages/provenance/src/core/summary.ts"() {
    "use strict";
    init_label();
    init_lines();
    init_summary_render();
    init_summary_types();
    DEFAULT_TOP = 10;
    NOTHING_RECORDED = "Nothing is recorded. Run setup_provenance to start recording.";
  }
});

// packages/provenance/src/io/load.ts
async function loadRecord2(store, path) {
  const read = await store.readRecord(path);
  if (read.ok) {
    const document = read.value?.document;
    return ok(document === void 0 ? null : { ok: true, text: document.text, doc: document });
  }
  return read.error.kind === "tampered_record" ? ok({ ok: false }) : err(read.error);
}
async function loadRecords(store) {
  const records = {};
  for (const path of (await store.listRecords()).sort()) {
    const loaded = await loadRecord2(store, path);
    if (!loaded.ok) return loaded;
    if (loaded.value !== null) records[path] = loaded.value;
  }
  return ok(records);
}
async function readTexts(deps, root, list) {
  const files = [];
  for (let i = 0; i < list.length; i += READ_BATCH2) {
    const batch = list.slice(i, i + READ_BATCH2);
    const reads = await Promise.all(batch.map((c) => readCandidate(deps, root, c)));
    reads.forEach((read, j) => {
      if (read.kind === "text") {
        files.push({ path: batch[j].path, digest: read.sha256, text: read.text });
      }
    });
  }
  return files;
}
function entryDigests(baseline) {
  return Object.fromEntries(Object.entries(baseline?.files ?? {}).map(([p, e]) => [p, e.sha256]));
}
async function loadSessions(store) {
  const read = await store.readSessions();
  return read.ok ? read.value : "unreadable";
}
async function loadWorkspace(deps, root) {
  const store = createStore(deps, `${root}/.kiro/provenance`);
  const records = await loadRecords(store);
  if (!records.ok) return records;
  const baseline = await store.readBaseline();
  if (!baseline.ok) return baseline;
  const list = await listCandidates(deps, root);
  return ok({
    root,
    files: await readTexts(deps, root, list.files),
    records: records.value,
    entries: entryDigests(baseline.value),
    baseline: baseline.value,
    sessions: await loadSessions(store)
  });
}
async function readFileAt(deps, root, path) {
  const stat = await deps.fs.lstat(`${root}/${path}`);
  if (!stat.ok || stat.value.kind !== "file") return { kind: "absent" };
  const { size, mtimeMs } = stat.value;
  return readCandidate(deps, root, { path, size, mtimeMs });
}
async function baselineTextOf(deps, root, entry, read) {
  if (entry === null || read.kind === "text" && read.sha256 === entry.sha256) return null;
  const cache = createBaselineCache(deps, createStore(deps, `${root}/.kiro/provenance`).cacheDir());
  return resolveBaselineText(deps, root, cache, entry);
}
async function loadFile(deps, root, path) {
  const store = createStore(deps, `${root}/.kiro/provenance`);
  const record = await loadRecord2(store, path);
  if (!record.ok) return record;
  const baseline = await store.readBaseline();
  if (!baseline.ok) return baseline;
  const read = await readFileAt(deps, root, path);
  const entry = baseline.value?.files[path] ?? null;
  return ok({
    read,
    record: record.value,
    entry,
    baselineAt: baseline.value?.at ?? null,
    baselineText: await baselineTextOf(deps, root, entry, read),
    listed: record.value !== null || entry !== null ? null : await isListed2(deps, root, path)
  });
}
async function isListed2(deps, root, path) {
  return (await listCandidates(deps, root)).files.some((c) => c.path === path);
}
function checkFactsOf(facts, strict) {
  const records = {};
  for (const [path, r] of Object.entries(facts.records)) {
    records[path] = r.ok ? { ok: true, text: r.text } : { ok: false };
  }
  return { files: facts.files, records, entries: facts.entries, strict };
}
function summaryInputOf(facts, scope, top, all) {
  const byPath = new Map(facts.files.map((f) => [f.path, f]));
  const records = Object.entries(facts.records).flatMap(
    ([path, r]) => r.ok ? [{ path, doc: r.doc, stale: byPath.get(path)?.text !== r.text }] : []
  );
  const unchanged = Object.entries(facts.entries).flatMap(([path, digest]) => {
    const file = byPath.get(path);
    const keep = !Object.hasOwn(facts.records, path);
    return keep && file !== void 0 ? [{ path, length: file.text.length, stale: file.digest !== digest }] : [];
  });
  return {
    records,
    unchanged,
    path: scope,
    sessions: facts.sessions,
    ...top ? { top } : {},
    ...all ? { all } : {}
  };
}
function unchangedDocument(text, baselineAt) {
  const doc = createDocument(text, baselineAt);
  return doc.ok ? doc.value : null;
}
var READ_BATCH2;
var init_load = __esm({
  "packages/provenance/src/io/load.ts"() {
    "use strict";
    init_src();
    init_baseline_cache();
    init_baseline_text();
    init_scan2();
    init_store();
    READ_BATCH2 = 64;
  }
});

// packages/provenance/src/io/reveal-report.ts
function parseSummaryArgs(args) {
  let path = null;
  let top;
  let all = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--top") {
      const value = args[i += 1];
      if (value === void 0 || !/^[1-9][0-9]*$/u.test(value) || top !== void 0) return null;
      top = Number(value);
    } else if (arg === "--all") {
      if (all) return null;
      all = true;
    } else if (arg.startsWith("--") || path !== null) {
      return null;
    } else {
      path = arg;
    }
  }
  return { path, top, all };
}
function parseCheckArgs(args) {
  if (args.length === 0) return { strict: false };
  return args.length === 1 && args[0] === "--strict" ? { strict: true } : null;
}
function printable(lines) {
  return lines.map((line2) => neutralize(line2)).join("\n");
}
function unreadable(kind) {
  return { status: 1, text: `Records cannot be read: ${kind}` };
}
async function summaryReport(deps, root, scope, top, all = false) {
  const loaded = await loadWorkspace(deps, root);
  if (!loaded.ok) return unreadable(loaded.error.kind);
  const result = summarize(summaryInputOf(loaded.value, scope, top, all));
  return { status: result.status, text: printable(result.lines) };
}
async function checkReport(deps, root, strict) {
  const loaded = await loadWorkspace(deps, root);
  if (!loaded.ok) return unreadable(loaded.error.kind);
  const result = checkWorkspace(checkFactsOf(loaded.value, strict));
  return { status: result.status, text: printable(result.lines) };
}
var init_reveal_report = __esm({
  "packages/provenance/src/io/reveal-report.ts"() {
    "use strict";
    init_check2();
    init_neutralize();
    init_summary();
    init_load();
  }
});

// packages/provenance/src/core/palette.ts
function parseHex(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
}
function distance(a, b) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}
function candidates() {
  const out = [];
  CUBE_LEVELS.forEach((r, ri) => {
    CUBE_LEVELS.forEach((g, gi) => {
      CUBE_LEVELS.forEach((b, bi) => {
        out.push({ index: 16 + 36 * ri + 6 * gi + bi, rgb: [r, g, b] });
      });
    });
  });
  for (let i = 0; i < 24; i += 1) {
    const v = 8 + 10 * i;
    out.push({ index: 232 + i, rgb: [v, v, v] });
  }
  return out;
}
function nearest256(hex) {
  const want = parseHex(hex);
  let best = CANDIDATES[0];
  if (best === void 0) return 16;
  let bestDistance = distance(want, best.rgb);
  for (const c of CANDIDATES) {
    const d = distance(want, c.rgb);
    if (d < bestDistance) {
      best = c;
      bestDistance = d;
    }
  }
  return best.index;
}
function colourSequence(hex, layer, mode) {
  const base = layer === "fg" ? 38 : 48;
  if (mode === "ansi256") return `\x1B[${String(base)};5;${String(nearest256(hex))}m`;
  const [r, g, b] = parseHex(hex);
  return `\x1B[${String(base)};2;${String(r)};${String(g)};${String(b)}m`;
}
function onBody(fg, mode) {
  return colourSequence(fg, "fg", mode) + colourSequence(PANE.body, "bg", mode);
}
var PANE, RESET, ERASE_LINE, LINE_END, CUBE_LEVELS, CANDIDATES;
var init_palette = __esm({
  "packages/provenance/src/core/palette.ts"() {
    "use strict";
    PANE = {
      body: "#0F2766",
      text: "#E8ECF6",
      title: "#FFFFFF",
      legend: "#BAC4E2",
      origin: { HUM: "#E8ECF6", PST: "#F5D98B", AI: "#A6D4F7", "AI>HUM": "#D7C6F5" }
    };
    RESET = "\x1B[0m";
    ERASE_LINE = "\x1B[K";
    LINE_END = ERASE_LINE + RESET;
    CUBE_LEVELS = [0, 95, 135, 175, 215, 255];
    CANDIDATES = candidates();
  }
});

// packages/provenance/src/core/runs-list.ts
function description(w) {
  return neutralize(w.title).replace(/[\n\t]/gu, " ");
}
function hunkWords(n) {
  return `${String(n)} ${n === 1 ? "hunk" : "hunks"}`;
}
function runsListLines(windows, escape) {
  const descs = windows.map(description);
  const opened = windows.map((w) => `opened ${w.time ?? "?"}`);
  const hunks = windows.map((w) => hunkWords(w.hunks));
  const widest = (cells) => Math.max(0, ...cells.map(width2));
  const [tagW, descW, openedW, hunkW] = [
    widest(windows.map((w) => w.tag)),
    widest(descs),
    widest(opened),
    widest(hunks)
  ];
  const lines = windows.map((w, i) => {
    const desc = descs[i] ?? "";
    const shown2 = escape ? escapeText2(desc) : desc;
    const tag = w.tag + " ".repeat(tagW - width2(w.tag));
    const gap = " ".repeat(descW - width2(desc));
    const open2 = (opened[i] ?? "") + " ".repeat(openedW - width2(opened[i] ?? ""));
    const count = " ".repeat(hunkW - width2(hunks[i] ?? "")) + (hunks[i] ?? "");
    return `${INDENT}${tag}  ${shown2}${gap}  ${open2}  ${count}`;
  });
  return [RUNS_HEADING, ...lines];
}
var RUNS_HEADING, INDENT, width2, escapeText2;
var init_runs_list = __esm({
  "packages/provenance/src/core/runs-list.ts"() {
    "use strict";
    init_neutralize();
    RUNS_HEADING = "Runs in this file";
    INDENT = "  ";
    width2 = (text) => Array.from(text).length;
    escapeText2 = (text) => text.replace(/[\\[\]]/gu, "\\$&");
  }
});

// packages/provenance/src/core/tags.ts
function windowRunOf2(runId2) {
  return runId2.replace(HUNK_SUFFIX, "");
}
function baseOf(taskNumber, title) {
  if (taskNumber !== null) return taskNumber;
  return title === "turn" ? "turn" : "task";
}
function groupOf(runId2) {
  const name = parseRunId(runId2);
  return {
    windowRun: windowRunOf2(runId2),
    taskNumber: name.taskNumber,
    title: name.title,
    time: name.time,
    base: baseOf(name.taskNumber, name.title),
    hunks: 0,
    runIds: /* @__PURE__ */ new Set()
  };
}
function byOpening(a, b) {
  return compareUnits(a.time ?? "", b.time ?? "") || compareUnits(a.windowRun, b.windowRun);
}
function assignTags(runIds) {
  const groups = /* @__PURE__ */ new Map();
  for (const id of runIds) {
    const key = windowRunOf2(id);
    const group = groups.get(key) ?? groupOf(id);
    group.runIds.add(id);
    groups.set(key, group);
  }
  const seen = /* @__PURE__ */ new Map();
  return [...groups.values()].sort(byOpening).map((g) => {
    const k = (seen.get(g.base) ?? 0) + 1;
    seen.set(g.base, k);
    const { base, runIds: ids, ...rest } = g;
    return { ...rest, tag: k === 1 ? base : `${base}~${String(k)}`, hunks: ids.size };
  });
}
var HUNK_SUFFIX, compareUnits;
var init_tags = __esm({
  "packages/provenance/src/core/tags.ts"() {
    "use strict";
    init_label();
    HUNK_SUFFIX = /\.\d+$/u;
    compareUnits = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  }
});

// packages/provenance/src/core/view.ts
function headerLine(path) {
  return `Reveal Codes: ${neutralize(path)}`;
}
function agentRun(span) {
  const { provenance } = span;
  if (provenance.origin !== "AI" && provenance.origin !== "AI>HUM") return null;
  return provenance.runId ?? null;
}
function runIdsOf(doc) {
  return doc.spans.flatMap((span) => agentRun(span) ?? []);
}
function tagged(span, tags) {
  const run = agentRun(span);
  const tag = run === null ? void 0 : tags.get(windowRunOf2(run));
  if (tag === void 0 || span.provenance.origin === "HUM") return span;
  if (span.provenance.origin === "PST") return span;
  return { ...span, provenance: { ...span.provenance, runId: tag } };
}
function provenanceOnly(doc, full) {
  const base = { ...doc, text: neutralize(doc.text), citations: [], quotes: [], overrides: [] };
  if (full) return base;
  const windows = assignTags(runIdsOf(doc));
  const tags = new Map(windows.map((w) => [w.windowRun, w.tag]));
  return { ...base, spans: doc.spans.map((span) => tagged(span, tags)) };
}
function legendBlock(doc, full, escape) {
  const items = legendLines(full ? "run" : "tag");
  const ids = runIdsOf(doc);
  if (full || ids.length === 0) return items;
  return [...items, ...runsListLines(assignTags(ids), escape)];
}
function lineEnds(style, text) {
  return text.split("\n").join(`${LINE_END}
${style}`);
}
function colourBody(view, mode) {
  const codes = render(view, "display").positions;
  let out = "";
  view.spans.forEach((span, i) => {
    const style = onBody(PANE.origin[span.provenance.origin], mode);
    const code = codes[i]?.code ?? "";
    out += style + lineEnds(style, code + view.text.slice(span.start, span.end));
  });
  return out === "" ? out : out + LINE_END;
}
function colourLines(lines, colour, mode) {
  const style = onBody(colour, mode);
  return lines.map((line2) => `${style}${line2}${LINE_END}`);
}
function colourView(doc, mode, path, full) {
  const head = colourLines([headerLine(path)], PANE.title, mode);
  const legend = colourLines([...legendBlock(doc, full, false), ""], PANE.legend, mode);
  return [...head, ...legend, colourBody(provenanceOnly(doc, full), mode)].join("\n");
}
function plainView(doc, path, full) {
  const body = render(provenanceOnly(doc, full), "display").text;
  return [headerLine(path), ...legendBlock(doc, full, true), "", body].join("\n");
}
function viewRecord(doc, mode, path, full = false) {
  return mode === "plain" ? plainView(doc, path, full) : colourView(doc, mode, path, full);
}
var init_view = __esm({
  "packages/provenance/src/core/view.ts"() {
    "use strict";
    init_src();
    init_legend();
    init_neutralize();
    init_palette();
    init_runs_list();
    init_tags();
  }
});

// packages/provenance/src/io/reveal-file.ts
function unrecordedCharacters(recorded, current) {
  return changeHunks(recorded, current).reduce((n, h) => n + (h.to - h.from) + h.text.length, 0);
}
function notShown(path, reason) {
  const text = reason === "tampered_record" ? `${neutralize(path)}: tampered_record` : `${neutralize(path)}: not recorded: ${reason}`;
  return { status: 1, text };
}
function reasonOf(facts) {
  const { read } = facts;
  if (read.kind === "absent" || read.kind === "unreadable") return "not_tracked";
  const nothing = facts.record === null && facts.entry === null;
  if (nothing && facts.listed === false) return "ignored";
  if (read.kind === "over_limit" || read.kind === "binary") return read.kind;
  return nothing ? "no_record" : null;
}
function shown(doc, how, path, stale) {
  const view = viewRecord(doc, how.mode, path, how.full);
  return { status: 0, text: stale === null ? view : `${stale}
${view}` };
}
function staleOf(path, count) {
  return staleLine(neutralize(path), count);
}
function entryOutput(facts, text, how, path) {
  const { entry, read, baselineAt, baselineText } = facts;
  if (entry === null || read.kind !== "text" || baselineAt === null)
    return notShown(path, "no_record");
  if (read.sha256 === entry.sha256) {
    const doc = unchangedDocument(text, baselineAt);
    return doc === null ? notShown(path, "no_record") : shown(doc, how, path, null);
  }
  const count = baselineText === null ? text.length : unrecordedCharacters(baselineText, text);
  return { status: 0, text: `${staleOf(path, count)}
${headerLine(path)}` };
}
function decideReveal(facts, path, how) {
  const { record, read } = facts;
  if (record !== null && !record.ok) return notShown(path, "tampered_record");
  const reason = reasonOf(facts);
  if (reason !== null || read.kind !== "text") return notShown(path, reason ?? "not_tracked");
  if (record === null) return entryOutput(facts, read.text, how, path);
  if (record.text === read.text) return shown(record.doc, how, path, null);
  const stale = staleOf(path, unrecordedCharacters(record.text, read.text));
  return shown(record.doc, how, path, stale);
}
async function revealFile(deps, root, path, how) {
  const facts = await loadFile(deps, root, path);
  if (!facts.ok) return { status: 1, text: `${neutralize(path)}: ${facts.error.kind}` };
  return decideReveal(facts.value, path, how);
}
var init_reveal_file = __esm({
  "packages/provenance/src/io/reveal-file.ts"() {
    "use strict";
    init_legend();
    init_neutralize();
    init_update();
    init_view();
    init_load();
  }
});

// packages/provenance/src/io/reveal-cmd.ts
var reveal_cmd_exports = {};
__export(reveal_cmd_exports, {
  USAGE: () => USAGE,
  chooseMode: () => chooseMode,
  relativeTo: () => relativeTo,
  revealCommand: () => revealCommand
});
function chooseMode(env, isTTY) {
  if (!isTTY || env.noColor || env.term === "dumb") return "plain";
  if (env.colorterm === "truecolor" || env.colorterm === "24bit") return "truecolor";
  return env.term?.includes("256color") === true ? "ansi256" : "plain";
}
function relativeTo(root, cwd, arg) {
  const parts = [];
  const joined = arg.startsWith("/") ? arg : `${cwd}/${arg}`;
  for (const part of joined.split("/")) {
    if (part === "..") parts.pop();
    else if (part !== "" && part !== ".") parts.push(part);
  }
  const base = root.split("/").filter((p) => p !== "");
  if (parts.length <= base.length || base.some((p, i) => parts[i] !== p)) return null;
  return parts.slice(base.length).join("/");
}
async function revealOne(deps, io, arg, full) {
  const root = await findWorkspaceRoot(deps, io.cwd, null);
  if (root === null) {
    io.out(NOT_SET_UP);
    return 1;
  }
  const path = relativeTo(root, io.cwd, arg);
  if (path === null) {
    io.out(`${neutralize(arg)}: not recorded: not_tracked`);
    return 1;
  }
  const shown2 = await revealFile(deps, root, path, {
    mode: chooseMode(io.env, io.isTTY),
    full
  });
  io.out(shown2.text);
  return shown2.status;
}
function scopeOf(root, cwd, arg) {
  const probe = relativeTo(root, cwd, `${arg}/x`);
  if (probe === null) return null;
  return { scope: probe === "x" ? null : probe.slice(0, -2) };
}
async function inWorkspace(deps, io, run) {
  const root = await findWorkspaceRoot(deps, io.cwd, null);
  const report = root === null ? { status: 1, text: NOT_SET_UP } : await run(root);
  io.out(report.text);
  return report.status;
}
async function summaryForm(deps, io, args) {
  const parsed = parseSummaryArgs(args);
  if (parsed === null) return usage(io);
  return inWorkspace(deps, io, async (root) => {
    const found = parsed.path === null ? { scope: null } : scopeOf(root, io.cwd, parsed.path);
    if (found === null) {
      return { status: 1, text: `${neutralize(parsed.path ?? "")}: not recorded: not_tracked` };
    }
    return summaryReport(deps, root, found.scope, parsed.top, parsed.all);
  });
}
async function checkForm(deps, io, args) {
  const parsed = parseCheckArgs(args);
  if (parsed === null) return usage(io);
  return inWorkspace(deps, io, (root) => checkReport(deps, root, parsed.strict));
}
async function recordForm(deps, io) {
  const root = await findWorkspaceRoot(deps, io.cwd, null);
  if (root === null) {
    io.out(NOT_SET_UP);
    return 1;
  }
  await runRecord(deps, "manual", io.cwd);
  return 0;
}
function usage(io) {
  io.err(USAGE);
  return 1;
}
async function revealCommand(deps, args, io) {
  const [first, ...rest] = args;
  if (first === "--summary") return summaryForm(deps, io, rest);
  if (first === "--check") return checkForm(deps, io, rest);
  if (first === "--record") return rest.length === 0 ? recordForm(deps, io) : usage(io);
  const files = args.filter((a) => a !== "--full");
  const [file] = files;
  if (file === void 0 || file.startsWith("--") || files.length > 1) return usage(io);
  return revealOne(deps, io, file, files.length < args.length);
}
var NOT_SET_UP, USAGE;
var init_reveal_cmd = __esm({
  "packages/provenance/src/io/reveal-cmd.ts"() {
    "use strict";
    init_neutralize();
    init_recorder();
    init_reveal_report();
    init_reveal_file();
    NOT_SET_UP = "provenance is not set up here: run setup_provenance";
    USAGE = "usage: reveal <file> [--full] | --summary [path] [--top <n>] [--all] | --check [--strict] | --record";
  }
});

// packages/provenance/src/io/env.ts
var env_exports = {};
__export(env_exports, {
  colorEnvFrom: () => colorEnvFrom,
  readColorEnv: () => readColorEnv
});
function colorEnvFrom(env) {
  const noColor = env["NO_COLOR"];
  return {
    noColor: noColor !== void 0 && noColor !== "",
    colorterm: env["COLORTERM"] ?? null,
    term: env["TERM"] ?? null
  };
}
function readColorEnv() {
  return colorEnvFrom(process.env);
}
var init_env = __esm({
  "packages/provenance/src/io/env.ts"() {
    "use strict";
  }
});

// packages/provenance/src/cli/crash.ts
function installCrashHandlers(getLogger, exit, event) {
  const bail = () => {
    getLogger().fault({ event, path: null, reason: "exception" }).then(exit, exit);
  };
  process.on("uncaughtException", bail);
  process.on("unhandledRejection", bail);
  return bail;
}

// packages/provenance/src/io/deps.ts
init_src();
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFile,
  lstat,
  mkdir,
  readdir,
  readFile,
  rename,
  rmdir,
  unlink,
  writeFile
} from "node:fs/promises";
async function attempt(run) {
  try {
    return ok(await run());
  } catch (error) {
    const code = error?.code;
    return err({ code: typeof code === "string" ? code : "EIO" });
  }
}
function toKind(s) {
  if (s.isSymbolicLink()) return "symlink";
  if (s.isFile()) return "file";
  return s.isDirectory() ? "dir" : "other";
}
function nodeFs() {
  const void_ = (run) => attempt(async () => {
    await run();
  });
  return {
    readFile: (p) => attempt(async () => new Uint8Array(await readFile(p))),
    writeFile: (p, data, exclusive = false) => void_(() => writeFile(p, data, exclusive ? { flag: "wx" } : void 0)),
    appendFile: (p, text) => void_(() => appendFile(p, text)),
    rename: (a, b) => void_(() => rename(a, b)),
    unlink: (p) => void_(() => unlink(p)),
    rmdir: (p) => void_(() => rmdir(p)),
    mkdirp: (p) => void_(() => mkdir(p, { recursive: true })),
    readdir: (p) => attempt(() => readdir(p)),
    lstat: (p) => attempt(async () => {
      const s = await lstat(p);
      return { size: s.size, mtimeMs: s.mtimeMs, kind: toKind(s) };
    })
  };
}
function nodeGit(command) {
  return {
    exec: (cwd, args, input) => new Promise((resolve) => {
      const child = execFile(
        command,
        [...args],
        { cwd, encoding: "buffer", maxBuffer: 1 << 28 },
        (error, stdout) => {
          if (error === null) {
            resolve(ok(new Uint8Array(stdout)));
            return;
          }
          const code = error.code;
          if (code === "ENOENT") {
            resolve(err({ kind: "missing" }));
            return;
          }
          resolve(err(typeof code === "number" ? { kind: "failed", code } : { kind: "failed" }));
        }
      );
      child.stdin?.on("error", () => void 0);
      child.stdin?.end(input);
    })
  };
}
function nodeClock() {
  return {
    nowMs: () => Date.now(),
    nowIso: () => (/* @__PURE__ */ new Date()).toISOString(),
    timer: (ms) => {
      let handle;
      const done2 = new Promise((resolve) => {
        handle = setTimeout(resolve, ms);
      });
      return {
        done: done2,
        cancel: () => {
          clearTimeout(handle);
        }
      };
    }
  };
}
function nodeDeps(gitCommand = "git") {
  return {
    fs: nodeFs(),
    git: nodeGit(gitCommand),
    clock: nodeClock(),
    sha256: (bytes) => createHash("sha256").update(bytes).digest("hex"),
    stdin: process.stdin,
    log: { fault: () => Promise.resolve() },
    pid: process.pid
  };
}

// packages/provenance/src/io/baseline-cmd.ts
init_src();
init_baseline_cache();
init_git();
init_lock();
init_scan2();
init_store();
var READ_BATCH = 64;
var EVENT = "baseline";
async function listRecordPaths2(deps, dir, prefix = "") {
  const names = await deps.fs.readdir(prefix === "" ? dir : `${dir}/${prefix}`);
  if (!names.ok) return [];
  const found = [];
  for (const name of names.value) {
    const rel = prefix === "" ? name : `${prefix}/${name}`;
    const stat = await deps.fs.lstat(`${dir}/${rel}`);
    if (!stat.ok) continue;
    if (stat.value.kind === "dir") found.push(...await listRecordPaths2(deps, dir, rel));
    else if (stat.value.kind === "file" && rel.endsWith(".reveal")) found.push(rel.slice(0, -7));
  }
  return found;
}
async function readAll(deps, root, files) {
  const texts = /* @__PURE__ */ new Map();
  let skipped = 0;
  for (let i = 0; i < files.length; i += READ_BATCH) {
    const batch = files.slice(i, i + READ_BATCH);
    const reads = await Promise.all(batch.map((c) => readCandidate(deps, root, c)));
    reads.forEach((read, j) => {
      if (read.kind === "text") texts.set(batch[j].path, read);
      else skipped += 1;
    });
  }
  return { texts, skipped };
}
async function blobInfo(deps, root, paths) {
  const ids = await hashObjects(deps, root, paths);
  if (!ids.ok) {
    await deps.log.fault({ event: EVENT, path: null, reason: "read_failed" });
    return { ids: /* @__PURE__ */ new Map(), held: /* @__PURE__ */ new Map() };
  }
  const held = await checkBlobs(deps, root, [...ids.value.values()]);
  if (!held.ok) await deps.log.fault({ event: EVENT, path: null, reason: "read_failed" });
  return { ids: ids.value, held: held.ok ? held.value : /* @__PURE__ */ new Map() };
}
async function writeCacheFiles(deps, cache, texts, needed) {
  for (const path of needed) {
    const file = texts.get(path);
    const have = await cache.read(file.sha256);
    if (have !== null && deps.sha256(have) === file.sha256) continue;
    const written = await cache.write(file.sha256, file.bytes);
    if (!written.ok) await deps.log.fault({ event: EVENT, path, reason: "write_failed" });
  }
}
async function planEntries(deps, root, git, texts) {
  const paths = [...texts.keys()];
  const info = git ? await blobInfo(deps, root, paths) : { ids: /* @__PURE__ */ new Map(), held: /* @__PURE__ */ new Map() };
  const entries = /* @__PURE__ */ new Map();
  const needed = [];
  for (const path of paths) {
    const sha256 = texts.get(path).sha256;
    const blob = info.ids.get(path);
    entries.set(path, blob === void 0 ? { sha256 } : { sha256, blob });
    if (blob === void 0 || info.held.get(blob) !== true) needed.push(path);
  }
  return { entries, needed };
}
async function ensureSessions(deps, store) {
  const stat = await deps.fs.lstat(`${store.dir}/sessions.json`);
  if (stat.ok || stat.error.code !== "ENOENT") return;
  const written = await store.writeSessions(0);
  if (!written.ok) await deps.log.fault({ event: EVENT, path: null, reason: "write_failed" });
}
async function collect(deps, root, store, base) {
  const list = await listCandidates(deps, root);
  const recorded = new Set(await listRecordPaths2(deps, `${store.dir}/records`));
  const todo = list.files.filter((f) => !recorded.has(f.path) && base?.files[f.path] === void 0);
  const { texts, skipped } = await readAll(deps, root, todo);
  const plan = await planEntries(deps, root, list.git, texts);
  return { ...plan, texts, skipped };
}
async function baselineLocked(deps, root, store) {
  const cache = createBaselineCache(deps, store.cacheDir());
  const existing = await store.readBaseline();
  if (!existing.ok) {
    await deps.log.fault({ event: EVENT, path: null, reason: existing.error.kind });
    return existing;
  }
  const found = await collect(deps, root, store, existing.value);
  await writeCacheFiles(deps, cache, found.texts, found.needed);
  const next = existing.value ?? {
    version: 1,
    at: `${deps.clock.nowIso().slice(0, 19)}Z`,
    files: {}
  };
  const merged = {
    ...next,
    files: { ...next.files, ...Object.fromEntries(found.entries) }
  };
  if (existing.value === null || found.entries.size > 0) {
    const written = await store.writeBaseline(merged);
    if (!written.ok) return written;
  }
  await cache.prune(merged);
  await ensureSessions(deps, store);
  return ok({ added: found.entries.size, skipped: found.skipped });
}
async function runBaseline(deps, root) {
  const store = createStore(deps, `${root}/.kiro/provenance`);
  await deps.fs.mkdirp(store.dir);
  const taken = await acquireLock(deps, `${store.dir}/lock`);
  if (!taken.ok) {
    await deps.log.fault({ event: EVENT, path: null, reason: taken.error.kind });
    return taken;
  }
  try {
    return await baselineLocked(deps, root, store);
  } finally {
    await taken.value.release();
  }
}
function formatBaselineLine(summary) {
  return `baseline: ${String(summary.added)} added, ${String(summary.skipped)} skipped`;
}
async function baselineCommand(deps, root, print) {
  const result = await runBaseline(deps, root);
  if (!result.ok) return result.error.kind === "lock_timeout" ? 0 : 1;
  print(formatBaselineLine(result.value));
  return 0;
}

// packages/provenance/src/cli/main.ts
init_faults();
init_recorder();
var WATCHDOG_MS = 22e3;
function exitZero() {
  process.exit(0);
}
async function recordCommand(name) {
  const deps = nodeDeps();
  let logger = deps.log;
  const event = parseEvent(name) ?? "unknown";
  setTimeout(exitZero, WATCHDOG_MS).unref();
  const bail = installCrashHandlers(() => logger, exitZero, event);
  try {
    await runRecord(deps, name, process.cwd(), (made) => {
      logger = made;
    });
  } catch {
    bail();
    return;
  }
  exitZero();
}
async function baselineMain() {
  const base = nodeDeps();
  const cwd = process.cwd();
  const root = await findWorkspaceRoot(base, cwd, null) ?? cwd.replace(/\\/gu, "/");
  const deps = { ...base, log: createFaultLog(base, `${root}/.kiro/provenance/errors.log`) };
  return baselineCommand(deps, root, (line2) => process.stdout.write(`${line2}
`));
}
async function revealMain(args) {
  const { revealCommand: revealCommand2 } = await Promise.resolve().then(() => (init_reveal_cmd(), reveal_cmd_exports));
  const { readColorEnv: readColorEnv2 } = await Promise.resolve().then(() => (init_env(), env_exports));
  process.stdout.on("error", (error) => {
    if (error.code !== "EPIPE") throw error;
    process.exit(0);
  });
  const io = {
    cwd: process.cwd().replace(/\\/gu, "/"),
    env: readColorEnv2(),
    isTTY: process.stdout.isTTY,
    out: (text) => process.stdout.write(`${text}
`),
    err: (text) => process.stderr.write(`${text}
`)
  };
  return revealCommand2(nodeDeps(), args, io);
}
async function main(argv) {
  const [command, ...rest] = argv;
  if (command === "record") return recordCommand(rest[0] ?? "");
  if (command === "baseline") {
    process.exit(await baselineMain());
  }
  if (command === "reveal") {
    process.exitCode = await revealMain(rest);
    return;
  }
  process.stderr.write("usage: provenance record <event> | baseline | reveal <file>\n");
  process.exit(1);
}
void main(process.argv.slice(2));
