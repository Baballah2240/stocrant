import {randomBytes} from "node:crypto";
type Row=Record<string,any>;
export function newShopNumber(prefix:"SO"|"RV",records:Row[]):string {
 let value:string;
 do {value=`${prefix}-${randomBytes(6).toString("hex").toUpperCase()}`;} while(records.some(row=>[row.orderNumber,row.reverseOrderNumber,row.rmaNumber].includes(value)));
 return value;
}
export function migrateShopNumbers(collections:Record<string,unknown[]>):boolean {
 const orders=(collections.shopOrders||[]) as Row[],returns=(collections.returns||[]) as Row[];let changed=false;
 for(const order of orders)if(!order.orderNumber){order.orderNumber=newShopNumber("SO",orders);changed=true;}
 for(const returned of returns){const parent=orders.find(order=>order.id===returned.shopOrderId&&order.organizationId===returned.organizationId);if(!parent)continue;
  if(!returned.parentOrderNumber){returned.parentOrderNumber=parent.orderNumber;changed=true;}
  if(!returned.reverseOrderNumber){returned.reverseOrderNumber=newShopNumber("RV",returns);changed=true;}
 }
 return changed;
}
