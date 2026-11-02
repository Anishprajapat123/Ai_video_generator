import { ScriptReview } from '../../../components/script-review';

export default async function ScriptReviewPage({ params }: { params: Promise<{ scriptId: string }> }) {
  const { scriptId } = await params;
  return <ScriptReview scriptId={scriptId} />;
}
