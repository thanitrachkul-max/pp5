export interface CoalescedRefreshOptions {
  debounceMs?: number;
  fallbackIntervalMs?: number;
}

export function createCoalescedRefresh(
  run: () => Promise<void>,
  { debounceMs = 1500, fallbackIntervalMs = 60000 }: CoalescedRefreshOptions = {},
) {
  let disposed = false;
  let inFlight = false;
  let pending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

  const execute = async () => {
    timer = undefined;
    if (disposed || !pending || hidden() || inFlight) return;
    pending = false;
    inFlight = true;
    try {
      await run();
    } catch {
      // Callers display errors; later events and the fallback may retry.
    } finally {
      inFlight = false;
      if (pending && !disposed && !hidden()) schedule();
    }
  };

  const schedule = () => {
    if (disposed) return;
    pending = true;
    // Bound the wait even when autosave events arrive continuously.
    if (!timer && !inFlight && !hidden()) timer = setTimeout(() => void execute(), debounceMs);
  };
  const onVisibilityChange = () => {
    if (!hidden() && pending) schedule();
  };
  const interval = fallbackIntervalMs > 0 ? setInterval(schedule, fallbackIntervalMs) : undefined;
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibilityChange);

  return {
    schedule,
    dispose() {
      disposed = true;
      clearTimeout(timer);
      clearInterval(interval);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibilityChange);
    },
  };
}
