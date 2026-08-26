import { app } from 'electron'
import { resolve } from 'path'
import {
  hydrateWorkspaceStore,
  loadProject,
  resolveWorkspaceEntry
} from '@features/workspace/main/service'
import { readOfficialDump } from './read_dump'
import { runOfficialDumpSelfCheck } from './self_check'
import { importOfficialDump } from './write_dump'

function printSummary(inputPath: string, documentCount: number, paths: string[]): void {
  console.log(`ok path=${inputPath}`)
  console.log(`documents=${documentCount}`)
  for (const path of paths.slice(0, 30)) {
    console.log(`  ${path}`)
  }
  if (paths.length > 30) {
    console.log(`  … ${paths.length - 30} more`)
  }
}

function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag)
  if (index < 0) {
    return null
  }
  const value = process.argv[index + 1]
  if (!value || value.startsWith('--')) {
    return null
  }
  return value
}

function printWriteDumpUsage(): void {
  console.error('usage: --write-dump <folder-or-zip> --project <projectId-or-label>')
}

async function runWriteDumpCli(): Promise<number> {
  const dumpArg = argValue('--write-dump')
  const projectArg = argValue('--project')

  if (!dumpArg || !projectArg) {
    printWriteDumpUsage()
    return 1
  }

  await app.whenReady()
  await hydrateWorkspaceStore()

  const entry = resolveWorkspaceEntry(projectArg)
  if (!entry) {
    console.error(`プロジェクトが見つかりません: ${projectArg}`)
    return 1
  }

  const loaded = await loadProject(entry.id, { persist: false })
  if (!loaded.ok) {
    console.error(loaded.error)
    return 1
  }

  const dumpPath = resolve(dumpArg)
  const result = await importOfficialDump({ projectId: entry.id, dumpPath })
  if (!result.ok) {
    console.error(result.error)
    return 1
  }

  console.log(`ok project=${result.data.writtenProjectId}`)
  console.log(`source=${result.data.sourceProjectId ?? '-'}`)
  console.log(`written=${result.data.writtenCount}`)
  console.log(`skipped=${result.data.skippedCount}`)
  console.log(`documents=${result.data.documentCount}`)
  return 0
}

export async function maybeRunOfficialDumpCli(): Promise<number | null> {
  if (process.argv.includes('--write-dump')) {
    return runWriteDumpCli()
  }

  if (!process.argv.includes('--read-dump')) {
    return null
  }

  if (process.argv.includes('--self-check')) {
    const result = await runOfficialDumpSelfCheck()
    if (!result.ok) {
      console.error(result.error)
      return 1
    }
    console.log('self-check ok')
    return 0
  }

  const inputPath = argValue('--read-dump')
  if (!inputPath) {
    console.error('usage: --read-dump <folder-or-zip>')
    console.error('       --read-dump --self-check')
    printWriteDumpUsage()
    return 1
  }

  const result = await readOfficialDump(resolve(inputPath))
  if (!result.ok) {
    console.error(result.error)
    return 1
  }

  printSummary(
    result.data.sourcePath,
    result.data.documents.length,
    result.data.documents.map((document) => document.path)
  )
  if (result.data.sourceProjectId) {
    console.log(`project=${result.data.sourceProjectId}`)
  }
  return 0
}
