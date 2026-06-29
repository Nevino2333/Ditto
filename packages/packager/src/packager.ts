import type { PackOptions, UnpackResult, ValidationResult, VerifyResult, AppManifest } from '@ditto/shared';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import archiver from 'archiver';
import decompress from 'decompress';
import { createReadStream, createWriteStream } from 'node:fs';
import { encryptData, decryptData, generateSalt } from './crypto';

const TYPE_EXTENSION_MAP: Record<PackOptions['type'], string> = {
  app: '.dit',
  widget: '.ditx',
  plugin: '.ditc',
  theme: '.ditz',
  dit: '.dit',
};

const CODE_FILE_EXTENSIONS = new Set(['.js', '.ts', '.html', '.css', '.mjs', '.cjs']);

const ITERATIONS = 100000;

export class Packager {
  async pack(options: PackOptions): Promise<string> {
    const { type, manifest, frontendDir, backendDir, iconPath, outputPath, encrypt: encryptOpt, sign: signOpt } = options;

    if (!fs.existsSync(frontendDir)) {
      throw new Error(`Frontend directory not found: ${frontendDir}`);
    }

    const ext = TYPE_EXTENSION_MAP[type];
    const defaultOutputPath = outputPath ?? `${manifest.id}-${manifest.version}${ext}`;
    const outputFilePath = path.resolve(defaultOutputPath);

    await fs.promises.mkdir(path.dirname(outputFilePath), { recursive: true });

    const manifestJson = JSON.stringify(manifest, null, 2);

    const archive = archiver('zip', { zlib: { level: 9 } });
    const stream = createWriteStream(outputFilePath);

    await new Promise<void>((resolve, reject) => {
      stream.on('close', resolve);
      stream.on('error', reject);
      archive.on('error', reject);

      archive.pipe(stream);

      archive.append(manifestJson, { name: 'manifest.json' });

      if (iconPath && fs.existsSync(iconPath)) {
        archive.file(iconPath, { name: path.basename(iconPath) });
      }

      archive.directory(frontendDir, 'frontend/');

      if (backendDir && fs.existsSync(backendDir)) {
        archive.directory(backendDir, 'backend/');
      }

      archive.finalize();
    });

    if (encryptOpt) {
      const encryptedPath = await this.encryptInternal(outputFilePath, encryptOpt.password);
      if (encryptedPath !== outputFilePath) {
        await fs.promises.unlink(outputFilePath);
        await fs.promises.rename(encryptedPath, outputFilePath);
      }
    }

    if (signOpt) {
      const signedPath = await this.signInternal(outputFilePath, signOpt.privateKeyPath);
      if (signedPath !== outputFilePath) {
        await fs.promises.unlink(outputFilePath);
        await fs.promises.rename(signedPath, outputFilePath);
      }
    }

    return outputFilePath;
  }

  async unpack(archivePath: string, destDir: string): Promise<UnpackResult> {
    if (!fs.existsSync(archivePath)) {
      throw new Error(`Archive not found: ${archivePath}`);
    }

    await decompress(archivePath, destDir);

    const manifestPath = path.join(destDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      throw new Error('manifest.json not found in archive');
    }

    const manifestContent = await fs.promises.readFile(manifestPath, 'utf-8');
    const manifest: AppManifest = JSON.parse(manifestContent);

    const hasEncryption = fs.existsSync(path.join(destDir, 'encryption.meta'));
    const hasSignature = fs.existsSync(path.join(destDir, 'signature.sig'));

    const frontendDir = path.join(destDir, 'frontend');
    const backendDir = fs.existsSync(path.join(destDir, 'backend')) ? path.join(destDir, 'backend') : undefined;
    const iconPath = manifest.icon ? path.join(destDir, manifest.icon) : undefined;

    const type = manifest.type ?? 'app';

    return {
      manifest,
      type,
      frontendDir,
      backendDir,
      iconPath,
      hasBackend: !!backendDir,
      hasEncryption,
      hasSignature,
    };
  }

  async validate(archivePath: string, options?: { checkDependencies?: boolean; minDittoVersion?: string }): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!fs.existsSync(archivePath)) {
      errors.push(`Archive file not found: ${archivePath}`);
      return { valid: false, errors, warnings };
    }

    let tempDir: string | undefined;

    try {
      tempDir = await fs.promises.mkdtemp(path.join(path.dirname(archivePath), '.dit-validate-'));

      let files: decompress.File[];
      try {
        files = await decompress(archivePath, tempDir);
      } catch {
        errors.push('Archive is not a valid ZIP file');
        return { valid: false, errors, warnings };
      }

      const fileNames = new Set(files.map((f) => f.path));

      if (!fileNames.has('manifest.json')) {
        errors.push('manifest.json is missing from archive');
        return { valid: false, errors, warnings };
      }

      let manifest: AppManifest;
      try {
        const manifestContent = await fs.promises.readFile(path.join(tempDir, 'manifest.json'), 'utf-8');
        manifest = JSON.parse(manifestContent);
      } catch {
        errors.push('manifest.json is not valid JSON');
        return { valid: false, errors, warnings };
      }

      if (!manifest.id) {
        errors.push('manifest.json missing required field: id');
      }
      if (!manifest.name) {
        errors.push('manifest.json missing required field: name');
      }
      if (!manifest.version) {
        errors.push('manifest.json missing required field: version');
      }
      if (!manifest.entry) {
        errors.push('manifest.json missing required field: entry');
      }

      if (manifest.id && !/^[\w.-]+$/.test(manifest.id)) {
        errors.push('manifest.id contains invalid characters (only alphanumeric, dots, hyphens, underscores allowed)');
      }

      if (manifest.version && !/^\d+\.\d+\.\d+/.test(manifest.version)) {
        warnings.push('manifest.version does not follow semver format (e.g., 1.0.0)');
      }

      const hasFrontendDir = Array.from(fileNames).some((f) => f.startsWith('frontend/'));
      if (!hasFrontendDir) {
        errors.push('frontend/ directory is missing from archive');
      }

      if (manifest.icon) {
        const iconInArchive = Array.from(fileNames).some((f) => f === manifest.icon);
        if (!iconInArchive) {
          warnings.push(`Icon file "${manifest.icon}" referenced in manifest not found in archive`);
        }
      } else {
        warnings.push('No icon specified in manifest');
      }

      if (manifest.backend) {
        if (!manifest.backend.entry) {
          errors.push('manifest.backend.entry is required when backend is specified');
        }
        if (manifest.backend.type !== 'cell') {
          warnings.push(`manifest.backend.type "${manifest.backend.type}" is not supported, only "cell" is currently supported`);
        }
        const hasBackendDir = Array.from(fileNames).some((f) => f.startsWith('backend/'));
        if (!hasBackendDir) {
          errors.push('manifest specifies backend but backend/ directory is missing from archive');
        }
      }

      if (manifest.type === 'widget') {
        if (!manifest.id.startsWith('widget.')) {
          warnings.push('Widget packages should have IDs starting with "widget."');
        }
      } else if (manifest.type === 'theme') {
        const hasTokens = Array.from(fileNames).some((f) => f.includes('tokens.json'));
        if (!hasTokens) {
          warnings.push('Theme packages should include a tokens.json file');
        }
      }

      if (options?.checkDependencies && manifest.dependencies) {
        for (const [depId, depVersion] of Object.entries(manifest.dependencies)) {
          if (!depId || !depVersion) {
            warnings.push(`Invalid dependency: ${depId}@${depVersion}`);
          }
        }
      }

      if (options?.minDittoVersion && manifest.minDittoVersion) {
        if (this.compareVersions(manifest.minDittoVersion, options.minDittoVersion) > 0) {
          errors.push(`App requires Ditto >= ${manifest.minDittoVersion}, but current version is ${options.minDittoVersion}`);
        }
      }
    } finally {
      if (tempDir) {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private compareVersions(a: string, b: string): number {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const na = pa[i] ?? 0;
      const nb = pb[i] ?? 0;
      if (na > nb) return 1;
      if (na < nb) return -1;
    }
    return 0;
  }

  async encrypt(archivePath: string, password: string): Promise<string> {
    return this.encryptInternal(archivePath, password);
  }

  private async encryptInternal(archivePath: string, password: string): Promise<string> {
    if (!fs.existsSync(archivePath)) {
      throw new Error(`Archive not found: ${archivePath}`);
    }

    const tempDir = await fs.promises.mkdtemp(path.join(path.dirname(archivePath), '.dit-encrypt-'));

    try {
      await decompress(archivePath, tempDir);

      const salt = generateSalt();
      const encryptionMeta = {
        algorithm: 'aes-256-gcm',
        keyDerivation: 'pbkdf2',
        iterations: ITERATIONS,
        salt: salt.toString('base64'),
      };

      await this.encryptDirectory(path.join(tempDir, 'frontend'), password, salt, ITERATIONS);

      if (fs.existsSync(path.join(tempDir, 'backend'))) {
        await this.encryptDirectory(path.join(tempDir, 'backend'), password, salt, ITERATIONS);
      }

      await fs.promises.writeFile(
        path.join(tempDir, 'encryption.meta'),
        JSON.stringify(encryptionMeta, null, 2),
      );

      const parsed = path.parse(archivePath);
      const outputPath = path.join(parsed.dir, `${parsed.name}.encrypted${parsed.ext}`);

      await this.repackFromDirectory(tempDir, outputPath);

      return outputPath;
    } finally {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  }

  async decrypt(archivePath: string, password: string): Promise<string> {
    if (!fs.existsSync(archivePath)) {
      throw new Error(`Archive not found: ${archivePath}`);
    }

    const tempDir = await fs.promises.mkdtemp(path.join(path.dirname(archivePath), '.dit-decrypt-'));

    try {
      await decompress(archivePath, tempDir);

      const metaPath = path.join(tempDir, 'encryption.meta');
      if (!fs.existsSync(metaPath)) {
        throw new Error('encryption.meta not found in archive — archive is not encrypted');
      }

      const metaContent = await fs.promises.readFile(metaPath, 'utf-8');
      const meta = JSON.parse(metaContent);

      const salt = Buffer.from(meta.salt, 'base64');
      const iterations = meta.iterations;

      await this.decryptDirectory(path.join(tempDir, 'frontend'), password, salt, iterations);

      if (fs.existsSync(path.join(tempDir, 'backend'))) {
        await this.decryptDirectory(path.join(tempDir, 'backend'), password, salt, iterations);
      }

      await fs.promises.unlink(metaPath);

      const parsed = path.parse(archivePath);
      const outputPath = path.join(parsed.dir, `${parsed.name}.decrypted${parsed.ext}`);

      await this.repackFromDirectory(tempDir, outputPath);

      return outputPath;
    } finally {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  }

  async sign(archivePath: string, privateKeyPath: string): Promise<string> {
    return this.signInternal(archivePath, privateKeyPath);
  }

  private async signInternal(archivePath: string, privateKeyPath: string): Promise<string> {
    if (!fs.existsSync(archivePath)) {
      throw new Error(`Archive not found: ${archivePath}`);
    }
    if (!fs.existsSync(privateKeyPath)) {
      throw new Error(`Private key file not found: ${privateKeyPath}`);
    }

    const archiveData = await fs.promises.readFile(archivePath);
    const hash = crypto.createHash('sha256').update(archiveData).digest();

    const privateKeyPem = await fs.promises.readFile(privateKeyPath, 'utf-8');
    const privateKey = crypto.createPrivateKey({
      key: privateKeyPem,
      format: 'pem',
    });

    const signature = crypto.sign(null, hash, privateKey);

    const publicKey = crypto.createPublicKey(privateKey);
    const publicKeyDer = publicKey.export({ type: 'spki', format: 'der' });

    const signatureData = {
      algorithm: 'ed25519',
      value: signature.toString('base64'),
      publicKey: publicKeyDer.toString('base64'),
    };

    const tempDir = await fs.promises.mkdtemp(path.join(path.dirname(archivePath), '.dit-sign-'));

    try {
      await decompress(archivePath, tempDir);

      await fs.promises.writeFile(
        path.join(tempDir, 'signature.sig'),
        JSON.stringify(signatureData, null, 2),
      );

      const parsed = path.parse(archivePath);
      const outputPath = path.join(parsed.dir, `${parsed.name}.signed${parsed.ext}`);

      await this.repackFromDirectory(tempDir, outputPath);

      return outputPath;
    } finally {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  }

  async verify(archivePath: string): Promise<VerifyResult> {
    if (!fs.existsSync(archivePath)) {
      return { verified: false, error: `Archive not found: ${archivePath}` };
    }

    const tempDir = await fs.promises.mkdtemp(path.join(path.dirname(archivePath), '.dit-verify-'));

    try {
      await decompress(archivePath, tempDir);

      const sigPath = path.join(tempDir, 'signature.sig');
      if (!fs.existsSync(sigPath)) {
        return { verified: false, error: 'signature.sig not found in archive' };
      }

      const sigContent = await fs.promises.readFile(sigPath, 'utf-8');
      const sigData = JSON.parse(sigContent);

      if (sigData.algorithm !== 'ed25519') {
        return { verified: false, error: `Unsupported signature algorithm: ${sigData.algorithm}` };
      }

      await fs.promises.unlink(sigPath);

      await this.repackFromDirectory(tempDir, archivePath + '.verify-tmp');

      const archiveData = await fs.promises.readFile(archivePath + '.verify-tmp');
      const hash = crypto.createHash('sha256').update(archiveData).digest();

      await fs.promises.unlink(archivePath + '.verify-tmp');

      const publicKeyDer = Buffer.from(sigData.publicKey, 'base64');
      const publicKey = crypto.createPublicKey({
        key: publicKeyDer,
        format: 'der',
        type: 'spki',
      });

      const signature = Buffer.from(sigData.value, 'base64');

      const verified = crypto.verify(null, hash, publicKey, signature);

      if (verified) {
        return {
          verified: true,
          algorithm: sigData.algorithm,
          signer: sigData.publicKey,
        };
      } else {
        return {
          verified: false,
          algorithm: sigData.algorithm,
          error: 'Signature verification failed — archive may have been tampered with',
        };
      }
    } catch (err) {
      return {
        verified: false,
        error: err instanceof Error ? err.message : 'Unknown verification error',
      };
    } finally {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  }

  private async encryptDirectory(dir: string, password: string, salt: Buffer, iterations: number): Promise<void> {
    if (!fs.existsSync(dir)) return;

    const entries = await fs.promises.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await this.encryptDirectory(fullPath, password, salt, iterations);
      } else if (entry.isFile() && CODE_FILE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        const data = await fs.promises.readFile(fullPath);
        const encrypted = encryptData(data, password, salt, iterations);
        await fs.promises.writeFile(fullPath, encrypted);
      }
    }
  }

  private async decryptDirectory(dir: string, password: string, salt: Buffer, iterations: number): Promise<void> {
    if (!fs.existsSync(dir)) return;

    const entries = await fs.promises.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await this.decryptDirectory(fullPath, password, salt, iterations);
      } else if (entry.isFile() && CODE_FILE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        const data = await fs.promises.readFile(fullPath);
        try {
          const decrypted = decryptData(data, password, salt, iterations);
          await fs.promises.writeFile(fullPath, decrypted);
        } catch {
          throw new Error(`Failed to decrypt file: ${fullPath} — incorrect password or corrupted data`);
        }
      }
    }
  }

  private async repackFromDirectory(sourceDir: string, outputPath: string): Promise<void> {
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

    const archive = archiver('zip', { zlib: { level: 9 } });
    const stream = createWriteStream(outputPath);

    await new Promise<void>((resolve, reject) => {
      stream.on('close', resolve);
      stream.on('error', reject);
      archive.on('error', reject);

      archive.pipe(stream);
      archive.directory(sourceDir, false);
      archive.finalize();
    });
  }
}
