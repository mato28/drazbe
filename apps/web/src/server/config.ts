import 'server-only';
import { loadServerConfig, type ServerConfig } from '@domik/shared/config';

let cached: ServerConfig | undefined;

export function serverConfig(): ServerConfig {
  cached ??= loadServerConfig();
  return cached;
}
