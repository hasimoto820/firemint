import { readdir, stat } from 'fs/promises'
import { basename, join } from 'path'

function isOutputFileName(name: string): boolean {
  return /^output-\d+$/.test(name)
}

export async function listOutputFiles(root: string): Promise<string[]> {
  const found: string[] = []

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
        continue
      }
      if (entry.isFile() && isOutputFileName(entry.name)) {
        found.push(fullPath)
      }
    }
  }

  const info = await stat(root)
  if (info.isFile()) {
    return isOutputFileName(basename(root)) ? [root] : []
  }

  await walk(root)
  found.sort()
  return found
}
