'use client';

import { useState } from 'react';

// Remounted for each voice so a browser never retains the previous sample source.
export function VoiceSamplePlayer({ name, src, sample = true }: { name: string; src: string; sample?: boolean }) {
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [status, setStatus] = useState('Ready');
  const url = reload ? src + (src.includes('?') ? '&' : '?') + 'playback=' + reload : src;
  function playbackStatus(audio: HTMLAudioElement) {
    if (audio.error) return 'Audio error: ' + audio.error.code;
    if (audio.muted || audio.volume === 0) return 'Muted — unmute the speaker control';
    return (audio.paused ? 'Paused' : 'Playing') + ' · volume ' + Math.round(audio.volume * 100) + '%';
  }
  return <div className="voice-sample-player">
    <div className="voice-sample-heading"><span>{name}{sample ? ' sample' : ''}</span></div>
    <audio key={url} src={url} controls preload="metadata" aria-label={name + (sample ? ' voice sample' : ' narration')}
      onPlaying={event => setStatus(playbackStatus(event.currentTarget))}
      onPause={event => setStatus(playbackStatus(event.currentTarget))}
      onVolumeChange={event => setStatus(playbackStatus(event.currentTarget))}
      onWaiting={() => setStatus('Buffering')}
      onEnded={() => setStatus('Finished')}
      onError={() => { setStatus('Audio failed to load'); setError('Voice file could not load. Use Reload audio.'); }} />
    <p className="media-hint" role="status">{status}</p>
    <button type="button" className="text-button" onClick={() => { setError(''); setStatus('Ready — press Play'); setReload(Date.now()); }}>Reload audio</button>{' '}
    <a href={url} target="_blank" rel="noreferrer">Open audio directly</a>
    {error && <p className="error" role="alert">{error}</p>}
  </div>;
}
