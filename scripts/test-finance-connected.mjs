import { test } from 'node:test';
import assert from 'node:assert/strict';
import { financeResult } from '../src/finance-report.ts';
const row = (type, amount, direction, extra={}) => ({type,amount,direction,currency:'SAR',status:'paid',...extra});
test('operating result excludes financing, handles source returns and exact reversals', () => {
  const result=financeResult([
    row('income','1000','in'), row('expense','200','out',{sourceCollection:'purchases'}),
    row('expense','20.10','out'),row('payroll','100','out'),
    row('loan','500','in'),row('advance','50','out'),row('repayment','10','in'),
    row('transfer','200','out'),row('transfer','200','in'),
    row('refund','30','out',{sourceCollection:'returns'}),
    row('expense','5.10','in',{reversalOf:'expense'}),
    row('income','100','in',{status:'pending'}),row('income','100','in',{currency:'USD'})
  ],'SAR');
  assert.deepEqual(result,{revenue:'970.00',purchases:'200.00',expenses:'15.00',payroll:'100.00',profit:'655.00',cash:'1115.00',excluded:'460.00'});
});
test('zero and three decimal currencies preserve exact precision',()=>{
  assert.equal(financeResult([row('income','1.001','in',{currency:'KWD'}),row('expense','0.999','out',{currency:'KWD'})],'KWD').profit,'0.002');
  assert.equal(financeResult([],'JPY').profit,'0');
});
