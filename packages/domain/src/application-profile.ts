import { createEmptyPersonalProfile, type PersonalProfile } from "./profile.ts";
import { toCloudResumeProfile, cloudResumeToPersonalProfile } from "./cloud-resume.ts";

const COLLECTIONS = ["education", "experiences", "projects", "campusExperiences", "awards", "languages", "qualifications", "computerSkills"] as const;
type Collection = typeof COLLECTIONS[number];
type Row = Record<string, unknown> & { id?: string };

/** Device-only supplements. Rows outlive removal from any individual resume. */
export interface LocalApplicationProfile {
  schemaVersion: 1;
  fields: Record<string, unknown>;
  entries: Partial<Record<Collection, Record<string, { fields: Row; facts: Row }>>>;
  /** Explicit application wording, independent of the resume's edited prose. */
  expressions?: Record<string, Record<string, unknown>>;
}

const PROSE_FIELDS = new Set(["description", "contentBlocks", "achievements", "achievement", "selfIntroduction", "strengths"]);

export function captureApplicationExpressions(local: LocalApplicationProfile, resumeId: string, before: PersonalProfile, edited: PersonalProfile): LocalApplicationProfile {
  const result = structuredClone(local);
  const expressions = (result.expressions ||= {})[resumeId] ||= {};
  for (const key of ["selfIntroduction", "strengths"] as const) {
    if (before[key] !== edited[key]) expressions[key] = edited[key];
  }
  for (const collection of COLLECTIONS) {
    for (const row of (edited[collection] || []) as Row[]) {
      const old = ((before[collection] || []) as Row[]).find(item => item.id === row.id);
      if (!old || !row.id) continue;
      for (const field of PROSE_FIELDS) {
        if (JSON.stringify(old[field]) !== JSON.stringify(row[field])) expressions[`${collection}:${row.id}:${field}`] = structuredClone(row[field] ?? (field === "contentBlocks" ? [] : ""));
      }
    }
  }
  return result;
}

export function captureApplicationFields(
  previous: LocalApplicationProfile | undefined,
  profile: PersonalProfile
): LocalApplicationProfile {
  const result: LocalApplicationProfile = structuredClone(previous || { schemaVersion: 1, fields: {}, entries: {} });
  const safe = toCloudResumeProfile(profile) as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(profile)) {
    if (!(key in safe) && !COLLECTIONS.includes(key as Collection) && key !== "updatedAt") result.fields[key] = structuredClone(value);
  }
  for (const key of COLLECTIONS) {
    const safeRows = (safe[key] || []) as Row[];
    for (const [index, row] of ((profile[key] || []) as Row[]).entries()) {
      if (!row.id) continue;
      const facts = safeRows[index] || {};
      const fields = Object.fromEntries(Object.entries(row).filter(([field]) => !(field in facts)));
      const collection = result.entries[key] ||= {};
      collection[row.id] = { fields: { ...collection[row.id]?.fields, ...structuredClone(fields) }, facts: structuredClone(facts) };
    }
  }
  return result;
}

/** Compose at read time; neither the local archive nor its unknown fields can
 * enter the upload projection. Deleted resume rows stay archived, not visible. */
export function composeApplicationProfile(profile: PersonalProfile, local?: LocalApplicationProfile, resumeId?: string): PersonalProfile {
  if (!local) return structuredClone(profile);
  const result = { ...createEmptyPersonalProfile(), ...structuredClone(local.fields), ...toCloudResumeProfile(profile) } as PersonalProfile;
  for (const key of COLLECTIONS) {
    if (!profile[key]) continue;
    (result as unknown as Record<string, unknown>)[key] = (profile[key] as Row[]).map(row => ({
      ...structuredClone(local.entries[key]?.[row.id || ""]?.fields || {}), ...structuredClone(row)
    }));
  }
  const expression = resumeId ? local.expressions?.[resumeId] : undefined;
  if (expression) {
    for (const key of ["selfIntroduction", "strengths"] as const) if (key in expression) result[key] = String(expression[key]);
    for (const collection of COLLECTIONS) {
      for (const row of (result[collection] || []) as Row[]) {
        for (const field of PROSE_FIELDS) {
          const key = `${collection}:${row.id}:${field}`;
          if (key in expression) row[field] = structuredClone(expression[key]);
        }
      }
    }
  }
  return result;
}

/** A field-level three-way merge: shared facts follow explicit form edits;
 * independently authored prose stays on its resume. Job prose never becomes
 * a new master statement just because the active resume changed. */
export function mergeApplicationFacts(target: PersonalProfile, before: PersonalProfile, edited: PersonalProfile, includeProse = true): PersonalProfile {
  const result = cloudResumeToPersonalProfile(target);
  const prior = toCloudResumeProfile(before) as unknown as Record<string, unknown>;
  const next = toCloudResumeProfile(edited) as unknown as Record<string, unknown>;
  const output = result as unknown as Record<string, unknown>;
  const prose = PROSE_FIELDS;
  const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  for (const [key, value] of Object.entries(next)) {
    if (COLLECTIONS.includes(key as Collection)) continue;
    if (equal(prior[key], value)) continue;
    if (prose.has(key) && output[key] && (!includeProse || !equal(output[key], prior[key]))) continue;
    output[key] = structuredClone(value);
  }
  for (const key of COLLECTIONS) {
    if (!Array.isArray(next[key])) continue;
    const previousRows = new Map(((prior[key] || []) as Row[]).map(row => [row.id, row]));
    const editedRows = new Map((next[key] as Row[]).map(row => [row.id, row]));
    const rows = ((output[key] || []) as Row[]).filter(row => !previousRows.has(row.id) || editedRows.has(row.id));
    for (const row of next[key] as Row[]) {
      const old = previousRows.get(row.id);
      const existing = rows.find(item => item.id === row.id);
      if (!existing) {
        if (!old) rows.push(structuredClone(row));
        continue;
      }
      for (const [field, value] of Object.entries(row)) {
        if (equal(old?.[field], value)) continue;
        if (prose.has(field) && existing[field] && (!includeProse || !equal(existing[field], old?.[field]))) continue;
        existing[field] = structuredClone(value);
        if (field === "description" && !row.contentBlocks) delete existing.contentBlocks;
      }
    }
    output[key] = rows;
  }
  return result;
}

export function detachedApplicationEntries(profile: PersonalProfile, local?: LocalApplicationProfile) {
  return COLLECTIONS.flatMap(collection => {
    const present = new Set(((profile[collection] || []) as Row[]).map(row => row.id));
    return Object.entries(local?.entries[collection] || {})
      .filter(([id, row]) => !present.has(id) && Object.values(row.fields).some(value => Boolean(value)))
      .map(([id, row]) => ({ collection, id, entry: { ...row.fields, ...row.facts } }));
  });
}
