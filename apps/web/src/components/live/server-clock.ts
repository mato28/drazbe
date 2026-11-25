'use client';

import { serverTimeDtoSchema } from '@domik/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Estimates (server time − client time) NTP-style: several /api/time round trips, keeping the
 * sample with the shortest round trip (least network noise). Countdowns then show server time,
 * whatever the device clock says. The server still decides everything; this is display only.
 */
export async function measureServerOffset(samples = 4): Promise<number | null> {
  let best: { rtt: number; offset: number } | null = null;
  for (let i = 0; i < samples; i++) {
    try {
      const t0 = Date.now();
      const res = await fetch('/api/time', { cache: 'no-store' });
      const t1 = Date.now();
      const parsed = serverTimeDtoSchema.safeParse(await res.json());
      if (!parsed.success) continue;
      const server = new Date(parsed.data.serverTime).getTime();
      const sample = { rtt: t1 - t0, offset: server - (t0 + t1) / 2 };
      if (!best || sample.rtt < best.rtt) best = sample;
    } catch {
      // try the next sample
    }
  }
  return best ? Math.round(best.offset) : null;
}

/** Server-synchronized clock. `initialServerTime` (from the page render) is the first guess. */
export function useServerClock(initialServerTime: string, tickMs = 250) {
  const offsetRef = useRef<number | null>(null);
  const [offsetMs, setOffsetMs] = useState(0);
  const [now, setNow] = useState(() => new Date(initialServerTime).getTime());

  useEffect(() => {
    // Rough first estimate until the measurement is in (ignores render/transfer delay).
    if (offsetRef.current === null) {
      offsetRef.current = new Date(initialServerTime).getTime() - Date.now();
      setOffsetMs(offsetRef.current);
    }
    let cancelled = false;
    const sync = async () => {
      const measured = await measureServerOffset();
      if (!cancelled && measured !== null) {
        offsetRef.current = measured;
        setOffsetMs(measured);
      }
    };
    void sync();
    const resync = setInterval(() => void sync(), 5 * 60_000);
    const timer = setInterval(() => {
      setNow(Date.now() + (offsetRef.current ?? 0));
    }, tickMs);
    return () => {
      cancelled = true;
      clearInterval(resync);
      clearInterval(timer);
    };
  }, [initialServerTime, tickMs]);

  const serverNow = useCallback(() => Date.now() + (offsetRef.current ?? 0), []);
  return { now, offsetMs, serverNow };
}
