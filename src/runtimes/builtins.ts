import { RuntimeRegistry } from "./registry.js";
import { createClaudeAdapter } from "./claude.js";
import { createManusAdapter } from "./manus.js";

export function createBuiltInRuntimeRegistry(): RuntimeRegistry {
  return new RuntimeRegistry().register(createClaudeAdapter()).register(createManusAdapter());
}
