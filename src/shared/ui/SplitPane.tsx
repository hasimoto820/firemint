import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { readLayoutSize, writeLayoutSize } from './layout_size'
import {
  SPLIT_SASH_PX,
  clampSplitSize,
  clampSizedPanePx,
  pxToSize,
  sizeToPx,
  splitUsablePx,
  type SplitOrientation,
  type SplitSizeTarget,
  type SplitSizeUnit
} from './split_size'

type SplitPaneProps = {
  orientation: SplitOrientation
  first: React.ReactNode
  second: React.ReactNode
  defaultSize: number
  unit?: SplitSizeUnit
  sizeTarget?: SplitSizeTarget
  minFirst?: number
  minSecond?: number
  storageKey?: string
  className?: string
  firstClassName?: string
  secondClassName?: string
  ariaLabel: string
}

type DragState = {
  pointerId: number
  startPointer: number
  startPx: number
  usablePx: number
}

function pointerAlong(orientation: SplitOrientation, event: React.PointerEvent): number {
  return orientation === 'horizontal' ? event.clientX : event.clientY
}

function SplitPane({
  orientation,
  first,
  second,
  defaultSize,
  unit = 'px',
  sizeTarget = 'first',
  minFirst = 120,
  minSecond = 120,
  storageKey,
  className,
  firstClassName,
  secondClassName,
  ariaLabel
}: SplitPaneProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const minSizedPx = sizeTarget === 'first' ? minFirst : minSecond
  const minOtherPx = sizeTarget === 'first' ? minSecond : minFirst
  const [size, setSize] = useState(() =>
    storageKey != null ? (readLayoutSize(storageKey) ?? defaultSize) : defaultSize
  )
  const sizeRef = useRef(size)
  sizeRef.current = size
  const [dragging, setDragging] = useState(false)
  const draggingRef = useRef(false)

  const persist = useCallback(
    (next: number): void => {
      if (storageKey != null) {
        writeLayoutSize(storageKey, next)
      }
    },
    [storageKey]
  )

  const applyClamp = useCallback((): void => {
    if (draggingRef.current) {
      return
    }

    const totalPx =
      orientation === 'horizontal'
        ? containerRef.current?.getBoundingClientRect().width
        : containerRef.current?.getBoundingClientRect().height

    if (totalPx == null || totalPx <= SPLIT_SASH_PX + 8) {
      return
    }

    setSize((current) => {
      const next = clampSplitSize({
        size: current,
        unit,
        totalPx,
        minSizedPx,
        minOtherPx
      })
      if (Math.abs(next - current) < (unit === 'percent' ? 0.05 : 0.5)) {
        return current
      }
      persist(next)
      return next
    })
  }, [minOtherPx, minSizedPx, orientation, persist, unit])

  useLayoutEffect(() => {
    applyClamp()
    const node = containerRef.current
    if (node == null || typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver(() => {
      applyClamp()
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [applyClamp])

  const commitSize = useCallback(
    (next: number): void => {
      sizeRef.current = next
      setSize(next)
      persist(next)
    },
    [persist]
  )

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) {
      return
    }

    const rect = containerRef.current?.getBoundingClientRect()
    if (rect == null) {
      return
    }

    const totalPx = orientation === 'horizontal' ? rect.width : rect.height
    const usablePx = splitUsablePx(totalPx)
    dragRef.current = {
      pointerId: event.pointerId,
      startPointer: pointerAlong(orientation, event),
      startPx: sizeToPx(size, unit, usablePx),
      usablePx
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
    draggingRef.current = true
    setDragging(true)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (drag == null || drag.pointerId !== event.pointerId) {
      return
    }

    const delta = pointerAlong(orientation, event) - drag.startPointer
    const signed = sizeTarget === 'first' ? delta : -delta
    const nextPx = clampSizedPanePx(
      drag.startPx + signed,
      drag.usablePx,
      minSizedPx,
      minOtherPx
    )
    const next = pxToSize(nextPx, unit, drag.usablePx)
    sizeRef.current = next
    setSize(next)
  }

  const endDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (drag == null || drag.pointerId !== event.pointerId) {
      return
    }

    dragRef.current = null
    draggingRef.current = false
    setDragging(false)
    persist(sizeRef.current)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const handleDoubleClick = (): void => {
    commitSize(defaultSize)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const step = unit === 'percent' ? 2 : 16
    const backward = orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp'
    const forward = orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown'
    let next = size

    if (event.key === backward) {
      next = sizeTarget === 'first' ? size - step : size + step
    } else if (event.key === forward) {
      next = sizeTarget === 'first' ? size + step : size - step
    } else if (event.key === 'Home') {
      next = defaultSize
    } else {
      return
    }

    event.preventDefault()
    const rect = containerRef.current?.getBoundingClientRect()
    const totalPx =
      rect == null ? 0 : orientation === 'horizontal' ? rect.width : rect.height
    commitSize(
      clampSplitSize({
        size: next,
        unit,
        totalPx,
        minSizedPx,
        minOtherPx
      })
    )
  }

  const sizedTrack = unit === 'percent' ? `${size}%` : `${size}px`
  const template =
    sizeTarget === 'first'
      ? `${sizedTrack} ${SPLIT_SASH_PX}px minmax(0, 1fr)`
      : `minmax(0, 1fr) ${SPLIT_SASH_PX}px ${sizedTrack}`

  return (
    <div
      ref={containerRef}
      className={['split-pane', `split-pane--${orientation}`, dragging ? 'split-pane--dragging' : '', className]
        .filter(Boolean)
        .join(' ')}
      style={
        orientation === 'horizontal'
          ? { gridTemplateColumns: template }
          : { gridTemplateRows: template }
      }
    >
      <div
        className={['split-pane__pane', firstClassName].filter(Boolean).join(' ')}
      >
        {first}
      </div>
      <div
        className="split-pane__sash"
        role="separator"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-orientation={orientation}
        aria-valuenow={Math.round(size)}
        aria-valuemin={0}
        aria-valuemax={unit === 'percent' ? 100 : undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={handleDoubleClick}
        onKeyDown={handleKeyDown}
      />
      <div
        className={['split-pane__pane', secondClassName].filter(Boolean).join(' ')}
      >
        {second}
      </div>
    </div>
  )
}

export default SplitPane
