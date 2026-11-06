// Narration timing budgets. Speech engines speak faster than most estimates assume, so scripts are
// written to a measured words-per-second rate and every scene keeps its own duration.
const indic = /^(hi|mr|bn|ta|te|gu|kn|ml|pa|ur|or|as|ne|si)([_-]|$)/i;

export function wordsPerSecond(language?: string) {
  return indic.test((language || '').trim()) ? 2 : 2.4;
}

export function maxWordsFor(seconds: number, language?: string) {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.max(1, Math.floor(seconds * wordsPerSecond(language)));
}

export function pacingInstruction(language?: string) {
  const rate = wordsPerSecond(language);
  return `Narration is spoken aloud at about ${rate} words per second. Count every narration's words and keep it inside its time budget: words must be at most seconds × ${rate}. Use short sentences, natural punctuation and a small pause margin.`;
}
