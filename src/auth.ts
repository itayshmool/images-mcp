import { createOAuth2Client } from './auth/client.js';
import { AuthServer } from './auth/server.js';
import { TokenManager } from './auth/tokenManager.js';

export { createOAuth2Client } from './auth/client.js';
export { AuthServer } from './auth/server.js';
export { TokenManager } from './auth/tokenManager.js';

export async function authenticate(): Promise<any> {
  const oauth2Client = createOAuth2Client();
  const tokenManager = new TokenManager(oauth2Client);

  if (await tokenManager.validateTokens()) {
    return oauth2Client;
  }

  console.error('\nNo saved Google tokens. Opening browser for sign-in...\n');

  const authServer = new AuthServer(oauth2Client);
  const started = await authServer.start(true);
  if (!started) throw new Error('Could not start auth server.');

  await new Promise<void>((resolve) => {
    const check = setInterval(async () => {
      if (authServer.authCompletedSuccessfully) {
        clearInterval(check);
        await authServer.stop();
        resolve();
      }
    }, 1000);
  });

  return oauth2Client;
}
