import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { readLayoutRecord, writeLayoutRecord } from './layout_size'

type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

type ResizeFrameProps = {
  children: React.ReactNode
  className?: string
  storageKey: string
  defaultWidth: number
  defaultHeight: number
  minWidth?: number
  minHeight?: number
}

type DragState = {
  pointerId: number
  edge: ResizeEdge
  startX: number
  startY: number
  startW: number
  startH: number
}

const EDGES: ResizeEdge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

function viewportMax(): { maxW: number; maxH: number } {
  if (typeof window === 'undefined') {
    return { maxW: 1200, maxH: 800 }
  }

  return {
    maxW: Math.max(320, window.innerWidth - 32),
    maxH: Math.max(240, window.innerHeight - 32)
  }
}

function clampBox(
  width: number,
  height: number,
  minWidth: number,
  minHeight: number
): { width: number; height: number } {
  const { maxW, maxH } = viewportMax()
  return {
    width: Math.min(maxW, Math.max(minWidth, Math.round(width))),
    height: Math.min(maxH, Math.max(minHeight, Math.round(height)))
  }
}

function ResizeFrame({
  children,
  className,
  storageKey,
  defaultWidth,
  defaultHeight,
  minWidth = 400,
  minHeight = 320
}: ResizeFrameProps): React.JSX.Element {
  const dragRef = useRef<DragState | null>(null)
  const [size, setSize] = useState(() => {
    const stored = readLayoutRecord(storageKey)
    return clampBox(
      stored?.w ?? defaultWidth,
      stored?.h ?? defaultHeight,
      minWidth,
      minHeight
    )
  })
  const sizeRef = useRef(size)
  sizeRef.current = size

  const persist = useCallback(
    (next: { width: number; height: number }): void => {
      writeLayoutRecord(storageKey, { w: next.width, h: next.height })
    },
    [storageKey]
  )

  const applyClamp = useCallback((): void => {
    setSize((current) => {
      const next = clampBox(current.width, current.height, minWidth, minHeight)
      if (next.width === current.width && next.height === current.height) {
        return current
      }
      persist(next)
      return next
    })
  }, [minHeight, minWidth, persist])

  useLayoutEffect(() => {
    applyClamp()
    window.addEventListener('resize', applyClamp)
    return () => window.removeEventListener('resize', applyClamp)
  }, [applyClamp])

  const handleDoubleClick = (): void => {
    const next = clampBox(defaultWidth, defaultHeight, minWidth, minHeight)
    sizeRef.current = next
    setSize(next)
    persist(next)
  }

  const handlePointerDown = (edge: ResizeEdge) => (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    dragRef.current = {
      pointerId: event.pointerId,
      edge,
      startX: event.clientX,
      startY: event.clientY,
      startW: sizeRef.current.width,
      startH: sizeRef.current.height
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (drag == null || drag.pointerId !== event.pointerId) {
      return
    }

    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    let width = drag.startW
    let height = drag.startH

    if (drag.edge.includes('e')) {
      width = drag.startW + dx
    }
    if (drag.edge.includes('w')) {
      width = drag.startW - dx
    }
    if (drag.edge.includes('s')) {
      height = drag.startH + dy
    }
    if (drag.edge.includes('n')) {
      height = drag.startH - dy
    }

    const next = clampBox(width, height, minWidth, minHeight)
    sizeRef.current = next
    setSize(next)
  }

  const endDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (drag == null || drag.pointerId !== event.pointerId) {
      return
    }

    dragRef.current = null
    persist(sizeRef.current)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <div
      className={['resize-frame', className].filter(Boolean).join(' ')}
      style={{ width: size.width, height: size.height }}
    >
      {children}
      {EDGES.map((edge) => (
        <div
          key={edge}
          className={`resize-frame__handle resize-frame__handle--${edge}`}
          onPointerDown={handlePointerDown(edge)}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            handleDoubleClick()
          }}
        />
      ))}
    </div>
  )
}

export default ResizeFrame
