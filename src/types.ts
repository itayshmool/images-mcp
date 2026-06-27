import type { drive_v3 } from 'googleapis';

export interface ToolResult {
  [key: string]: unknown;
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolContext {
  authClient: any;
  getDrive: () => drive_v3.Drive;
  log: (message: string, data?: any) => void;
  resolveFolderId: (input: string | undefined) => Promise<string>;
}

export function errorResponse(message: string): ToolResult {
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}
