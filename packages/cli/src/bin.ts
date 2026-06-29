import { handlePack } from './commands/pack';
import { handleInstall } from './commands/install';
import { handleVerify } from './commands/verify';
import { handlePublish } from './commands/publish';
import { handleInit } from './commands/init';

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  switch (command) {
    case 'init':
    case 'create':
    case 'new':
      await handleInit(args.slice(1));
      break;
    case 'pack':
      await handlePack(args.slice(1));
      break;
    case 'install':
      await handleInstall(args.slice(1));
      break;
    case 'verify':
      await handleVerify(args.slice(1));
      break;
    case 'publish':
      await handlePublish(args.slice(1));
      break;
    case 'help':
    case '--help':
    case '-h':
      printHelp();
      break;
    case 'version':
    case '--version':
    case '-v':
      console.log('@ditto/cli v0.1.0');
      break;
    default:
      if (command) {
        console.error(`Unknown command: ${command}`);
      }
      printHelp();
      process.exit(command ? 1 : 0);
  }
}

function printHelp() {
  console.log(`
Ditto CLI - WebOS Application Toolkit

Usage: ditto <command> [options]

Commands:
  init      Scaffold a new Ditto application from template
  pack      Package an application into a .dit file
  install   Install a .dit file to a Ditto server
  verify    Verify the integrity and signature of a .dit file
  publish   Publish a .dit file to the Ditto Market

Options:
  -h, --help     Show help
  -v, --version  Show version

Quick start:
  ditto init --name "My App" --id com.example.myapp
  ditto init --name "Notes" --dit          # dit-type with backend Cell
  ditto pack --src .                       # Build .dit package
  ditto install --file my-app.dit          # Install to server
`);
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
