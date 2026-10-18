// One active read and one follow-up batch. Events during a read must still get
// a later read, without issuing one national request per provider notification.
export function coalescedRefresh(run: () => Promise<void>): () => Promise<void> {
  let active: Promise<void> | null = null;
  let queued: { promise: Promise<void>; resolve(): void; reject(error: unknown): void } | null = null;
  function start(): Promise<void> {
    const work = Promise.resolve().then(run);
    active = work;
    const complete = () => {
      active = null;
      if (queued) {
        const next = queued; queued = null;
        void start().then(next.resolve, next.reject);
      }
    };
    void work.then(complete, complete);
    return work;
  }
  return () => {
    if (!active) return start();
    if (!queued) {
      let resolve!: () => void, reject!: (error: unknown) => void;
      const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
      queued = { promise, resolve, reject };
    }
    return queued.promise;
  };
}
