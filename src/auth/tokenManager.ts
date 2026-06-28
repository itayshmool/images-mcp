import { OAuth2Client, Credentials } from 'google-auth-library';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getSecureTokenPath } from './utils.js';
import { GaxiosError } from 'gaxios';

export class TokenManager {
  private oauth2Client: OAuth2Client;
  private tokenPath: string;

  constructor(oauth2Client: OAuth2Client) {
    this.oauth2Client = oauth2Client;
    this.tokenPath = getSecureTokenPath();
    this.setupTokenRefresh();
  }

  public getTokenPath(): string {
    return this.tokenPath;
  }

  private async ensureTokenDir(): Promise<void> {
    await fs.mkdir(path.dirname(this.tokenPath), { recursive: true });
  }

  private setupTokenRefresh(): void {
    this.oauth2Client.on('tokens', async (newTokens) => {
      try {
        await this.ensureTokenDir();
        let merged = newTokens;
        try {
          const existing = JSON.parse(await fs.readFile(this.tokenPath, 'utf-8'));
          merged = { ...existing, ...newTokens, refresh_token: newTokens.refresh_token || existing.refresh_token };
        } catch { /* no existing file */ }
        await fs.writeFile(this.tokenPath, JSON.stringify(merged, null, 2), { mode: 0o600 });
      } catch (err) {
        console.error('Error saving tokens:', err);
      }
    });
  }

  async loadSavedTokens(): Promise<boolean> {
    try {
      const tokens = JSON.parse(await fs.readFile(this.tokenPath, 'utf-8'));
      if (!tokens?.access_token && !tokens?.refresh_token) return false;
      this.oauth2Client.setCredentials(tokens);
      return true;
    } catch {
      return false;
    }
  }

  async refreshTokensIfNeeded(): Promise<boolean> {
    const { expiry_date, access_token, refresh_token } = this.oauth2Client.credentials;

    if (!access_token && !refresh_token) return false;

    const isExpired = expiry_date
      ? Date.now() >= expiry_date - 5 * 60 * 1000
      : !access_token;

    if (!isExpired) return true;
    if (!refresh_token) return false;

    try {
      const { credentials } = await this.oauth2Client.refreshAccessToken();
      this.oauth2Client.setCredentials(credentials);
      return true;
    } catch (err) {
      if (err instanceof GaxiosError && err.response?.data?.error === 'invalid_grant') {
        console.error('OAuth token revoked or expired. Run: npx images-mcp auth');
        await this.clearTokens();
      }
      return false;
    }
  }

  async validateTokens(): Promise<boolean> {
    if (!this.oauth2Client.credentials?.access_token) {
      if (!(await this.loadSavedTokens())) return false;
    }
    return this.refreshTokensIfNeeded();
  }

  async saveTokens(tokens: Credentials): Promise<void> {
    await this.ensureTokenDir();
    await fs.writeFile(this.tokenPath, JSON.stringify(tokens, null, 2), { mode: 0o600 });
    this.oauth2Client.setCredentials(tokens);
  }

  async clearTokens(): Promise<void> {
    this.oauth2Client.setCredentials({});
    try { await fs.unlink(this.tokenPath); } catch { /* already gone */ }
  }
}
