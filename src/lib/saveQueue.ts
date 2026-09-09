/** One writer per editor; failed snapshots remain dirty until a successful retry. */
export function createSaveQueue<T>(initial: T, write: (value: T) => Promise<void>) {
  let latest = initial;
  let revision = 0;
  let savedRevision = 0;
  let running: Promise<void> | null = null;

  const flush = (): Promise<void> => {
    if (running) return running;
    running = Promise.resolve().then(async () => {
      while (savedRevision < revision) {
        const savingRevision = revision;
        const snapshot = latest;
        await write(snapshot);
        savedRevision = savingRevision;
      }
    }).finally(() => { running = null; });
    return running;
  };

  return {
    update(value: T) { latest = value; revision += 1; },
    isDirty: () => savedRevision < revision,
    flush,
  };
}
