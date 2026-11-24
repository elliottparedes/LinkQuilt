import { z } from "zod";

// These schemas also run in the browser, where the CSP blocks Zod's JIT probe.
if (typeof window !== "undefined") {
  z.config({ jitless: true });
}

export { z };
