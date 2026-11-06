import { ApiError } from './api';

/** Retry status reads only. This helper never submits or restarts generation. */
export function watchJob(check: () => Promise<boolean>, onError: (message: string) => void, interval = 2000) {
  let stopped = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout>;
  const poll = async () => {
    if (stopped) return;
    try {
      const keepWatching = await check();
      failures = 0;
      if (!stopped && keepWatching) timer = setTimeout(() => void poll(), interval);
    } catch (error) {
      if (stopped) return;
      const permanent = error instanceof ApiError && error.status >= 400 && error.status < 500 && ![408, 429].includes(error.status);
      onError(permanent ? 'Status access failed. Sign in or reload to reconnect; saved work is unchanged.' : 'Connection interrupted. Reconnecting to the saved job; no new generation request will be sent.');
      if (!permanent) timer = setTimeout(() => void poll(), Math.min(15000, interval * 2 ** Math.min(++failures, 3)));
    }
  };
  timer = setTimeout(() => void poll(), 1000);
  return () => { stopped = true; clearTimeout(timer); };
}
