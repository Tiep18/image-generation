export class BatchQueue {
  constructor({ concurrency, worker, onIdle }) {
    this.concurrency = Math.max(1, Number(concurrency || 1));
    this.worker = worker;
    this.onIdle = onIdle;
    this.pending = [];
    this.active = 0;
    this.paused = false;
    this.canceled = false;
    this.idleResolvers = [];
  }

  add(task) {
    if (this.canceled) {
      return;
    }
    this.pending.push(task);
    this.drain();
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
    this.drain();
  }

  cancel() {
    this.canceled = true;
    this.pending = [];
    this.resolveIdleIfNeeded();
  }

  waitForIdle() {
    if (this.pending.length === 0 && this.active === 0) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.idleResolvers.push(resolve);
    });
  }

  drain() {
    while (!this.paused && !this.canceled && this.active < this.concurrency && this.pending.length > 0) {
      const task = this.pending.shift();
      this.active += 1;
      Promise.resolve()
        .then(() => this.worker(task))
        .finally(() => {
          this.active -= 1;
          this.drain();
          this.resolveIdleIfNeeded();
        });
    }
  }

  resolveIdleIfNeeded() {
    if (this.pending.length > 0 || this.active > 0) {
      return;
    }

    const resolvers = this.idleResolvers.splice(0);
    resolvers.forEach((resolve) => resolve());
    if (this.onIdle) {
      this.onIdle();
    }
  }
}
