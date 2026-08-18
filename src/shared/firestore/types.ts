export type FirestoreConnectionInfo = {
  projectId: string
  clientEmail: string
  authType?: 'serviceAccount' | 'google' | 'emulator'
}

export type ServiceAccountJson = {
  project_id: string
  client_email: string
  private_key: string
}

export type GoogleAuthorizedUserJson = {
  type: 'authorized_user'
  client_id: string
  client_secret: string
  refresh_token: string
}
