'use client';

import { useEffect, useRef } from 'react';
import { Player } from '@remotion/player';
import { VideoComposition } from './video-composition';
import type { VideoPreviewData } from '../lib/video-preview';
import { subtitleFile } from '../lib/subtitles';

export function VideoPreview({ video, onClose }: { video: VideoPreviewData; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cues = video.scenes.flatMap(scene => scene.subtitles.map(cue => ({ ...cue, startFrame: cue.startFrame + scene.from, endFrame: cue.endFrame + scene.from })));
  function downloadSubtitles(format: 'srt' | 'vtt') {
    const url = URL.createObjectURL(new Blob([subtitleFile(cues, video.fps, format)], { type: format === 'vtt' ? 'text/vtt;charset=utf-8' : 'application/x-subrip;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'studio-subtitles.' + format; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => { element?.close(); }; }, []);
  return <dialog ref={dialog} className="video-preview-dialog" aria-labelledby="video-preview-title" onCancel={onClose}>
    <header><div><h2 id="video-preview-title">{video.title}</h2><p>Remotion Player preview · {Math.round(video.durationInFrames / video.fps)} seconds · {video.fps} fps</p></div><button type="button" className="secondary-button" onClick={onClose}>Close preview</button></header>
    <Player component={VideoComposition} inputProps={{ video }} durationInFrames={video.durationInFrames} compositionWidth={video.width} compositionHeight={video.height} fps={video.fps} controls showVolumeControls autoPlay={false} style={{ width: `min(100%, ${70 * video.width / video.height}vh)`, margin: '0 auto', aspectRatio: `${video.width}/${video.height}`, background: '#181d18', borderRadius: 10 }} errorFallback={() => <p className="error" role="alert">Preview could not play an asset. Close, reload media and try again.</p>} />
    {cues.length > 0 && <div><p className="media-hint">Captions use your approved script with estimated timing across each narration. They are included in the MP4.</p><button type="button" className="secondary-button" onClick={() => downloadSubtitles('srt')}>Download SRT</button>{' '}<button type="button" className="secondary-button" onClick={() => downloadSubtitles('vtt')}>Download VTT</button></div>}
    <p className="media-hint">This is the exact Remotion composition used for the export: clips play once, narration is fitted to the scene, and scene titles animate in. Close preview and choose Export MP4 to download the full video.</p>
  </dialog>;
}
