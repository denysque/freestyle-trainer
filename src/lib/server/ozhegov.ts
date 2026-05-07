import fs from 'node:fs';
import path from 'node:path';

export interface OzhEntry {
  word: string;
  defs: string[];
  examples: string[];
}

export type OzhDict = Record<string, OzhEntry[]>;

let cached: OzhDict | null = null;
let allEntriesCache: OzhEntry[] | null = null;

export function loadOzhegov(): OzhDict {
  if (cached) return cached;
  const file = path.join(process.cwd(), 'data', 'ozhegov.json');
  const raw = fs.readFileSync(file, 'utf-8');
  cached = JSON.parse(raw) as OzhDict;
  return cached;
}

export function entriesByLetter(letter: string): OzhEntry[] {
  const norm = String(letter || '').toUpperCase();
  const key = norm === 'Ё' ? 'Е' : norm;
  const dict = loadOzhegov();
  return dict[key] || [];
}

// Все статьи словаря в одном плоском массиве (для рифм/рандома по всему корпусу).
export function allEntries(): OzhEntry[] {
  if (allEntriesCache) return allEntriesCache;
  const dict = loadOzhegov();
  const out: OzhEntry[] = [];
  for (const key of Object.keys(dict)) {
    for (const e of dict[key]) out.push(e);
  }
  allEntriesCache = out;
  return out;
}
