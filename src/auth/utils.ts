import * as path from 'path';
import * as os from 'os';

function getConfigDir(): string {
  const configHome = process.env.XDG_CONFIG_HOME ||
    path.join(os.homedir(), '.config');
  return path.join(configHome, 'images-mcp');
}

export function getSecureTokenPath(): string {
  const customPath = process.env.IMAGES_MCP_TOKEN_PATH;
  if (customPath) return path.resolve(customPath);
  return path.join(getConfigDir(), 'tokens.json');
}
