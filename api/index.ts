import { handle } from "../src/api";
import { migrate } from "../src/db";

// No deploy hook on Vercel: migrate once per instance, retry on failure.
// ponytail: no cross-instance lock, advisory lock if cold starts race.
let ready: Promise<void> | null = null;

export default {
  async fetch(req: Request): Promise<Response> {
    ready ??= migrate().catch((error) => {
      ready = null;
      throw error;
    });
    try {
      await ready;
    } catch (error) {
      console.error(error);
      return Response.json({ error: "Erreur serveur" }, { status: 500 });
    }
    return handle(req);
  },
};
