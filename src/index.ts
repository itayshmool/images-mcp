#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { google } from "googleapis";
import type { drive_v3 } from "googleapis";
import { authenticate, createOAuth2Client, AuthServer } from './auth.js';
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
  if (!authClient) throw new Error('Not authenticated');
  if (_drive && _lastAuthClient === authClient) return _drive;
  _drive = google.drive({ version: 'v3', auth: authClient });
  _lastAuthClient = authClient;
  return _drive;
}

async function resolvePath(pathStr: string): Promise<string> {
  if (!pathStr || pathStr === '/') return 'root';
  const parts = pathStr.replace(/^\/+|\/+$/g, '').split('/');
  let currentFolderId = 'root';

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
        requestBody: { name: part, mimeType: FOLDER_MIME_TYPE, parents: [currentFolderId] },
        fields: 'id',
        supportsAllDrives: true,
      });
      if (!folder.data.id) throw new Error(`Failed to create folder: ${part}`);
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
    authClient = await authenticationPromise;
    return;
  }
  authenticationPromise = authenticate();
  try {
    authClient = await authenticationPromise;
  } finally {
    authenticationPromise = null;
  }
}

function buildToolContext(): ToolContext {
  return { authClient, getDrive, log, resolveFolderId };
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
    log('Error', { error: (error as Error).message });
    return errorResponse((error as Error).message);
  }
});

function showHelp(): void {
  console.log(`
Images MCP Server v${VERSION}

Usage:
  npx images-mcp [command]

Commands:
  auth     Sign in with Google (opens browser)
  start    Start the MCP server (default)
  version  Show version
  help     Show this message

No API keys or cloud projects needed — just sign in with Google.
`);
}

async function runAuthServer(): Promise<void> {
  const oauth2Client = createOAuth2Client();
  const authServerInstance = new AuthServer(oauth2Client);
  const success = await authServerInstance.start(true);

  if (!success && !authServerInstance.authCompletedSuccessfully) {
    console.error("Authentication failed.");
    process.exit(1);
  }
  if (authServerInstance.authCompletedSuccessfully) {
    console.log("Already signed in.");
    process.exit(0);
  }

  console.log("Complete the sign-in in your browser...");
  const check = setInterval(async () => {
    if (authServerInstance.authCompletedSuccessfully) {
      clearInterval(check);
      await authServerInstance.stop();
      console.log("Signed in successfully!");
      process.exit(0);
    }
  }, 1000);
}

async function main() {
  const command = process.argv.slice(2).find(a => !a.startsWith('--')) ||
    (['--version', '-v'].includes(process.argv[2]) ? 'version' :
     ['--help', '-h'].includes(process.argv[2]) ? 'help' : undefined);

  switch (command) {
    case 'auth':
      await runAuthServer();
      break;
    case 'version': case '--version': case '-v':
      console.log(`Images MCP Server v${VERSION}`);
      break;
    case 'help': case '--help': case '-h':
      showHelp();
      break;
    case 'start':
    case undefined: {
      console.error("Starting Images MCP server...");
      const transport = new StdioServerTransport();
      await server.connect(transport);
      log('Server started');
      process.on('SIGINT', async () => { await server.close(); process.exit(0); });
      process.on('SIGTERM', async () => { await server.close(); process.exit(0); });
      break;
    }
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
