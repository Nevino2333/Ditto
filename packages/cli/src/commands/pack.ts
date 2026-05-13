import { Packager } from '@ditto/packager';
import type { AppManifest, PackOptions } from '@ditto/shared';
import * as fs from 'node:fs';
import * as path from 'node:path';

export async function handlePack(args: string[]): Promise<void> {
  let srcDir = '.';
  let outputPath: string | undefined;
  let packType: 'app' | 'widget' | 'plugin' | 'theme' = 'app';
  let encrypt = false;
  let sign = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--src':
        srcDir = args[++i];
        break;
      case '--output':
      case '-o':
        outputPath = args[++i];
        break;
      case '--type':
      case '-t':
        packType = args[++i] as 'app' | 'widget' | 'plugin' | 'theme';
        break;
      case '--encrypt':
      case '-e':
        encrypt = true;
        break;
      case '--sign':
      case '-s':
        sign = true;
        break;
      case '--help':
      case '-h':
        console.log(`
Usage: ditto pack [options]

Options:
  --src <dir>       Source directory (default: current directory)
  --output, -o      Output file path
  --type, -t        Package type: app|widget|plugin|theme (default: app)
  --encrypt, -e     Encrypt the package
  --sign, -s        Sign the package
  --help, -h        Show help
`);
        return;
    }
  }

  const manifestPath = path.join(srcDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error(`Error: manifest.json not found in ${srcDir}`);
    process.exit(1);
  }

  const manifest: AppManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

  const frontendDir = path.join(srcDir, 'frontend');
  if (!fs.existsSync(frontendDir)) {
    console.error(`Error: frontend/ directory not found in ${srcDir}`);
    process.exit(1);
  }

  const backendDir = path.join(srcDir, 'backend');
  const hasBackend = fs.existsSync(backendDir);

  const iconSvgPath = path.join(srcDir, 'icon.svg');
  const iconPngPath = path.join(srcDir, 'icon.png');
  const hasIcon = fs.existsSync(iconSvgPath) || fs.existsSync(iconPngPath);

  const options: PackOptions = {
    type: packType,
    manifest,
    frontendDir,
    backendDir: hasBackend ? backendDir : undefined,
    iconPath: hasIcon ? (fs.existsSync(iconSvgPath) ? iconSvgPath : iconPngPath) : undefined,
    outputPath,
  };

  if (encrypt) {
    const password = process.env.DITTO_ENCRYPT_PASSWORD;
    if (!password) {
      console.error('Error: DITTO_ENCRYPT_PASSWORD environment variable is required for encryption');
      process.exit(1);
    }
    options.encrypt = { password, algorithm: 'aes-256-gcm' };
  }

  if (sign) {
    const privateKeyPath = process.env.DITTO_SIGN_KEY;
    if (!privateKeyPath) {
      console.error('Error: DITTO_SIGN_KEY environment variable (path to private key) is required for signing');
      process.exit(1);
    }
    options.sign = { privateKeyPath, algorithm: 'ed25519' };
  }

  const packager = new Packager();
  const result = await packager.pack(options);

  const stats = fs.statSync(result);
  console.log(`✓ Package created: ${result}`);
  console.log(`  Size: ${(stats.size / 1024).toFixed(1)} KB`);
  console.log(`  Type: ${packType}`);
  console.log(`  Frontend: ✓`);
  if (hasBackend) console.log(`  Backend: ✓`);
  if (encrypt) console.log(`  Encrypted: ✓`);
  if (sign) console.log(`  Signed: ✓`);
}
