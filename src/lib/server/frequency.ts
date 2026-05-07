import fs from 'node:fs';
import path from 'node:path';

// Частотный список из hermitdave/FrequencyWords (OpenSubtitles 2018, MIT).
// 50K форм русских слов — парсим, нормализуем (lowercase + ё→е), храним
// два Set'а: топ-3000 («простые») и топ-15000 («обычные»).

const TOP_EASY = 3000;
const TOP_NORMAL = 15000;

let easySet: Set<string> | null = null;
let normalSet: Set<string> | null = null;

function load(): { easy: Set<string>; normal: Set<string> } {
  if (easySet && normalSet) return { easy: easySet, normal: normalSet };
  const file = path.join(process.cwd(), 'data', 'ru-frequency.txt');
  const raw = fs.readFileSync(file, 'utf-8');
  const lines = raw.split('\n');

  const easy = new Set<string>();
  const normal = new Set<string>();
  let count = 0;
  for (const line of lines) {
    const word = line.split(' ')[0]?.trim();
    if (!word) continue;
    const norm = word.toLowerCase().replace(/ё/g, 'е');
    if (count < TOP_EASY) easy.add(norm);
    if (count < TOP_NORMAL) normal.add(norm);
    count++;
    if (count >= TOP_NORMAL) break;
  }
  easySet = easy;
  normalSet = normal;
  return { easy, normal };
}

// Проверяем, входит ли лемма в топ-N. Точное совпадение нормализованной формы.
// Этого достаточно: для большинства частых существительных именительный падеж
// (= лемма) сам попадает в топ субтитров.
export function isEasyWord(lemma: string): boolean {
  const k = lemma.toLowerCase().replace(/ё/g, 'е');
  return load().easy.has(k);
}

export function isNormalWord(lemma: string): boolean {
  const k = lemma.toLowerCase().replace(/ё/g, 'е');
  return load().normal.has(k);
}
