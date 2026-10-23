import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { seedAmal } from "./storefront-fixture.mjs";
if (process.env.NODE_ENV === "production")
  throw new Error("Amal preview must not run in production.");
const root = fileURLToPath(
  new URL("../.local-preview/amal-storefront/", import.meta.url),
);
mkdirSync(root, { recursive: true });
process.env.STOCRANT_DATA_DIR = root;
process.env.NODE_ENV = "development";
process.env.STOCRANT_SETUP_KEY = "local-setup";
const { createApp } = await import("../dist/app.js");
const { getCollection } = await import("../dist/storage.js");
const server = createApp().listen(
  Number(process.env.STOCRANT_SHOP_PREVIEW_PORT || 3015),
  "127.0.0.1",
);
try {
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  if (!getCollection("shopStorefronts").some((s) => s.slug === "amal")) {
    if (getCollection("accessUsers").length)
      throw new Error(
        "This preview store already has accounts. Configure its shop through the workspace instead of replacing its data.",
      );
    const fixture = await seedAmal(base);
    writeFileSync(
      join(root, "local-access.json"),
      JSON.stringify(
        { email: "owner@amal-preview.test", password: fixture.password },
        null,
        2,
      ),
      { mode: 0o600 },
    );
  }
  console.log(`Amal local preview: ${base}/shop/amal`);
  console.log(
    "Illustrative products, policies and stock only. No live company records or online payments.",
  );
  console.log(
    `Preview workspace login is stored locally in ${join(root, "local-access.json")}; it is ignored by Git.`,
  );
} catch (error) {
  server.close();
  throw error;
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    server.closeAllConnections();
    server.close(() => process.exit(0));
  });
