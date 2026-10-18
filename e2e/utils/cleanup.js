// Tracks every row a test creates so it can always be torn down, even if
// the test fails partway through -- use from a try/finally (or
// afterEach) in every spec that writes data, never rely on a test's own
// "happy path" delete step being the only cleanup.
//
//   const cleanup = new Cleanup(request);
//   try {
//     const id = await createSomething();
//     cleanup.add('/api/blackbook', id);
//     ...
//   } finally {
//     await cleanup.run();
//   }
class Cleanup {
  constructor(request) {
    this.request = request;
    this.items = []; // { path, id }
  }

  // path is the route's own DELETE endpoint base (e.g. '/api/blackbook'),
  // called as `${path}?id=${id}`.
  add(path, id) {
    if (id != null) this.items.push({ path, id });
  }

  async run() {
    // Reverse order: later creates (e.g. a reply) are deleted before
    // earlier ones (its parent post), so a post delete never races ahead
    // of cleaning up its own replies.
    for (const { path, id } of this.items.reverse()) {
      try {
        const res = await this.request.delete(`${path}?id=${encodeURIComponent(id)}`);
        if (!res.ok() && res.status() !== 404) {
          console.warn(`[e2e cleanup] DELETE ${path}?id=${id} -> ${res.status()}`);
        }
      } catch (err) {
        console.warn(`[e2e cleanup] DELETE ${path}?id=${id} failed:`, err.message);
      }
    }
    this.items = [];
  }
}

module.exports = { Cleanup };
