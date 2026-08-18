import type { EnvironmentKind } from '@shared/safety/environment'

export type ConnectResult =
  | {
      ok: true
      projectId: string
      clientEmail: string
      environment: EnvironmentKind
      rootCollections: string[]
      authType?: 'serviceAccount' | 'google' | 'emulator'
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
  authType?: 'serviceAccount' | 'google' | 'emulator'
}

export type EmulatorConnectInput = {
  projectId: string
  host: string
}

export type GoogleSignInResult =
  | {
      ok: true
      accountKey: string
      email: string
      projects: Array<{ projectId: string; displayName: string }>
    }
  | {
      ok: false
      error: string
    }

export type GoogleConnectProjectInput = {
  accountKey: string
  accountEmail: string
  projectId: string
}

export type GoogleConnectAccountInput = {
  accountKey: string
  accountEmail: string
  projects: Array<{ projectId: string; displayName: string }>
}
