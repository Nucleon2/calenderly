/**
 * Runs once when the server boots. Node-only work lives in instrumentation.node.ts
 * so the edge bundle never sees Node APIs.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { boot } = await import("./instrumentation.node");
    await boot();
  }
}
