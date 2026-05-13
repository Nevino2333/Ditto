import * as fs from 'node:fs';
import * as path from 'node:path';

export async function handleInstall(args: string[]): Promise<void> {
  let ditFile = '';
  let serverUrl = 'http://localhost:3001';

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--server':
      case '-s':
        serverUrl = args[++i];
        break;
      case '--help':
      case '-h':
        console.log(`
Usage: ditto install <file> [options]

Options:
  --server, -s    Ditto server URL (default: http://localhost:3001)
  --help, -h      Show help
`);
        return;
      default:
        if (!ditFile) ditFile = args[i];
        break;
    }
  }

  if (!ditFile) {
    console.error('Error: Please specify a .dit file to install');
    process.exit(1);
  }

  if (!fs.existsSync(ditFile)) {
    console.error(`Error: File not found: ${ditFile}`);
    process.exit(1);
  }

  const ext = path.extname(ditFile);
  if (!['.dit', '.ditx', '.ditc', '.ditz'].includes(ext)) {
    console.error(`Error: Invalid file extension: ${ext}. Expected .dit, .ditx, .ditc, or .ditz`);
    process.exit(1);
  }

  const fileBuffer = fs.readFileSync(ditFile);
  const fileName = path.basename(ditFile);

  try {
    const response = await fetch(`${serverUrl}/api/apps/install`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Filename': fileName,
      },
      body: fileBuffer,
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Error: Installation failed (${response.status}): ${error}`);
      process.exit(1);
    }

    const result = await response.json() as { id?: string; hasBackend?: boolean };
    console.log(`✓ Installed: ${result.id ?? fileName}`);
    if (result.hasBackend) {
      console.log(`  Backend: registered (will start on first use)`);
    }
  } catch {
    console.error(`Error: Failed to connect to Ditto server at ${serverUrl}`);
    console.error(`  Make sure the server is running and accessible`);
    process.exit(1);
  }
}
