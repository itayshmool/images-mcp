import express from 'express';
import { OAuth2Client } from 'google-auth-library';
import { TokenManager } from './tokenManager.js';
import { createOAuth2Client } from './client.js';
import { SCOPES } from './scopes.js';
import http from 'http';
import open from 'open';

export class AuthServer {
  private tokenManager: TokenManager;
  private flowClient: OAuth2Client | null = null;
  private app: express.Express;
  private server: http.Server | null = null;
  public authCompletedSuccessfully = false;

  constructor(private baseClient: OAuth2Client) {
    this.tokenManager = new TokenManager(baseClient);
    this.app = express();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.app.get('/oauth2callback', async (req, res) => {
      const code = req.query.code as string;
      if (!code || !this.flowClient) {
        res.status(400).send('Authorization code missing.');
        return;
      }
      try {
        const { tokens } = await this.flowClient.getToken(code);
        await this.tokenManager.saveTokens(tokens);
        this.baseClient.setCredentials(tokens);
        this.authCompletedSuccessfully = true;
        res.send(`
          <!DOCTYPE html><html><head><meta charset="UTF-8">
          <style>body{font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f5f5f5}
          .card{text-align:center;padding:2em;background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.1)}
          h1{color:#22c55e}</style></head>
          <body><div class="card">
            <h1>Signed in!</h1>
            <p>You can close this tab and start generating images.</p>
          </div></body></html>`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        res.status(500).send(`<h1>Sign-in failed</h1><p>${msg}</p>`);
      }
    });
  }

  async start(openBrowser = true): Promise<boolean> {
    if (await this.tokenManager.validateTokens()) {
      this.authCompletedSuccessfully = true;
      return true;
    }

    const port = await this.findPort();
    if (port === null) return false;

    this.flowClient = createOAuth2Client(`http://localhost:${port}/oauth2callback`);

    if (openBrowser) {
      const url = this.flowClient.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent',
      });
      console.error('\nOpening browser for Google sign-in...');
      console.error(`If it doesn't open, visit:\n${url}\n`);
      await open(url);
    }

    return true;
  }

  private async findPort(): Promise<number | null> {
    for (let port = 3000; port <= 3004; port++) {
      try {
        await new Promise<void>((resolve, reject) => {
          const s = this.app.listen(port, () => { this.server = s; resolve(); });
          s.on('error', (e: NodeJS.ErrnoException) => { s.close(() => reject(e)); });
        });
        return port;
      } catch { /* port in use */ }
    }
    console.error('No available ports (3000-3004).');
    return null;
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => { this.server = null; resolve(); });
      } else {
        resolve();
      }
    });
  }
}
