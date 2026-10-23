import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import { arabicWebsite } from "../public-website/src/translations.ts";
import { modules, plans } from "../public-website/src/modules.ts";

test("Arabic covers public module descriptions, plans and literal interface copy", () => {
  const check = key => assert.match(arabicWebsite[key] || "", /[\u0600-\u06ff]/u, `Missing Arabic: ${key}`);
  for (const item of modules) {
    for (const field of ["name", "caption", "title", "description", "audience", "connection"]) check(item[field]);
    item.features.forEach(check);
  }
  for (const item of plans) { check(item.name); check(item.subtitle); item.features.forEach(check); }
  for (const file of ["PublicWebsite", "InquiryForm"]) {
    const source = readFileSync(`public-website/src/components/${file}.tsx`, "utf8"), ast = ts.createSourceFile(file + ".tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function walk(node) {
      if (ts.isCallExpression(node) && node.expression.getText(ast) === "t" && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) check(node.arguments[0].text);
      if (ts.isJsxText(node) && /[A-Za-z]{3}/.test(node.getText(ast).replace(/STOCRANT|your-shop\.com/g, ""))) assert.fail(`Untranslated public text: ${node.getText(ast)}`);
      ts.forEachChild(node, walk);
    }
    walk(ast);
  }
  for (const [key, text] of Object.entries(arabicWebsite)) assert.doesNotMatch(text, /\uFFFD|Ã˜|Ã™/u, `Invalid Arabic encoding: ${key}`);
});
