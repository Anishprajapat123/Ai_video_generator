import { SceneMediaEditor } from '../../../../components/scene-media-editor';

export default async function MediaPage({ params }: { params: Promise<{ storyboardId: string }> }) {
  const { storyboardId } = await params;
  return <SceneMediaEditor storyboardId={storyboardId} />;
}
