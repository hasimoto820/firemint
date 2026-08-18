import {
  loadGoogleAccountProfile,
  patchGoogleProjectProfile,
  saveGoogleAccountProfile,
  type GoogleAccountProfile,
  type GoogleProjectProfile
} from './google_profile_store'
import { removeGoogleRefreshToken } from './google_token_store'

export type { GoogleAccountProfile, GoogleProjectProfile }

export { loadGoogleAccountProfile, saveGoogleAccountProfile }

export async function rememberGoogleProjectProfile(
  accountKey: string,
  email: string,
  projectId: string,
  patch: Partial<GoogleProjectProfile> & { lastFocused?: boolean }
): Promise<void> {
  await patchGoogleProjectProfile(accountKey, email, projectId, patch)
}

export async function forgetGoogleToken(accountKey: string): Promise<void> {
  await removeGoogleRefreshToken(accountKey)
}
