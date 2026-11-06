import type { ProviderResponse } from '@ai-video-studio/shared-types';

export function CollaborationSummary({ review }: { review?: ProviderResponse['collaboration'] }) {
  if (!review) return null;
  return <details className="media-hint"><summary>AI team plan review · {review.revised ? 'corrected and approved' : 'approved'}</summary>
    <ol>{review.stages.map((stage, index) => <li key={index}>{stage.role}: {stage.model || stage.providerId}</li>)}</ol>
    <p>{review.summary}</p><p>This reviews the content plan. Final video checks remain separate.</p>
  </details>;
}
