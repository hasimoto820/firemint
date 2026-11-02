import { useEffect, useRef } from 'react'
import { matchShortcut } from '@shared/settings/shared/shortcuts'
import {
  focusMenu,
  handleShortcutAction,
  isOverlayOpen,
  moveTabInCurrentArea,
  moveTabInOverlay
} from './area_focus'

/**
 * ウィンドウ keydown の1箇所。着地キーと、エリア内 Tab 一周。
 */
export function useShortcutDispatcher(expired: boolean): void {
  const expiredRef = useRef(expired)
  expiredRef.current = expired

  useEffect(() => {
    let altAlone = false

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Alt' && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
        altAlone = true
        return
      }

      altAlone = false

      if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (event.defaultPrevented) {
          return
        }

        if (isOverlayOpen()) {
          event.preventDefault()
          moveTabInOverlay(event.shiftKey)
          return
        }

        if (moveTabInCurrentArea(event.shiftKey)) {
          event.preventDefault()
        }

        return
      }

      if (isOverlayOpen()) {
        return
      }

      const action = matchShortcut(event)
      if (!action) {
        return
      }

      // 期限切れの時は、メニューと Settings へ移るキーだけ効かせる（未策定 E）
      if (expiredRef.current && action !== 'menu' && action !== 'settings') {
        event.preventDefault()
        return
      }

      event.preventDefault()
      handleShortcutAction(action)
    }

    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.key !== 'Alt' || !altAlone) {
        return
      }

      altAlone = false

      if (isOverlayOpen()) {
        return
      }

      event.preventDefault()
      focusMenu()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])
}
