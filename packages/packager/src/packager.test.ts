import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Packager } from './packager';
import { encryptData, decryptData, deriveKey, generateSalt } from './crypto';
import type { AppManifest } from '@ditto/shared';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

describe('Crypto', () => {
  it('should derive consistent keys', () => {
    const salt = generateSalt();
    const key1 = deriveKey('password', salt, 100000);
    const key2 = deriveKey('password', salt, 100000);
    expect(key1.equals(key2)).toBe(true);
  });

  it('should derive different keys for different passwords', () => {
    const salt = generateSalt();
    const key1 = deriveKey('password1', salt, 100000);
    const key2 = deriveKey('password2', salt, 100000);
    expect(key1.equals(key2)).toBe(false);
  });

  it('should encrypt and decrypt data correctly', () => {
    const salt = generateSalt();
    const data = Buffer.from('Hello, Ditto!');
    const encrypted = encryptData(data, 'password', salt, 100000);
    const decrypted = decryptData(encrypted, 'password', salt, 100000);
    expect(decrypted.toString()).toBe('Hello, Ditto!');
  });

  it('should fail decryption with wrong password', () => {
    const salt = generateSalt();
    const data = Buffer.from('Hello, Ditto!');
    const encrypted = encryptData(data, 'password', salt, 100000);
    expect(() => decryptData(encrypted, 'wrong-password', salt, 100000)).toThrow();
  });

  it('should generate different salts', () => {
    const salt1 = generateSalt();
    const salt2 = generateSalt();
    expect(salt1.equals(salt2)).toBe(false);
  });
});

describe('Packager', () => {
  let packager: Packager;
  let tempDir: string;
  let sampleAppDir: string;
  let sampleManifest: AppManifest;

  beforeAll(() => {
    packager = new Packager();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ditto-packager-test-'));

    sampleAppDir = path.join(tempDir, 'sample-app');
    fs.mkdirSync(path.join(sampleAppDir, 'frontend'), { recursive: true });
    fs.mkdirSync(path.join(sampleAppDir, 'backend'), { recursive: true });

    sampleManifest = {
      id: 'com.test.sample',
      name: 'Sample Test App',
      version: '1.0.0',
      entry: 'frontend/index.html',
      sandbox: 'strict',
      permissions: ['fs.read'],
      type: 'app',
      window: { width: 800, height: 600 },
    };

    fs.writeFileSync(path.join(sampleAppDir, 'manifest.json'), JSON.stringify(sampleManifest, null, 2));
    fs.writeFileSync(path.join(sampleAppDir, 'icon.svg'), '<svg></svg>');
    fs.writeFileSync(path.join(sampleAppDir, 'frontend', 'index.html'), '<html><body>Hello</body></html>');
    fs.writeFileSync(path.join(sampleAppDir, 'frontend', 'app.js'), 'console.log("hello");');
    fs.writeFileSync(path.join(sampleAppDir, 'backend', 'index.ts'), 'export default {};');
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should pack an app into a .dit file', async () => {
    const outputPath = path.join(tempDir, 'output', 'sample.dit');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    const result = await packager.pack({
      type: 'app',
      manifest: sampleManifest,
      frontendDir: path.join(sampleAppDir, 'frontend'),
      backendDir: path.join(sampleAppDir, 'backend'),
      iconPath: path.join(sampleAppDir, 'icon.svg'),
      outputPath,
    });

    expect(fs.existsSync(result)).toBe(true);
    expect(result.endsWith('.dit')).toBe(true);
  });

  it('should validate a valid .dit file', async () => {
    const ditPath = path.join(tempDir, 'output', 'sample.dit');
    const result = await packager.validate(ditPath);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should unpack a .dit file', async () => {
    const ditPath = path.join(tempDir, 'output', 'sample.dit');
    const unpackDir = path.join(tempDir, 'unpacked');
    fs.mkdirSync(unpackDir, { recursive: true });

    const result = await packager.unpack(ditPath, unpackDir);
    expect(result.manifest.id).toBe('com.test.sample');
    expect(result.type).toBe('app');
    expect(result.hasBackend).toBe(true);
    expect(fs.existsSync(path.join(unpackDir, 'frontend', 'index.html'))).toBe(true);
  });

  it('should reject invalid .dit files', async () => {
    const invalidPath = path.join(tempDir, 'invalid.dit');
    fs.writeFileSync(invalidPath, 'not a zip file');
    const result = await packager.validate(invalidPath);
    expect(result.valid).toBe(false);
  });

  it('should pack a widget into a .ditx file', async () => {
    const widgetManifest: AppManifest = {
      ...sampleManifest,
      id: 'com.test.widget',
      type: 'widget',
    };
    const outputPath = path.join(tempDir, 'output', 'widget.ditx');

    const result = await packager.pack({
      type: 'widget',
      manifest: widgetManifest,
      frontendDir: path.join(sampleAppDir, 'frontend'),
      iconPath: path.join(sampleAppDir, 'icon.svg'),
      outputPath,
    });

    expect(result.endsWith('.ditx')).toBe(true);
  });

  it('should pack a theme into a .ditz file', async () => {
    const themeManifest: AppManifest = {
      ...sampleManifest,
      id: 'com.test.theme',
      type: 'theme',
    };
    const outputPath = path.join(tempDir, 'output', 'theme.ditz');

    const result = await packager.pack({
      type: 'theme',
      manifest: themeManifest,
      frontendDir: path.join(sampleAppDir, 'frontend'),
      iconPath: path.join(sampleAppDir, 'icon.svg'),
      outputPath,
    });

    expect(result.endsWith('.ditz')).toBe(true);
  });
});
