import { Packager } from '@ditto/packager';
import * as fs from 'node:fs';
import * as path from 'node:path';

const packager = new Packager();
const appsDir = path.resolve(__dirname, '..', 'test-apps');
const outputDir = path.resolve(__dirname, '..', 'server', 'data', 'market-packages');

fs.mkdirSync(outputDir, { recursive: true });

const apps = [
  { dir: 'com.ditto.notes', type: 'app' as const, hasBackend: true },
  { dir: 'com.ditto.calc', type: 'app' as const, hasBackend: false },
  { dir: 'com.ditto.weather', type: 'app' as const, hasBackend: false },
  { dir: 'com.ditto.timer', type: 'app' as const, hasBackend: false },
  { dir: 'com.ditto.draw', type: 'app' as const, hasBackend: false },
  { dir: 'com.ditto.todo', type: 'app' as const, hasBackend: false },
  { dir: 'com.ditto.code', type: 'app' as const, hasBackend: false },
  { dir: 'com.ditto.calendar', type: 'app' as const, hasBackend: false },
  { dir: 'com.ditto.theme.midnight', type: 'theme' as const, hasBackend: false },
  { dir: 'com.ditto.theme.ocean', type: 'theme' as const, hasBackend: false },
  { dir: 'com.ditto.theme.forest', type: 'theme' as const, hasBackend: false },
  { dir: 'com.ditto.theme.nord', type: 'theme' as const, hasBackend: false },
  { dir: 'widget.ditto.clock', type: 'widget' as const, hasBackend: false },
  { dir: 'widget.ditto.quote', type: 'widget' as const, hasBackend: false },
  { dir: 'widget.ditto.system', type: 'widget' as const, hasBackend: false },
  { dir: 'com.ditto.plugin.clipboard', type: 'plugin' as const, hasBackend: false },
];

async function main() {
  for (const app of apps) {
    const appPath = path.join(appsDir, app.dir);
    const manifestPath = path.join(appPath, 'manifest.json');

    if (!fs.existsSync(manifestPath)) {
      console.log(`Skipping ${app.dir}: manifest.json not found`);
      continue;
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const frontendDir = path.join(appPath, 'frontend');
    const backendDir = app.hasBackend ? path.join(appPath, 'backend') : undefined;

    const ext = app.type === 'app' ? '.dit' : app.type === 'theme' ? '.ditz' : app.type === 'widget' ? '.ditx' : app.type === 'plugin' ? '.ditc' : '.dit';
    const outputPath = path.join(outputDir, `${app.dir}-${manifest.version}${ext}`);

    try {
      const result = await packager.pack({
        type: app.type,
        manifest,
        frontendDir,
        backendDir,
        outputPath,
      });

      const stats = fs.statSync(result);
      console.log(`✅ Packed ${app.dir} -> ${path.basename(result)} (${(stats.size / 1024).toFixed(1)} KB)`);
    } catch (e) {
      console.error(`❌ Failed to pack ${app.dir}:`, e instanceof Error ? e.message : e);
    }
  }
}

main();
