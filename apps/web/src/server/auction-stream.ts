import 'server-only';
import { type Actor, getLiveState } from '@domik/core';
import { AUCTION_EVENTS_CHANNEL, parseAuctionEvent } from '@domik/db';
import { AUCTION_STREAM_EVENTS } from '@domik/shared';
import { dbHandle } from './db';
import { toLiveStateDto } from './dto';
import { serviceContext } from './services';

type Wake = () => void;

/**
 * One Postgres LISTEN per web process, fanned out to every open SSE stream of the auction.
 * Notifications only say "auction X changed"; each stream then reloads the state itself, so a
 * lost or coalesced notification can never leave a viewer with a wrong price.
 */
class AuctionEventHub {
  private readonly subscribers = new Map<string, Set<Wake>>();
  private listening: Promise<unknown> | null = null;

  async subscribe(auctionId: string, wake: Wake): Promise<() => void> {
    this.listening ??= dbHandle()
      .listen(AUCTION_EVENTS_CHANNEL, (payload) => {
        const event = parseAuctionEvent(payload);
        if (!event) return;
        this.subscribers.get(event.auctionId)?.forEach((fn) => {
          fn();
        });
      })
      .catch((e: unknown) => {
        this.listening = null; // retry on the next subscription
        throw e;
      });
    await this.listening;

    let set = this.subscribers.get(auctionId);
    if (!set) this.subscribers.set(auctionId, (set = new Set()));
    set.add(wake);
    return () => {
      set.delete(wake);
      if (set.size === 0) this.subscribers.delete(auctionId);
    };
  }
}

const g = globalThis as unknown as { __domikAuctionHub?: AuctionEventHub };
const hub = (): AuctionEventHub => (g.__domikAuctionHub ??= new AuctionEventHub());

const HEARTBEAT_MS = 15_000;
/** Full resync even without notifications (keeps serverTime fresh, heals missed events). */
const RESYNC_MS = 10_000;

/**
 * Server-sent events for one auction: an initial `state` event, then a new `state` on every
 * change (bid, price step, phase change). Throws NOT_FOUND before streaming if not public.
 */
export async function auctionStreamResponse(
  request: Request,
  auctionId: string,
  actor: Actor | null,
): Promise<Response> {
  const load = async () => toLiveStateDto(await getLiveState(serviceContext(), auctionId, actor));
  const initial = await load(); // 404 as JSON if the auction is not public
  const encoder = new TextEncoder();
  let cleanup: () => void = () => undefined;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const life = { closed: false };
      const write = (chunk: string) => {
        if (life.closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const send = (event: string, data: unknown) => {
        write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      // Coalesce bursts: at most one reload in flight, plus one queued.
      const state = { running: false, again: false };
      // Read through a function: TS would otherwise keep `again` narrowed across the await.
      const wokenAgain = (): boolean => state.again;
      const push = async (): Promise<void> => {
        if (state.running) {
          state.again = true;
          return;
        }
        state.running = true;
        try {
          do {
            state.again = false;
            send(AUCTION_STREAM_EVENTS.state, await load());
          } while (wokenAgain() && !life.closed);
        } catch (e) {
          console.error('[sse] reload failed', e);
          send(AUCTION_STREAM_EVENTS.error, { message: 'Osveževanje ni uspelo.' });
        } finally {
          state.running = false;
        }
      };
      const wake = () => void push();

      write('retry: 3000\n\n');
      send(AUCTION_STREAM_EVENTS.state, initial);
      const unsubscribe = await hub().subscribe(auctionId, wake);
      const heartbeat = setInterval(() => {
        write(': ping\n\n');
      }, HEARTBEAT_MS);
      const resync = setInterval(wake, RESYNC_MS);

      cleanup = () => {
        if (life.closed) return;
        life.closed = true;
        clearInterval(heartbeat);
        clearInterval(resync);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed by the client
        }
      };
      request.signal.addEventListener('abort', cleanup);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
