import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("npm distribution contract", () => {
  it("declares the public CLI, Node support, production compiler dependency, and restricted package contents", () => {
    const packageJson = JSON.parse(readFileSync(resolve(repositoryRoot, "package.json"), "utf8")) as {
      private: boolean;
      license: string;
      author: string;
      publishConfig: { access: string; provenance: boolean; registry: string };
      bin: Record<string, string>;
      engines: Record<string, string>;
      files: string[];
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
      repository: { url: string };
    };

    expect(packageJson.private).toBe(false);
    expect(packageJson.license).toBe("MIT");
    expect(packageJson.author).toBe("taljacob2");
    expect(packageJson.publishConfig).toEqual({
      access: "public",
      provenance: true,
      registry: "https://registry.npmjs.org",
    });
    expect(packageJson.bin["feature-inventor"]).toBe("dist/cli.js");
    expect(packageJson.engines.node).toBe(">=22");
    expect(packageJson.files).toEqual(expect.arrayContaining(["dist", "README.md", "RELEASING.md", "LICENSE", "docs/cli"]));
    expect(packageJson.scripts.clean).toContain("scripts/clean-dist.mjs");
    expect(packageJson.scripts.prepack).toBe("npm run build");
    expect(packageJson.dependencies.typescript).toBeDefined();
    expect(packageJson.repository.url).toBe("git+https://github.com/taljacob2/feature-inventor.git");
  });

  it("excludes tests from the production compiler configuration", () => {
    const tsconfig = JSON.parse(readFileSync(resolve(repositoryRoot, "tsconfig.json"), "utf8")) as { exclude?: string[] };
    expect(tsconfig.exclude).toContain("src/**/*.test.ts");
  });
});
