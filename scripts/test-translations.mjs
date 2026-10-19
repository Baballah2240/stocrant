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
  assert.equal(languageLocale("en"), "en-US");
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
  const files = [...readdirSync(components).filter(name => name.endsWith(".tsx")).map(name => new URL(name, components)), new URL("../src/App.tsx", import.meta.url), new URL("../src/app-lock-context.tsx", import.meta.url)];
  for (const file of files) {
    const filename = file.pathname;
    const source = ts.createSourceFile(filename, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node) {
      if (ts.isCallExpression(node) && node.expression.getText(source) === "t" && node.arguments[0]) {
        function check(value) {
          if (ts.isConditionalExpression(value)) { check(value.whenTrue); check(value.whenFalse); }
          if (!ts.isStringLiteral(value)) return;
          const label = value.text;
          if (!identifiers.has(label) && !label.startsWith("https://") && !/[\u0600-\u06ff]/u.test(label)) assert.notEqual(translate(label, "ar"), label, `${filename}: missing translation for ${label}`);
        }
        check(node.arguments[0]);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
});

test("localized choice labels keep stable submission values", () => {
  const directory = new URL("../src/components/", import.meta.url);
  for (const filename of readdirSync(directory).filter(name => name.endsWith(".tsx"))) {
    const source = ts.createSourceFile(filename, readFileSync(new URL(filename, directory), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const translated = expression => expression && ts.isCallExpression(expression) && expression.expression.getText(source) === "t";
    function visit(node) {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = node.tagName.getText(source);
        const value = node.attributes.properties.find(property => ts.isJsxAttribute(property) && property.name.text === "value");
        if (["select", "ChoiceSelect"].includes(tag) && value?.initializer && ts.isJsxExpression(value.initializer)) assert.ok(!translated(value.initializer.expression), `${filename}: translating a stored choice value`);
        if (tag === "option" && !value && ts.isJsxElement(node.parent)) assert.ok(!node.parent.children.some(child => ts.isJsxExpression(child) && translated(child.expression)), `${filename}: translated option needs an explicit raw value`);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
});
