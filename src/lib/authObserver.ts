/** Auth callbacks must return immediately so Supabase can release its auth lock. */
export function createAuthObserver<S, U>(options: {
  resolve: (session: S) => Promise<U>;
  apply: (user: U | null, event: string) => void;
  fail: (error: unknown) => void;
  timeoutMs?: number;
}) {
  let revision = 0;
  let disposed = false;
  let deferred: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  return {
    onChange(event: string, session: S | null): void {
      const current = ++revision;
      clearTimeout(deferred);
      clearTimeout(deadline);
      if (disposed) return;
      if (!session) { options.apply(null, event); return; }
      deferred = setTimeout(() => {
        deadline = setTimeout(() => {
          if (disposed || current !== revision) return;
          revision += 1;
          options.fail(new Error('ตรวจสอบสิทธิ์ใช้เวลานานเกินไป กรุณาลองใหม่'));
        }, options.timeoutMs ?? 15000);
        void Promise.resolve().then(() => options.resolve(session)).then(user => {
          if (disposed || current !== revision) return;
          clearTimeout(deadline);
          options.apply(user, event);
        }, error => {
          if (disposed || current !== revision) return;
          clearTimeout(deadline);
          options.fail(error);
        });
      }, 0);
    },
    dispose() {
      disposed = true;
      revision += 1;
      clearTimeout(deferred);
      clearTimeout(deadline);
    },
  };
}
