import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import ts from "typescript";
import { test } from "node:test";
import { arabicTranslations, languageDirection, languageLocale, translate } from "../src/translations.ts";

test("centralized Arabic copy is readable Unicode without corrupt encoding", () => {
  for (const [english, arabic] of Object.entries(arabicTranslations)) {
    assert.ok(/[\u0600-\u06ff]/u.test(arabic), `Arabic text missing for ${english}`);
    assert.doesNotMatch(arabic, /[\uFFFD]|Ã|Â|Ø|Ù|â€|â€¦/u, `Corrupt encoding for ${english}`);
    assert.equal(translate(english, "ar"), arabic);
  }
});

test("hierarchy, delegated administration and Customer Service labels remain distinct", () => {
  for (const label of ["Organization", "Company", "Employees", "Users", "Main Admin", "Organization Admin", "Company Manager", "Permissions", "Customer Service", "Appointment", "Reply & resolve", "Audit log"]) {
    assert.notEqual(translate(label, "ar"), label);
    assert.equal(translate(label, "en"), label);
  }
  assert.notEqual(translate("Organization", "ar"), translate("Company", "ar"));
  assert.equal(languageDirection("ar"), "rtl");
  assert.equal(languageDirection("en"), "ltr");
  assert.equal(languageLocale("ar"), "ar-QA");
});

test("unknown business data stays unchanged, legacy UI punctuation is repaired, interpolation is explicit", () => {
  for (const value of ["شركة محمد للتجارة", "EXAMPLE-2026-01", "user@example.test", "A company called Savingâ€¦"]) {
    assert.equal(translate(value, "ar"), value);
    assert.equal(translate(value, "en"), value);
  }
  assert.equal(translate("Savingâ€¦", "en"), "Saving…");
  assert.equal(translate("Youâ€™re checked in", "ar"), "تم تسجيل حضورك");
  assert.equal(translate("Showing {from}–{to} of {total}", "ar", { from: 1, to: 10, total: 18 }), "عرض 1–10 من 18");
  assert.equal(translate("{count} users", "ar"), "المستخدمون: {count}");
  assert.equal(translate("{count} users", "ar", { count: 0 }), "المستخدمون: 0");
});

test("entity metadata labels and non-identifier choices have Arabic copy", () => {
  const registry = readFileSync(new URL("../server/registry.ts", import.meta.url), "utf8");
  const labels = [...registry.matchAll(/(?:label|singular):\s*"([^"]+)"/g)].map(match => match[1]);
  const options = [...registry.matchAll(/options:\s*\[([^\]]+)\]/g)].flatMap(match => [...match[1].matchAll(/"([^"]+)"/g)].map(option => option[1]));
  for (const label of new Set([...labels, ...options])) {
    if (/^[A-Z]{3}$/.test(label)) continue; // Currency codes must remain stable.
    assert.notEqual(translate(label, "ar"), label, `Missing metadata translation: ${label}`);
  }
});

test("literal interface translation calls have Arabic copy across every component", () => {
  const components = new URL("../src/components/", import.meta.url);
  const identifiers = new Set(["AWB:", "EN", "en-GB"]);
  for (const filename of readdirSync(components).filter(name => name.endsWith(".tsx"))) {
    const source = ts.createSourceFile(filename, readFileSync(new URL(filename, components), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node) {
      if (ts.isCallExpression(node) && node.expression.getText(source) === "t" && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
        const label = node.arguments[0].text;
        if (!identifiers.has(label) && !label.startsWith("https://") && !/[\u0600-\u06ff]/u.test(label)) {
          assert.notEqual(translate(label, "ar"), label, `${filename}: missing translation for ${label}`);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
});
