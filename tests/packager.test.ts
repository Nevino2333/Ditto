import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Packager } from '../packages/packager/src';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'sample-app');

describe('Packager', () => {
  let packager: Packager;
  let tempDir: string;
  let ditFilePath: string;

  beforeAll(() => {
    packager = new Packager();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ditto-test-'));
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should pack an application into a .dit file', async () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, 'manifest.json'), 'utf-8'));

    ditFilePath = await packager.pack({
      type: 'app',
      manifest,
      frontendDir: path.join(FIXTURES_DIR, 'frontend'),
      backendDir: path.join(FIXTURES_DIR, 'backend'),
      iconPath: path.join(FIXTURES_DIR, 'icon.svg'),
      outputPath: path.join(tempDir, 'sample.dit'),
    });

    expect(ditFilePath).toBeDefined();
    expect(fs.existsSync(ditFilePath)).toBe(true);
    expect(ditFilePath.endsWith('.dit')).toBe(true);
  });

  it('should validate a .dit file', async () => {
    const result = await packager.validate(ditFilePath);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should unpack a .dit file', async () => {
    const unpackDir = path.join(tempDir, 'unpacked');
    fs.mkdirSync(unpackDir, { recursive: true });

    const result = await packager.unpack(ditFilePath, unpackDir);

    expect(result.manifest.id).toBe('com.ditto.sample');
    expect(result.type).toBe('app');
    expect(result.hasBackend).toBe(true);
    expect(result.hasEncryption).toBe(false);
    expect(result.hasSignature).toBe(false);
    expect(fs.existsSync(path.join(unpackDir, 'frontend', 'index.html'))).toBe(true);
  });

  it('should encrypt and decrypt a .dit file', async () => {
    const encryptedPath = await packager.encrypt(ditFilePath, 'test-password-123');
    expect(fs.existsSync(encryptedPath)).toBe(true);

    const encryptedUnpackDir = path.join(tempDir, 'encrypted-check');
    fs.mkdirSync(encryptedUnpackDir, { recursive: true });
    const encryptedResult = await packager.unpack(encryptedPath, encryptedUnpackDir);
    expect(encryptedResult.hasEncryption).toBe(true);

    const decryptedPath = await packager.decrypt(encryptedPath, 'test-password-123');
    expect(fs.existsSync(decryptedPath)).toBe(true);

    const unpackDir = path.join(tempDir, 'decrypted');
    fs.mkdirSync(unpackDir, { recursive: true });
    const result = await packager.unpack(decryptedPath, unpackDir);
    expect(result.manifest.id).toBe('com.ditto.sample');
    expect(result.hasEncryption).toBe(false);
  });

  it('should reject invalid .dit files', async () => {
    const invalidPath = path.join(tempDir, 'invalid.dit');
    fs.writeFileSync(invalidPath, 'not a zip file');

    const result = await packager.validate(invalidPath);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
