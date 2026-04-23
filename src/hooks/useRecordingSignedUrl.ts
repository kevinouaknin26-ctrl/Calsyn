import { useEffect, useState } from 'react'
import { getSignedRecordingUrl } from '@/services/recordingSignedUrl'

/**
 * Fetch la signed URL d'un recording Twilio au mount (ou au changement de
 * `recordingUrl`). Retourne `null` tant qu'elle n'est pas prête ou si la
 * récupération a échoué.
 */
export function useRecordingSignedUrl(recordingUrl: string | null | undefined): string | null {
  const [signedUrl, setSignedUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!recordingUrl) { setSignedUrl(null); return }
    let cancelled = false
    getSignedRecordingUrl(recordingUrl).then(url => {
      if (!cancelled) setSignedUrl(url)
    })
    return () => { cancelled = true }
  }, [recordingUrl])

  return signedUrl
}
