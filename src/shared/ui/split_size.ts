export const SPLIT_SASH_PX = 6

export type SplitOrientation = 'horizontal' | 'vertical'
export type SplitSizeUnit = 'px' | 'percent'
export type SplitSizeTarget = 'first' | 'second'

export function splitUsablePx(totalPx: number): number {
  return Math.max(0, totalPx - SPLIT_SASH_PX)
}

export function sizeToPx(size: number, unit: SplitSizeUnit, usablePx: number): number {
  if (usablePx <= 0) {
    return 0
  }

  return unit === 'percent' ? (size / 100) * usablePx : size
}

export function pxToSize(px: number, unit: SplitSizeUnit, usablePx: number): number {
  if (usablePx <= 0) {
    return 0
  }

  return unit === 'percent' ? (px / usablePx) * 100 : px
}

export function clampSizedPanePx(
  px: number,
  usablePx: number,
  minSizedPx: number,
  minOtherPx: number
): number {
  if (usablePx <= 0) {
    return 0
  }

  const lo = Math.min(Math.max(0, minSizedPx), usablePx)
  const hi = Math.max(lo, usablePx - Math.min(Math.max(0, minOtherPx), usablePx))
  return Math.min(hi, Math.max(lo, px))
}

export function clampSplitSize(args: {
  size: number
  unit: SplitSizeUnit
  totalPx: number
  minSizedPx: number
  minOtherPx: number
}): number {
  const usablePx = splitUsablePx(args.totalPx)
  const px = clampSizedPanePx(
    sizeToPx(args.size, args.unit, usablePx),
    usablePx,
    args.minSizedPx,
    args.minOtherPx
  )
  return pxToSize(px, args.unit, usablePx)
}
