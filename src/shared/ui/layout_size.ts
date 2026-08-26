const sizes = new Map<string, number>()
const records = new Map<string, Record<string, number>>()

/** セッション内だけ覚える。再起動で消える。 */
export function readLayoutSize(key: string): number | undefined {
  return sizes.get(key)
}

export function writeLayoutSize(key: string, value: number): void {
  sizes.set(key, value)
}

export function readLayoutRecord(key: string): Record<string, number> | undefined {
  const value = records.get(key)
  return value == null ? undefined : { ...value }
}

export function writeLayoutRecord(key: string, value: Record<string, number>): void {
  records.set(key, { ...value })
}
