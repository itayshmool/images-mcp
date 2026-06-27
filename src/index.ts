#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { google } from "googleapis";
import type { drive_v3 } from "googleapis";
import { authenticate, AuthServer, initializeOAuth2Client } from './auth.js';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { escapeDriveQuery } from './utils.js';
import type { ToolContext } from './types.js';
import { errorResponse } from './types.js';

import * as imagenTools from './tools/imagen.js';

const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

let _drive: drive_v3.Drive | null = null;
let _lastAuthClient: any = null;
let authClient: any = null;
let authenticationPromise: Promise<any> | null = null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJsonPath = join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
const VERSION = packageJson.version;

function log(message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const logMessage = data
    ? `[${timestamp}] ${message}: ${JSON.stringify(data)}`
    : `[${timestamp}] ${message}`;
  console.error(logMessage);
}

function getDrive(): drive_v3.Drive {
  if (!authClient) throw new Error('Authentication required');
  if (_drive && _lastAuthClient === authClient) return _drive;
  _drive = google.drive({ version: 'v3', auth: authClient });
  _lastAuthClient = authClient;
  log('Drive service created');
  return _drive;
}

async function resolvePath(pathStr: string): Promise<string> {
  if (!pathStr || pathStr === '/') return 'root';

  const parts = pathStr.replace(/^\/+|\/+$/g, '').split('/');
  let currentFolderId: string = 'root';

  for (const part of parts) {
    if (!part) continue;
    const escapedPart = escapeDriveQuery(part);
    const response = await getDrive().files.list({
      q: `'${currentFolderId}' in parents and name = '${escapedPart}' and mimeType = '${FOLDER_MIME_TYPE}' and trashed = false`,
      fields: 'files(id)',
      spaces: 'drive',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });

    if (!response.data.files?.length) {
      const folder = await getDrive().files.create({
        requestBody: {
          name: part,
          mimeType: FOLDER_MIME_TYPE,
          parents: [currentFolderId],
        },
        fields: 'id',
        supportsAllDrives: true,
      });
      if (!folder.data.id) {
        throw new Error(`Failed to create intermediate folder: ${part}`);
      }
      currentFolderId = folder.data.id;
    } else {
      currentFolderId = response.data.files[0].id!;
    }
  }

  return currentFolderId;
}

async function resolveFolderId(input: string | undefined): Promise<string> {
  if (!input) return 'root';
  return input.startsWith('/') ? resolvePath(input) : input;
}

async function ensureAuthenticated() {
  if (authClient) return;

  if (authenticationPromise) {
    log('Authentication already in progress, waiting...');
    authClient = await authenticationPromise;
    return;
  }

  log('Initializing authentication');
  authenticationPromise = authenticate();
  try {
    authClient = await authenticationPromise;
    log('Authentication complete');
  } finally {
    authenticationPromise = null;
  }
}

function buildToolContext(): ToolContext {
  return {
    authClient,
    getDrive,
    log,
    resolveFolderId,
  };
}

const server = new Server(
  { name: "images-mcp", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: imagenTools.toolDefinitions };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  await ensureAuthenticated();
  log('Handling tool request', { tool: request.params.name });

  const ctx = buildToolContext();

  try {
    const result = await imagenTools.handleTool(request.params.name, request.params.arguments ?? {}, ctx);
    if (result !== null) return result;
    return errorResponse("Tool not found");
  } catch (error) {
    log('Error in tool request handler', { error: (error as Error).message });
    return errorResponse((error as Error).message);
  }
});

function showHelp(): void {
  console.log(`
Images MCP Server v${VERSION}

Usage:
  npx @itayshmool/images-mcp [command]

Commands:
  auth     Run the authentication flow
  start    Start the MCP server (default)
  version  Show version information
  help     Show this help message

Environment Variables:
  GOOGLE_DRIVE_OAUTH_CREDENTIALS   Path to OAuth credentials file
  GOOGLE_DRIVE_MCP_TOKEN_PATH      Path to store authentication tokens
  GEMINI_API_KEY                   Gemini API key (alternative to OAuth)
`);
}

function showVersion(): void {
  console.log(`Images MCP Server v${VERSION}`);
}

async function runAuthServer(): Promise<void> {
  try {
    const oauth2Client = await initializeOAuth2Client();
    const authServerInstance = new AuthServer(oauth2Client);
    const success = await authServerInstance.start(true);

    if (!success && !authServerInstance.authCompletedSuccessfully) {
      console.error("Authentication failed.");
      process.exit(1);
    } else if (authServerInstance.authCompletedSuccessfully) {
      console.log("Authentication successful.");
      process.exit(0);
    }

    console.log("Authentication server started. Complete the authentication in your browser...");

    const intervalId = setInterval(async () => {
      if (authServerInstance.authCompletedSuccessfully) {
        clearInterval(intervalId);
        await authServerInstance.stop();
        console.log("Authentication completed successfully!");
        process.exit(0);
      }
    }, 1000);
  } catch (error) {
    console.error("Authentication failed:", error);
    process.exit(1);
  }
}

function parseCliArgs(): { command: string | undefined } {
  const args = process.argv.slice(2);
  let command: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--version' || arg === '-v' || arg === '--help' || arg === '-h') {
      command = arg;
      continue;
    }
    if (!command && !arg.startsWith('--')) {
      command = arg;
      continue;
    }
  }

  return { command };
}

async function main() {
  const { command } = parseCliArgs();

  switch (command) {
    case "auth":
      await runAuthServer();
      break;
    case "start":
    case undefined:
      try {
        console.error("Starting Images MCP server...");
        const transport = new StdioServerTransport();
        await server.connect(transport);
        log('Server started successfully');

        process.on("SIGINT", async () => { await server.close(); process.exit(0); });
        process.on("SIGTERM", async () => { await server.close(); process.exit(0); });
      } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
      }
      break;
    case "version":
    case "--version":
    case "-v":
      showVersion();
      break;
    case "help":
    case "--help":
    case "-h":
      showHelp();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      showHelp();
      process.exit(1);
  }
}

export { main, server };

export function _setAuthClientForTesting(client: any) {
  authClient = client;
  _drive = null;
  _lastAuthClient = null;
}

if (!process.env.MCP_TESTING) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
