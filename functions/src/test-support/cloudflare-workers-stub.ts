/**
 * Vitest icin `cloudflare:workers` modulu taklidi.
 *
 * Yerel Node testlerinde Cloudflare calisma zamani yoktur. Durable Object ve
 * Workflow taban siniflari yalnizca tip/kalitim icin gereklidir; gercek
 * davranis Miniflare (`wrangler dev`) ve canli ortamda dogrulanir.
 */

export class DurableObject {
  constructor(public ctx: unknown, public env: unknown) {}
}

export class WorkflowEntrypoint {
  constructor(public ctx: unknown, public env: unknown) {}
}

export type WorkflowEvent<T> = { payload: T; timestamp: Date; instanceId: string };
export interface WorkflowStep {
  do<T>(name: string, callback: () => Promise<T>, config?: unknown): Promise<T>;
  sleep(name: string, duration: string | number): Promise<void>;
}
