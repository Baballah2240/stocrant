import type { CollectionItem } from "../types";
import { useLanguage } from "../language-context";
import { decimal, minor } from "../money";
export default function MonthlyCashFlow({transactions,currency,maxMonths}:{transactions:CollectionItem[];currency:string;maxMonths?:number}) {
 const {t,language}=useLanguage();
 const months=new Map<string,{incoming:bigint;outgoing:bigint}>();
 for(const row of transactions){if(row.status!=="paid"||row.type==="transfer")continue;const month=String(row.date).slice(0,7),item=months.get(month)||{incoming:0n,outgoing:0n};if(row.direction==="in")item.incoming+=minor(row.amount,currency);else item.outgoing+=minor(row.amount,currency);months.set(month,item);}
 const allMonths=[...months].sort(([a],[b])=>a.localeCompare(b)),series=maxMonths?allMonths.slice(-maxMonths):allMonths,maximum=Math.max(1,...series.flatMap(([,v])=>[Number(v.incoming),Number(v.outgoing)]));
 const format=(amount:bigint)=>new Intl.NumberFormat(language==="ar"?"ar-QA":"en-GB",{style:"currency",currency}).format(Number(decimal(amount,currency)));
 return <section className="finance-monthly"><h3>{t("Monthly cash flow")}</h3><p className="hint">{t("Confirmed cash movements for the selected filters. Internal transfers are excluded.")}</p>{maxMonths&&allMonths.length>maxMonths&&<p className="hint">{t("Showing the latest {count} months within these filters.",{count:maxMonths})}</p>}{series.map(([month,value])=><div key={month} className="finance-month"><strong>{month}</strong><div><span className="finance-month__bar" style={{width:`${Number(value.incoming)/maximum*100}%`}}/><span>{t("Money in")}: {format(value.incoming)}</span></div><div><span className="finance-month__bar finance-month__bar--out" style={{width:`${Number(value.outgoing)/maximum*100}%`}}/><span>{t("Money out")}: {format(value.outgoing)}</span></div></div>)}{!series.length&&<p>{t("No paid movements in this period.")}</p>}</section>;
}
