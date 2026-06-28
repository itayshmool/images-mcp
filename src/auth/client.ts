import { OAuth2Client } from 'google-auth-library';

export function createOAuth2Client(redirectUri = 'http://localhost:3000/oauth2callback'): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      'Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET.\n' +
      'See the README for setup instructions: https://github.com/itayshmool/images-mcp#setup'
    );
  }

  return new OAuth2Client({ clientId, clientSecret, redirectUri });
}
