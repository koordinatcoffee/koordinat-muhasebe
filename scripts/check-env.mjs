// Fails the build when Supabase settings are missing; they are embedded into the
// bundle at build time, so a desktop build without them could never reach the database.
import { existsSync, readFileSync } from 'node:fs';

const REQUIRED_KEYS = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];

function readEnvFile(path) {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      }),
  );
}

const env = { ...readEnvFile('.env'), ...readEnvFile('.env.production'), ...process.env };
const missingKeys = REQUIRED_KEYS.filter((key) => !env[key]);

if (missingKeys.length > 0) {
  console.error(`\n✖ Missing environment variables: ${missingKeys.join(', ')}`);
  console.error('  Copy .env.example to .env and fill in the Supabase values before building.\n');
  process.exit(1);
}

console.log('✓ Supabase environment variables found');
