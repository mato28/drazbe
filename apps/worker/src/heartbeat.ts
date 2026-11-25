import { type Clock } from '@domik/core';

export interface HeartbeatOptions {
  intervalMs: number;
  clock: Clock;
  log: (message: string) => void;
}

/** Logs a heartbeat immediately and then every `intervalMs`. Returns a stop function. */
export function startHeartbeat({ intervalMs, clock, log }: HeartbeatOptions): () => void {
  const startedAt = clock.now().getTime();
  let beats = 0;

  const beat = () => {
    beats += 1;
    const uptimeSec = Math.round((clock.now().getTime() - startedAt) / 1000);
    log(`heartbeat #${beats} at ${clock.now().toISOString()} (uptime ${uptimeSec}s)`);
  };

  beat();
  const timer = setInterval(beat, intervalMs);
  return () => {
    clearInterval(timer);
  };
}
