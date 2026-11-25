'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

function parts(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * Counts down to `target`. Uses the server's clock: `serverNow` is the server time when the page
 * was rendered, and the browser only measures elapsed time from then on, so a wrong device clock
 * does not matter. Informational only — the server decides what is actually open.
 */
export function Countdown({
  target,
  serverNow,
  label,
}: {
  target: string;
  serverNow: string;
  label: string;
}) {
  const router = useRouter();
  const targetMs = new Date(target).getTime();
  const serverNowMs = new Date(serverNow).getTime();
  const [remaining, setRemaining] = useState(targetMs - serverNowMs);

  useEffect(() => {
    const mountedAt = performance.now();
    const tick = () => {
      const left = targetMs - (serverNowMs + (performance.now() - mountedAt));
      setRemaining(left);
      if (left <= 0) {
        clearInterval(timer);
        // The phase has changed on the server: show the new state.
        router.refresh();
      }
    };
    const timer = setInterval(tick, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [targetMs, serverNowMs, router]);

  const p = parts(remaining);
  const cells = [
    { value: String(p.days), unit: p.days === 1 ? 'dan' : 'dni' },
    { value: pad(p.hours), unit: 'ur' },
    { value: pad(p.minutes), unit: 'min' },
    { value: pad(p.seconds), unit: 's' },
  ];

  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <div
        role="timer"
        aria-label={`${label}: ${p.days} dni, ${p.hours} ur, ${p.minutes} minut`}
        className="mt-1.5 grid grid-cols-4 gap-2 text-center"
      >
        {cells.map((c) => (
          <div key={c.unit} className="rounded-lg bg-muted px-1 py-2">
            <div className="text-xl font-semibold tabular-nums">{c.value}</div>
            <div className="text-[11px] text-muted-foreground">{c.unit}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
