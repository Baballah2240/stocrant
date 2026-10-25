import {money,precision,scaled} from "./payroll-model.js";
type Row=Record<string,any>;
export function shopReport(currency:string,orders:Row[],returns:Row[]) {
 const digits=precision(currency),sold=orders.filter(o=>o.saleId&&["dispatched","delivered"].includes(o.status));
 const sum=(items:Row[],key:string)=>items.reduce((n,r)=>n+scaled(r[key],digits),0n);
 const sales=sum(sold,"total"),credits=sum(returns,"refund");
 const missingCosts=sold.filter(o=>o.lines.some((l:Row)=>l.costTotal==null)).length;
 let costs=0n;for(const order of sold){const restocked=returns.some(r=>r.shopOrderId===order.id&&r.restock);if(!restocked)for(const line of order.lines)if(line.costTotal!=null)costs+=scaled(line.costTotal,digits);}
 const collected=sold.reduce((n,o)=>n+(o.settlement?.paid!=null?scaled(o.settlement.paid,digits):0n),0n);
 const refunded=returns.reduce((n,r)=>n+(r.settlement?.paid!=null?scaled(r.settlement.paid,digits):0n),0n);
 return {currency,sales:money(sales,digits),returns:money(credits,digits),netSales:money(sales-credits,digits),costs:missingCosts?null:money(costs,digits),grossProfit:missingCosts?null:money(sales-credits-costs,digits),missingCosts,collected:money(collected,digits),refunded:money(refunded,digits),orders:sold.length};
}
