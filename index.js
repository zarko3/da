import { World } from './world.js';

export { World };

// Everything under /api goes to the single World object. Static files are served by the assets binding.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    const world = env.WORLD.get(env.WORLD.idFromName('main'));
    return world.fetch(request);
  },
};
