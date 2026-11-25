// Runs once when the Next.js server starts (not during `next build`).
// Fails fast if the server environment is misconfigured.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { loadServerConfig } = await import('@domik/shared/config');
    loadServerConfig();
  }
}
