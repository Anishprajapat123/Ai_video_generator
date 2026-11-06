/** Prepare a speech-only copy. The saved script and captions remain verbatim. */
export function prepareSpokenText(source: string, language = 'en') {
  const hindi = /^hi(?:[-_]|$)/i.test(language);
  const abbreviations: Record<string, string> = hindi
    ? { AI: 'ए आई', API: 'ए पी आई', CPU: 'सी पी यू', GPU: 'जी पी यू', PDF: 'पी डी एफ', HTML: 'एच टी एम एल', CSS: 'सी एस एस', MP4: 'एम पी फोर', TTS: 'टी टी एस', UI: 'यू आई', UX: 'यू एक्स' }
    : { AI: 'A I', API: 'A P I', CPU: 'C P U', GPU: 'G P U', PDF: 'P D F', HTML: 'H T M L', CSS: 'C S S', MP4: 'M P four', TTS: 'T T S', UI: 'U I', UX: 'U X' };
  let text = source.normalize('NFC').replace(/\r\n?/g, '\n');
  // Keep link labels and list content; do not read formatting symbols aloud.
  text = text.replace(/\[([^\]\n]+)\]\(https?:\/\/[^\s)]+\)/g, '$1')
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '')
    .replace(/^[ \t]{0,3}(?:[-*+]|\d+[.)])[ \t]+([^\n]+)/gm, (_match, content: string) => /[.!?।…:;]$/.test(content.trim()) ? content.trim() : content.trim() + (hindi ? '।' : '.'))
    .replace(/\*\*([^*\n]+)\*\*|__([^_\n]+)__/g, (_match, bold, underline) => bold || underline)
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/[\u200B\uFEFF]/g, '')
    .replace(/(?<![\p{L}\p{N}_])(?:HTML|API|CPU|GPU|PDF|CSS|MP4|TTS|AI|UI|UX)(?![\p{L}\p{N}_])/gu, token => abbreviations[token]);
  // Preserve paragraph pauses without adding pauses inside abbreviations or decimal numbers.
  const stop = hindi ? '।' : '.';
  text = text.split(/\n[ \t]*\n+/).map(part => part.replace(/\s+/g, ' ').trim()).filter(Boolean)
    .map((part, index, parts) => index < parts.length - 1 && !/[.!?।…:;]$/.test(part) ? part + stop : part).join('\n\n');
  return text.trim();
}
