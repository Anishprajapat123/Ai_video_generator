import { StoryboardReview } from '../../../components/storyboard-review';

export default async function StoryboardPage({ params }: { params: Promise<{ storyboardId: string }> }) {
  const { storyboardId } = await params;
  return <StoryboardReview storyboardId={storyboardId} />;
}
