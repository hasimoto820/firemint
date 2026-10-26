import {signIn} from './google_auth';

export async function connectWithGoogle(): Promise<void> {
  await signIn();
}
