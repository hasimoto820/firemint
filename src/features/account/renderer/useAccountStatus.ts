import { useEffect, useState } from 'react'
import type { AccountStatus } from '@features/account/shared/types'

/** FireMint アカウントの状態。変わった時と、ウィンドウに戻った時に更新する。 */
export function useAccountStatus(): AccountStatus | null {
  const [status, setStatus] = useState<AccountStatus | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = (): void => {
      void window.api.account.getStatus().then((next) => {
        if (!cancelled) {
          setStatus(next)
        }
      })
    }

    // ウィンドウに戻った時は、日付で状態を計算し直して、契約も読み直す（変わったら onChanged で届く）
    const handleFocus = (): void => {
      load()
      void window.api.account.refresh()
    }

    load()
    const unsubscribe = window.api.account.onChanged(setStatus)
    window.addEventListener('focus', handleFocus)

    return () => {
      cancelled = true
      unsubscribe()
      window.removeEventListener('focus', handleFocus)
    }
  }, [])

  return status
}
