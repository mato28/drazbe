type Level = 'debug' | 'info' | 'warn' | 'error';
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export type Logger = Record<Level, (message: string) => void>;

export function createLogger(name: string, minLevel: Level): Logger {
  const make =
    (level: Level) =>
    (message: string): void => {
      if (order[level] < order[minLevel]) return;
      const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${name}] ${message}`;
      if (level === 'error') console.error(line);
      else if (level === 'warn') console.warn(line);
      else console.log(line);
    };
  return { debug: make('debug'), info: make('info'), warn: make('warn'), error: make('error') };
}
