export class RequestQueue {
  active = 0;
  waiting = [];
  constructor(limit = 2) {
    this.limit = limit;
  }
  acquire(signal) {
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
      const entry = {
        signal,
        resolve,
        reject,
        cancel: () => {
          this.waiting = this.waiting.filter((e) => e !== entry);
          reject(new Error('요청이 중단되었습니다.'));
        },
      };
      signal.addEventListener('abort', entry.cancel, { once: true });
      this.waiting.push(entry);
      this.drain();
    });
  }
  drain() {
    while (this.active < this.limit && this.waiting.length) {
      const entry = this.waiting.shift();
      entry.signal.removeEventListener('abort', entry.cancel);
      if (entry.signal.aborted) {
        entry.reject(new Error('요청이 중단되었습니다.'));
        continue;
      }
      this.active++;
      let released = false;
      entry.resolve(() => {
        if (!released) {
          released = true;
          this.active--;
          this.drain();
        }
      });
    }
  }
}
