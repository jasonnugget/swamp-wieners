import { setTimeout as delay } from "node:timers/promises";

// Vite must not accept browser requests until its API proxy has a healthy target.
export async function waitForApi(url: string, timeoutMs = 30000, pollMs = 250): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(Math.max(1, Math.min(1000, deadline - Date.now()))) });
      const body = await response.json();
      if (response.ok && body?.ok === true && typeof body.version === "string") return;
    } catch {
      // Connection refusal, incomplete startup and request timeouts retry until the deadline.
    }
    const remaining = deadline - Date.now();
    if (remaining > 0) await delay(Math.min(pollMs, remaining));
  }
  throw new Error(`PlanIT API did not become ready at ${url} within ${timeoutMs}ms. Check the API process output.`);
}
