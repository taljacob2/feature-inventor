import type { RuntimeAdapter, RuntimeId } from "./types.js";

/** Explicit registry; adapters are added by registration rather than CLI conditionals. */
export class RuntimeRegistry {
  private readonly adapters = new Map<RuntimeId, RuntimeAdapter>();

  register(adapter: RuntimeAdapter): this {
    const id = adapter.id.trim();
    if (!/^[a-z][a-z0-9-]{1,63}$/.test(id)) {
      throw new Error(`Invalid runtime adapter ID: ${adapter.id}`);
    }
    if (this.adapters.has(id)) throw new Error(`Runtime adapter is already registered: ${id}`);
    this.adapters.set(id, adapter);
    return this;
  }

  get(id: string): RuntimeAdapter {
    const adapter = this.adapters.get(id);
    if (!adapter) throw new Error(`Unknown runtime adapter: ${id}. Available adapters: ${this.ids().join(", ") || "(none)"}`);
    return adapter;
  }

  has(id: string): boolean {
    return this.adapters.has(id);
  }

  ids(): RuntimeId[] {
    return [...this.adapters.keys()].sort();
  }

  list(): RuntimeAdapter[] {
    return this.ids().map((id) => this.adapters.get(id)!);
  }
}
