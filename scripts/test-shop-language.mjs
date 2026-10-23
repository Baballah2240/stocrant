import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import { ar } from "../shop-website/src/language.ts";
test("Amal storefront interface has readable Arabic translations", () => {
  const source = ts.createSourceFile(
    "Shop.tsx",
    readFileSync("shop-website/src/Shop.tsx", "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const check = (value) => {
    if (ts.isConditionalExpression(value)) {
      check(value.whenTrue);
      check(value.whenFalse);
    }
    if (ts.isStringLiteral(value))
      assert.match(
        ar[value.text] || "",
        /[\u0600-\u06ff]/,
        `Missing shop Arabic: ${value.text}`,
      );
  };
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(source) === "t" &&
      node.arguments[0]
    )
      check(node.arguments[0]);
    ts.forEachChild(node, visit);
  }
  visit(source);
  for (const [key, value] of Object.entries(ar))
    assert.doesNotMatch(value, /\uFFFD/, `Invalid translation: ${key}`);
});
