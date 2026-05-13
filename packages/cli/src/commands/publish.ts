import * as fs from 'node:fs';
import * as path from 'node:path';

export async function handlePublish(args: string[]): Promise<void> {
  let ditFile = '';
  let registry = 'https://market.ditto.dev';

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--registry':
      case '-r':
        registry = args[++i];
        break;
      case '--help':
      case '-h':
        console.log(`
Usage: ditto publish <file> [options]

Options:
  --registry, -r   Market registry URL (default: https://market.ditto.dev)
  --help, -h       Show help
`);
        return;
      default:
        if (!ditFile) ditFile = args[i];
        break;
    }
  }

  if (!ditFile) {
    console.error('Error: Please specify a .dit file to publish');
    process.exit(1);
  }

  if (!fs.existsSync(ditFile)) {
    console.error(`Error: File not found: ${ditFile}`);
    process.exit(1);
  }

  const fileBuffer = fs.readFileSync(ditFile);
  const fileName = path.basename(ditFile);

  try {
    const response = await fetch(`${registry}/api/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Filename': fileName,
      },
      body: fileBuffer,
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Error: Publish failed (${response.status}): ${error}`);
      process.exit(1);
    }

    const result = await response.json() as { id?: string };
    console.log(`✓ Published: ${result.id ?? fileName}`);
    console.log(`  Registry: ${registry}`);
  } catch {
    console.error(`Error: Failed to connect to registry at ${registry}`);
    process.exit(1);
  }
}
