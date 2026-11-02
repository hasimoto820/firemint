import { useEffect, useState } from 'react'
import type { AccountStatus } from '@features/account/shared/types'

/** FireMint アカウントの状態。変わった時と、ウィンドウに戻った時に更新する。 */
export function useAccountStatus(): AccountStatus | null {
  const [status, setStatus] = useState<AccountStatus | null>(null)

  useEffect(() => {
    let cancelled = false

    const refresh = (): void => {
      void window.api.account.getStatus().then((next) => {
        if (!cancelled) {
          setStatus(next)
        }
      })
    }

    refresh()
    const unsubscribe = window.api.account.onChanged(setStatus)
    window.addEventListener('focus', refresh)

    return () => {
      cancelled = true
      unsubscribe()
      window.removeEventListener('focus', refresh)
    }
  }, [])

  return status
}
