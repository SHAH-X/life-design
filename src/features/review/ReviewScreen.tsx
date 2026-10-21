import { useReviewStatus } from '../../reviews/useReviewStatus'
import { ReviewHome } from './ReviewHome'
import { ReviewWizard } from './ReviewWizard'

export function ReviewScreen({ sub }: { sub: string | null }) {
  const status = useReviewStatus()
  if (sub) return <ReviewWizard id={sub} />
  // Render only once loaded, so nothing jumps under your finger.
  if (status === undefined) return <div className="loading" aria-busy="true" />
  return <ReviewHome status={status} />
}
