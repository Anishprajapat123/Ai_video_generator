export type SubtitleCue = { text: string; startFrame: number; endFrame: number };

// Adapted from MoneyPrinterTurbo app/services/video.py.
// Copyright (c) 2024 Harry, MIT; see THIRD_PARTY_NOTICES.md.
export function subtitleScale(seconds: number, duration: number): number {
  const animationDuration = Math.min(.18, duration);
  if (animationDuration <= 0 || seconds >= animationDuration) return 1;
  const progress = Math.max(0, Math.min(seconds / animationDuration, 1));
  return Math.max(.05, Math.min(1.35, 1 - Math.exp(-6 * progress) * Math.cos(2.5 * Math.PI * progress)));
}

// Estimated script timing; does not transcribe audio or call a paid service.
export function buildSubtitles(text: string, duration: number, fps: number): SubtitleCue[] {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(fps) || fps <= 0) return [];
  const words = text.trim().split(/\s+/u).filter(Boolean);
  const groups: string[] = [];
  let phrase = '';
  for (const word of words) {
    if (phrase && (phrase.length + word.length + 1 > 64 || phrase.split(' ').length >= 10)) { groups.push(phrase); phrase = ''; }
    phrase += (phrase ? ' ' : '') + word;
    if (/[.!?。！？]$/u.test(word)) { groups.push(phrase); phrase = ''; }
  }
  if (phrase) groups.push(phrase);
  const frames = Math.floor(duration * fps);
  while (groups.length > frames && groups.length > 1) groups.splice(groups.length - 2, 2, groups.slice(-2).join(' '));
  const total = groups.reduce((sum, group) => sum + group.length, 0);
  let consumed = 0; let end = 0;
  return frames < 1 ? [] : groups.map((group, index) => {
    const startFrame = end;
    consumed += group.length;
    end = index === groups.length - 1 ? frames : Math.max(startFrame + 1, Math.min(frames - (groups.length - index - 1), Math.round(consumed / total * frames)));
    return { text: group, startFrame, endFrame: end };
  });
}

export function subtitleFile(cues: SubtitleCue[], fps: number, format: 'srt' | 'vtt'): string {
  const time = (frame: number) => {
    const ms = Math.round(frame / fps * 1000);
    return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}${format === 'srt' ? ',' : '.'}${String(ms % 1000).padStart(3, '0')}`;
  };
  const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return (format === 'vtt' ? 'WEBVTT\n\n' : '') + cues.map((cue, index) => `${index + 1}\n${time(cue.startFrame)} --> ${time(cue.endFrame)}\n${escape(cue.text)}\n`).join('\n');
}
