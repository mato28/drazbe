import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';
import { runMigrations } from '../migrate';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

/**
 * Integration tests run against a real PostgreSQL 16.
 * - default: a disposable testcontainers instance (needs Docker)
 * - TEST_DATABASE_URL: use an existing, EMPTY database instead (e.g. in CI)
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  let container: StartedPostgreSqlContainer | undefined;
  let url = process.env.TEST_DATABASE_URL;

  if (!url) {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withEnvironment({ TZ: 'UTC', PGTZ: 'UTC' })
      .start();
    url = container.getConnectionUri();
  }

  await runMigrations(url);
  project.provide('databaseUrl', url);

  return async () => {
    await container?.stop();
  };
}
