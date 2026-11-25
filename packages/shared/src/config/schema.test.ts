import { describe, expect, it } from 'vitest';
import { loadServerConfig, loadWorkerConfig } from './schema';

const validEnv = {
  APP_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgres://domik:domik@localhost:5432/domik',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  S3_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'eu-central',
  S3_BUCKET: 'domik',
  S3_ACCESS_KEY_ID: 'domik',
  S3_SECRET_ACCESS_KEY: 's3-secret',
  S3_FORCE_PATH_STYLE: 'true',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  MAIL_FROM: 'Domik <no-reply@domik.local>',
};

describe('loadServerConfig', () => {
  it('parses a valid environment and applies defaults', () => {
    const config = loadServerConfig(validEnv);
    expect(config.NODE_ENV).toBe('development');
    expect(config.SMTP_PORT).toBe(1025);
    expect(config.S3_FORCE_PATH_STYLE).toBe(true);
    expect(config.SMTP_SECURE).toBe(false);
  });

  it('rejects a non-postgres DATABASE_URL', () => {
    expect(() => loadServerConfig({ ...validEnv, DATABASE_URL: 'mysql://x@localhost/db' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('treats empty strings as missing', () => {
    expect(() => loadServerConfig({ ...validEnv, BETTER_AUTH_SECRET: '' })).toThrow(
      /BETTER_AUTH_SECRET/,
    );
  });
});

describe('loadWorkerConfig', () => {
  it('defaults the heartbeat interval to 5s', () => {
    expect(loadWorkerConfig(validEnv).WORKER_HEARTBEAT_INTERVAL_MS).toBe(5000);
  });

  it('enforces a minimum heartbeat interval', () => {
    expect(() => loadWorkerConfig({ ...validEnv, WORKER_HEARTBEAT_INTERVAL_MS: '10' })).toThrow();
  });
});
