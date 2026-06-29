import * as fs from 'node:fs';
import * as path from 'node:path';

interface InitOptions {
  name: string;
  appId: string;
  type: 'app' | 'widget' | 'theme' | 'plugin' | 'dit';
  dir: string;
  description: string;
  author: string;
  version: string;
  withBackend: boolean;
}

export async function handleInit(args: string[]): Promise<void> {
  const opts = parseArgs(args);
  if (!opts) return;

  await scaffoldApp(opts);
}

function parseArgs(args: string[]): InitOptions | null {
  let name = '';
  let appId = '';
  let type: InitOptions['type'] = 'app';
  let dir = '';
  let description = '';
  let author = '';
  let version = '1.0.0';
  let withBackend = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--name':
      case '-n':
        name = args[++i] ?? '';
        break;
      case '--id':
        appId = args[++i] ?? '';
        break;
      case '--type':
      case '-t':
        type = (args[++i] as InitOptions['type']) ?? 'app';
        break;
      case '--dir':
      case '-d':
        dir = args[++i] ?? '';
        break;
      case '--desc':
        description = args[++i] ?? '';
        break;
      case '--author':
      case '-a':
        author = args[++i] ?? '';
        break;
      case '--version':
        version = args[++i] ?? '1.0.0';
        break;
      case '--with-backend':
        withBackend = true;
        break;
      case '--dit':
        type = 'dit';
        withBackend = true;
        break;
      case '--help':
      case '-h':
        printInitHelp();
        return null;
    }
  }

  // 交互式提示缺失值（简化版：若未提供 name 则用目录名）
  if (!name) {
    const fallbackDir = dir || process.cwd();
    name = path.basename(path.resolve(fallbackDir));
  }
  if (!appId) {
    // 从 name 生成 appId：com.ditto.<sanitized-name>
    const sanitized = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    appId = `com.ditto.${sanitized}`;
  }
  if (!dir) {
    dir = path.join(process.cwd(), name.toLowerCase().replace(/\s+/g, '-'));
  }
  if (!description) {
    description = `${name} - a Ditto ${type} application`;
  }

  return { name, appId, type, dir, description, author, version, withBackend };
}

async function scaffoldApp(opts: InitOptions): Promise<void> {
  const { name, appId, type, dir, description, author, version, withBackend } = opts;

  // 校验 appId 格式
  if (!/^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+$/.test(appId)) {
    console.error(`Error: Invalid app id "${appId}". Must be reverse-domain format (e.g. com.example.app)`);
    process.exit(1);
  }

  // 创建目录结构
  const targetDir = path.resolve(dir);
  if (fs.existsSync(targetDir)) {
    const entries = fs.readdirSync(targetDir);
    if (entries.length > 0) {
      console.error(`Error: Directory "${targetDir}" is not empty`);
      process.exit(1);
    }
  }
  fs.mkdirSync(targetDir, { recursive: true });
  const frontendDir = path.join(targetDir, 'frontend');
  fs.mkdirSync(frontendDir, { recursive: true });

  // 生成 manifest.json
  const manifest = generateManifest(opts);
  fs.writeFileSync(
    path.join(targetDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    'utf-8'
  );

  // 生成 frontend/index.html
  const html = generateIndexHtml(opts);
  fs.writeFileSync(path.join(frontendDir, 'index.html'), html, 'utf-8');

  // 生成 README
  fs.writeFileSync(
    path.join(targetDir, 'README.md'),
    generateReadme(opts),
    'utf-8'
  );

  // 生成 .gitignore
  fs.writeFileSync(
    path.join(targetDir, '.gitignore'),
    'node_modules/\ndist/\n*.log\n.DS_Store\n',
    'utf-8'
  );

  // dit 类型：生成后端 Cell
  if (withBackend || type === 'dit') {
    const backendDir = path.join(targetDir, 'backend');
    fs.mkdirSync(backendDir, { recursive: true });
    fs.writeFileSync(
      path.join(backendDir, 'index.ts'),
      generateBackendCell(opts),
      'utf-8'
    );
    console.log(`✅ Created backend Cell at backend/index.ts`);
  }

  // 主题类型：生成 tokens
  if (type === 'theme') {
    const tokensDir = path.join(targetDir, 'tokens');
    fs.mkdirSync(tokensDir, { recursive: true });
    fs.writeFileSync(
      path.join(tokensDir, 'tokens.json'),
      generateThemeTokens(opts),
      'utf-8'
    );
    console.log(`✅ Created theme tokens at tokens/tokens.json`);
  }

  console.log(`\n🎉 Successfully created ${type} "${name}" at ${targetDir}`);
  console.log(`\nNext steps:`);
  console.log(`  cd ${path.relative(process.cwd(), targetDir) || '.'}`);
  console.log(`  # Edit frontend/index.html to build your app`);
  if (withBackend || type === 'dit') {
    console.log(`  # Edit backend/index.ts to implement server-side Cell logic`);
  }
  console.log(`  ditto pack --src . --type ${type}   # Package into .dit`);
  console.log(`  ditto install --file app.dit        # Install to server`);
}

function generateManifest(opts: InitOptions): Record<string, unknown> {
  const { appId, name, version, description, type, withBackend } = opts;

  const windowConfig = type === 'widget'
    ? { width: 320, height: 240, minWidth: 200, minHeight: 150, resizable: true, maximizable: false }
    : { width: 800, height: 600, minWidth: 400, minHeight: 300, resizable: true, maximizable: true };

  const manifest: Record<string, unknown> = {
    id: appId,
    name,
    version,
    description,
    icon: type === 'theme' ? '🎨' : type === 'widget' ? '🧩' : '📦',
    entry: 'frontend/index.html',
    category: type === 'theme' ? 'theme' : type === 'widget' ? 'widget' : 'utility',
    sandbox: 'trusted',
    permissions: [],
    type,
    window: windowConfig,
  };

  if (type === 'dit' || withBackend) {
    manifest.backend = {
      entry: 'backend/index.ts',
      type: 'cell',
      healthCheck: '/health',
    };
  }

  if (type === 'theme') {
    manifest.tokens = 'tokens/tokens.json';
  }

  return manifest;
}

function generateIndexHtml(opts: InitOptions): string {
  const { name, appId, type } = opts;
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0d1117;
      color: #c9d1d9;
      height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .container {
      max-width: 480px;
      text-align: center;
    }
    h1 { font-size: 24px; margin-bottom: 8px; }
    p { color: #8b949e; font-size: 14px; margin-bottom: 16px; }
    .app-id {
      font-family: 'SF Mono', Consolas, monospace;
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 4px 10px;
      font-size: 12px;
      color: #58a6ff;
      display: inline-block;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>${name}</h1>
    <p>欢迎使用 Ditto ${type} 应用模板。编辑此文件开始构建你的应用。</p>
    <span class="app-id">${appId}</span>
  </div>

  <!-- Ditto SDK：通过 &lt;script&gt; 标签注入（生产环境用 CDN 或本地打包） -->
  <script src="https://unpkg.com/@ditto/sdk@latest/dist/ditto-sdk.umd.js"></script>
  <script>
    // 初始化 SDK（应用运行在 iframe 内，SDK 通过 postMessage 与宿主通信）
    if (window.DittoSDK) {
      DittoSDK.install({ appId: '${appId}' });
    }

    // 示例：使用 SDK API
    document.querySelector('h1')?.addEventListener('click', async () => {
      if (window.DittoSDK) {
        const ui = DittoSDK.useDittoUI();
        ui.showNotification({ title: 'Hello', body: 'Welcome to ${name}!' });
      }
    });
  </script>
</body>
</html>
`;
}

function generateBackendCell(opts: InitOptions): string {
  const { appId, name } = opts;
  return `/**
 * ${name} - 后端 Cell 模块
 *
 * dit 类型的应用前后端对称：前端 iframe + 后端 Cell。
 * 此模块在服务端运行，通过 CellBridge 与前端通信。
 */
import type { AppCellModule, CellContext } from '@ditto/shared';

const app: AppCellModule = {
  async onInit(ctx: CellContext) {
    ctx.logger.info('[${appId}] Cell initialized');
  },

  async onStart(ctx: CellContext) {
    ctx.logger.info('[${appId}] Cell started');
  },

  async registerRoutes(router: any, ctx: CellContext) {
    // 注册 HTTP 路由（Hono 风格）
    router.get('/hello', (c: any) => {
      return c.json({ message: 'Hello from ${name}!', time: Date.now() });
    });

    router.get('/health', (c: any) => {
      return c.json({ status: 'ok', appId: '${appId}' });
    });
  },

  async registerWebSocket(ws: any, ctx: CellContext) {
    // 注册 WebSocket 消息处理
    ws.on('message', (data: any) => {
      ctx.logger.info('[${appId}] WS message:', data);
      ws.send(JSON.stringify({ type: 'echo', data }));
    });
  },

  async onDestroy(ctx: CellContext) {
    ctx.logger.info('[${appId}] Cell destroyed');
  },
};

export default app;
`;
}

function generateThemeTokens(opts: InitOptions): string {
  return `{
  "color": {
    "primary": {
      "500": "#3b82f6",
      "600": "#2563eb"
    },
    "surface": {
      "base": "#ffffff",
      "raised": "#f8fafc"
    },
    "text": {
      "primary": "#0f172a",
      "secondary": "#475569"
    },
    "border": {
      "subtle": "#e2e8f0"
    }
  },
  "typography": {
    "fontFamily": "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    "fontSize": {
      "base": "14px",
      "sm": "12px",
      "lg": "16px"
    }
  }
}
`;
}

function generateReadme(opts: InitOptions): string {
  const { name, appId, type, description, version } = opts;
  return `# ${name}

${description}

- **App ID**: \`${appId}\`
- **Type**: ${type}
- **Version**: ${version}

## 开发

编辑 \`frontend/index.html\` 构建应用界面。

${type === 'dit' ? `## 后端 Cell

编辑 \`backend/index.ts\` 实现服务端逻辑（HTTP 路由 + WebSocket）。

` : ''}## 打包与安装

\`\`\`bash
# 打包为 .dit
ditto pack --src . --type ${type}

# 安装到 Ditto 服务器
ditto install --file ${appId.replace(/\./g, '_')}.dit
\`\`\`

## 文档

- [Ditto 开发文档](https://github.com/Nevino2333/Ditto/tree/main/docs)
- [第三方应用开发指南](https://github.com/Nevino2333/Ditto/blob/main/docs/third-party-app-development.md)
`;
}

function printInitHelp(): void {
  console.log(`
Usage: ditto init [options]

Create a new Ditto application from a template.

Options:
  --name, -n <name>          Application name
  --id <id>                  Application ID (reverse-domain, e.g. com.example.app)
  --type, -t <type>          Application type: app|widget|theme|dit (default: app)
  --dir, -d <dir>            Target directory (default: ./<name>)
  --desc <description>       Application description
  --author, -a <author>      Author name
  --version <version>        Application version (default: 1.0.0)
  --with-backend             Include backend Cell (for app type)
  --dit                      Shortcut for --type dit (includes backend)
  --help, -h                 Show this help

Examples:
  # Create a basic app
  ditto init --name "My App" --id com.example.myapp

  # Create a dit-type app with backend Cell
  ditto init --name "Collaborative Notes" --id com.example.notes --dit

  # Create a widget
  ditto init --name "Clock Widget" --id widget.example.clock --type widget

  # Create a theme
  ditto init --name "Ocean Theme" --id com.example.theme.ocean --type theme
`);
}
