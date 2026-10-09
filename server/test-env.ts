import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Isolate test data to a fresh temp directory so repeated runs (and the
// "creates a store" test) never leak into the real data/stocrant.json.
// This module MUST be imported before ./app.js so the storage layer reads
// STOCRANT_DATA_DIR at load time.
export const TEST_DATA_DIR = mkdtempSync(join(tmpdir(), "stocrant-test-data-"));
process.env.STOCRANT_DATA_DIR = TEST_DATA_DIR;
