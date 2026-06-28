# Images MCP

An MCP server for generating and editing images using Google Gemini. Works with Claude Desktop, Claude Code, and any MCP client.

## What it does

- **Generate images** from text prompts
- **Edit images** with instructions (style transfer, background removal, modifications)
- Save to local disk or Google Drive
- Multiple aspect ratios, resolutions, and models

## Setup

### 1. Create Google Cloud OAuth credentials (one-time, ~5 minutes)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use an existing one)
3. Enable the **Generative Language API**:
   - Go to **APIs & Services → Library**
   - Search for "Generative Language API"
   - Click **Enable**
4. Enable the **Google Drive API** (optional, for saving images to Drive):
   - Search for "Google Drive API" in the library
   - Click **Enable**
5. Configure the **OAuth consent screen**:
   - Go to **APIs & Services → OAuth consent screen**
   - Choose **External** user type
   - Fill in the app name (e.g., "Images MCP") and your email
   - Add scopes: `generative-language` and `drive.file`
   - Add your email as a test user
   - Save
6. Create **OAuth credentials**:
   - Go to **APIs & Services → Credentials**
   - Click **Create Credentials → OAuth client ID**
   - Choose **Desktop app** as the application type
   - Give it a name (e.g., "Images MCP")
   - Click **Create**
   - Copy the **Client ID** and **Client Secret**

### 2. Install

```bash
git clone https://github.com/itayshmool/images-mcp.git
cd images-mcp
npm install
npm run build
```

### 3. Sign in with Google

```bash
GOOGLE_CLIENT_ID="your-client-id" \
GOOGLE_CLIENT_SECRET="your-client-secret" \
npm run auth
```

Your browser will open for Google sign-in. After signing in, tokens are saved locally at `~/.config/images-mcp/tokens.json`.

### 4. Add to your MCP client

#### Claude Code

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "images-mcp": {
      "command": "node",
      "args": ["/path/to/images-mcp/dist/index.js"],
      "env": {
        "GOOGLE_CLIENT_ID": "your-client-id",
        "GOOGLE_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

#### Claude Desktop

Add to your Claude Desktop config:

```json
{
  "mcpServers": {
    "images-mcp": {
      "command": "node",
      "args": ["/path/to/images-mcp/dist/index.js"],
      "env": {
        "GOOGLE_CLIENT_ID": "your-client-id",
        "GOOGLE_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

## Tools

### generateImage

Generate an image from a text prompt.

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| prompt | Yes | — | Text description of the image |
| model | No | nano-banana-2 | `nano-banana-2` (fast) or `nano-banana-pro` (high fidelity) |
| aspectRatio | No | 1:1 | 1:1, 16:9, 9:16, 4:3, 3:4, etc. |
| resolution | No | 1K | 512, 1K, 2K, or 4K |
| saveTo | No | local | `local` or `drive` |
| localPath | No | system temp | Directory to save to |
| fileName | No | auto | Output file name |

### editImage

Edit an existing image with a text instruction.

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| prompt | Yes | — | Edit instruction |
| sourceImagePath | No | — | Local path to source image |
| sourceDriveFileId | No | — | Google Drive file ID of source image |
| model | No | nano-banana-2 | `nano-banana-2` or `nano-banana-pro` |
| saveTo | No | local | `local` or `drive` |

Provide either `sourceImagePath` or `sourceDriveFileId`.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| GOOGLE_CLIENT_ID | Yes | OAuth client ID from Google Cloud Console |
| GOOGLE_CLIENT_SECRET | Yes | OAuth client secret from Google Cloud Console |
| IMAGES_MCP_TOKEN_PATH | No | Custom path for saved tokens (default: `~/.config/images-mcp/tokens.json`) |

## License

MIT
