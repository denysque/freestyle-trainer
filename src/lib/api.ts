export interface RandomNoun {
  word: string;
  def: string;
}

export type DifficultyLevel = 'easy' | 'normal' | 'all';

export async function fetchRandomNoun(level: DifficultyLevel = 'normal'): Promise<RandomNoun> {
  const r = await fetch(`/api/random-noun?level=${level}`);
  if (!r.ok) throw new Error('random-noun failed');
  return r.json();
}

export async function fetchRhymes(word: string): Promise<string[]> {
  const r = await fetch(`/api/rhymes?word=${encodeURIComponent(word)}`);
  if (!r.ok) return [];
  const data = await r.json();
  return Array.isArray(data.rhymes) ? data.rhymes : [];
}

export async function fetchByWord(word: string): Promise<RandomNoun | null> {
  const r = await fetch(`/api/define?word=${encodeURIComponent(word)}`);
  if (!r.ok) return null;
  return r.json();
}
