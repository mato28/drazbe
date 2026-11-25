import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const monorepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// The monorepo keeps a single .env at the root (Next only auto-loads apps/web/.env*).
// In production, env vars come from the container environment instead.
const rootEnv = path.join(monorepoRoot, '.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: monorepoRoot,
  // Workspace packages ship TypeScript source.
  transpilePackages: ['@domik/core', '@domik/db', '@domik/shared'],
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
