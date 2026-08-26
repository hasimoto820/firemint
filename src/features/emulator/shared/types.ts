export type EmulatorWizardStep = 'connect' | 'import'

export type EmulatorPageDirection = 'import' | 'export'
export type EmulatorPageTarget = 'project' | 'group' | 'collection'
export type EmulatorPageMode = `${EmulatorPageDirection}-${EmulatorPageTarget}`

export function emulatorPageIntent(mode: EmulatorPageMode): {
  direction: EmulatorPageDirection
  target: EmulatorPageTarget
} {
  const [direction, target] = mode.split('-') as [EmulatorPageDirection, EmulatorPageTarget]
  return { direction, target }
}

export function emulatorPageModeFromIntent(
  direction: EmulatorPageDirection,
  target: EmulatorPageTarget
): EmulatorPageMode {
  return `${direction}-${target}`
}

export type ImportEmulatorProjectZipInput = {
  host: string
  filePath: string
}

export type ImportEmulatorProjectZipResult =
  | {
      ok: true
      projectId: string
      sourceProjectId: string
      writtenCount: number
    }
  | {
      ok: false
      error: string
    }

export type ImportEmulatorCollectionJsonInput = {
  projectId: string
  filePath: string
}

export type DeleteEmulatorProjectInput = {
  projectId: string
}

export type DeleteEmulatorProjectResult =
  | {
      ok: true
    }
  | {
      ok: false
      error: string
    }

export type DiscoveredEmulator = {
  hubHost: string
  firestoreHost: string
  projectId: string
}

export type DiscoverEmulatorsResult =
  | {
      ok: true
      data: DiscoveredEmulator[]
    }
  | {
      ok: false
      error: string
    }
