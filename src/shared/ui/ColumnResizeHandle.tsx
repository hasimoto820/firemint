import { useRef } from 'react'

type ColumnResizeHandleProps = {
  ariaLabel: string
  onResize: (delta: number) => void
  onReset?: () => void
}

function ColumnResizeHandle({
  ariaLabel,
  onResize,
  onReset
}: ColumnResizeHandleProps): React.JSX.Element {
  const dragRef = useRef<{ pointerId: number; lastX: number } | null>(null)

  return (
    <span
      className="document-table__col-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => {
        if (event.button !== 0) {
          return
        }

        event.preventDefault()
        event.stopPropagation()
        dragRef.current = { pointerId: event.pointerId, lastX: event.clientX }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current
        if (drag == null || drag.pointerId !== event.pointerId) {
          return
        }

        const delta = event.clientX - drag.lastX
        drag.lastX = event.clientX
        if (delta !== 0) {
          onResize(delta)
        }
      }}
      onPointerUp={(event) => {
        const drag = dragRef.current
        if (drag == null || drag.pointerId !== event.pointerId) {
          return
        }

        dragRef.current = null
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
      }}
      onPointerCancel={(event) => {
        dragRef.current = null
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
      }}
      onDoubleClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onReset?.()
      }}
    />
  )
}

export default ColumnResizeHandle
