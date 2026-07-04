import type { EnvironmentKind } from '@shared/safety/environment'

export type ConnectResult =
  | {
      ok: true
      projectId: string
      clientEmail: string
      environment: EnvironmentKind
      rootCollections: string[]
    }
  | {
      ok: false
      error: string
    }

export type ConnectionStatus = {
  projectId: string
  clientEmail: string
  environment: EnvironmentKind
  readOnly: boolean
}
