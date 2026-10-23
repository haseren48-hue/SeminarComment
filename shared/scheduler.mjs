export class Scheduler {
  constructor(measure = (text, size) => text.length * size) {
    this.measure = measure; this.queue = []; this.active = []; this.nextId = 1;
    this.config = { width: 1000, height: 300, fontSize: 36, speed: 'normal' };
    this.paused = false; this.clock = 0; this.last = null; this.lastLaunch = -Infinity;
  }
  configure(config) {
    Object.assign(this.config, config);
    const lanes = this.lanes;
    for (const item of this.active) {
      item.lane = Math.min(item.lane, lanes - 1);
      item.width = this.measure(item.text, this.config.fontSize);
    }
  }
  get lanes() { return Math.max(1, Math.floor(this.config.height / Math.ceil(this.config.fontSize * 1.1))); }
  get velocity() { return this.config.width / ({slow: 13, normal: 9, fast: 6}[this.config.speed] || 9); }
  enqueue(text) {
    this.queue.push({ text, queuedAt: this.clock });
    if (this.queue.length > 50) this.queue.shift();
  }
  clear() { this.queue.length = 0; this.active.length = 0; }
  tick(now) {
    const elapsed = this.last === null ? 0 : Math.max(0, now - this.last);
    this.last = now;
    if (this.paused) return this.active;
    this.clock += elapsed; // Waiting time excludes OFF / QR / edit pauses.
    const distance = elapsed / 1000 * this.velocity;
    this.active.forEach(item => { item.x -= distance; });
    this.active = this.active.filter(item => item.x + item.width > 0);
    // At most one release per 120ms: a paused backlog never bursts in one frame.
    if (!this.queue.length || this.clock - this.lastLaunch < 120) return this.active;
    const tails = Array.from({length: this.lanes}, (_, lane) => Math.max(-Infinity, ...this.active.filter(i => i.lane === lane).map(i => i.x + i.width)));
    let lane = tails.findIndex(tail => tail + 50 <= this.config.width);
    if (lane === -1 && this.clock - this.queue[0].queuedAt >= 2000) lane = tails.indexOf(Math.min(...tails));
    if (lane !== -1) {
      const {text} = this.queue.shift();
      this.active.push({id: this.nextId++, text, width: this.measure(text, this.config.fontSize), lane, x: this.config.width});
      this.lastLaunch = this.clock;
    }
    return this.active;
  }
}
