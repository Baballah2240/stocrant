import assert from "node:assert/strict";
import { test } from "node:test";
import { minor, decimal, sumMoney } from "../src/money.ts";

test("financial display totals retain minor-unit precision across currencies and reversals",()=>{
 assert.equal(sumMoney(["0.10","0.20"],"QAR"),"0.30");
 assert.equal(sumMoney(["1.234","2.001","-0.005"],"KWD"),"3.230");
 assert.equal(sumMoney(["100","-50"],"JPY"),"50");
 assert.equal(sumMoney(["999999999999.99","0.01"],"QAR"),"1000000000000.00");
 assert.equal(decimal(minor("-10.20","QAR"),"QAR"),"-10.20");
 assert.throws(()=>minor("1.001","QAR"));assert.throws(()=>minor("1.1","JPY"));assert.throws(()=>minor("1e10","QAR"));
});
