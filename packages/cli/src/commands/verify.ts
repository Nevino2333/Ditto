import { Packager } from '@ditto/packager';

export async function handleVerify(args: string[]): Promise<void> {
  let ditFile = '';
  let checkDeps = false;
  let minVersion = '';

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--help':
      case '-h':
        console.log(`
Usage: ditto verify <file>

Options:
  --help, -h              Show help
  --check-deps            Check dependency declarations
  --min-version <ver>     Check minimum Ditto version compatibility
`);
        return;
      case '--check-deps':
        checkDeps = true;
        break;
      case '--min-version':
        minVersion = args[++i] ?? '';
        break;
      default:
        if (!ditFile && !args[i].startsWith('--')) ditFile = args[i];
        break;
    }
  }

  if (!ditFile) {
    console.error('Error: Please specify a .dit file to verify');
    process.exit(1);
  }

  const packager = new Packager();

  console.log('Validating package structure...');
  const validation = await packager.validate(ditFile, {
    checkDependencies: checkDeps,
    minDittoVersion: minVersion || undefined,
  });

  if (validation.valid) {
    console.log('✓ Package structure is valid');
  } else {
    console.error('✗ Package validation failed:');
    for (const err of validation.errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  if (validation.warnings.length > 0) {
    console.log('Warnings:');
    for (const warn of validation.warnings) {
      console.log(`  ⚠ ${warn}`);
    }
  }

  console.log('Verifying signature...');
  const verifyResult = await packager.verify(ditFile);
  if (verifyResult.verified) {
    console.log(`✓ Signature verified (algorithm: ${verifyResult.algorithm})`);
  } else if (verifyResult.error) {
    console.log(`  No signature found or verification failed: ${verifyResult.error}`);
  }

  console.log('\n✓ Verification complete');
}
