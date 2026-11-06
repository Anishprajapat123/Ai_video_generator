import { Composition, registerRoot } from 'remotion';
import { VideoComposition } from '../components/video-composition';
import type { VideoPreviewData } from '../lib/video-preview';

const video: VideoPreviewData = { title: '', fps: 30, width: 1280, height: 720, durationInFrames: 1, scenes: [] };
registerRoot(() => <Composition id="StudioVideo" component={VideoComposition} defaultProps={{ video }} durationInFrames={1} fps={30} width={1280} height={720} calculateMetadata={({ props }) => ({ durationInFrames: props.video.durationInFrames, fps: props.video.fps, width: props.video.width, height: props.video.height })} />);
