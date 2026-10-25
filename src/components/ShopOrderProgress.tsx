import {useLanguage} from "../language-context";

export default function ShopOrderProgress({status,paymentRequired,outstanding}:{status:string;paymentRequired:boolean;outstanding?:string}) {
  const {t}=useLanguage();
  const stages=["reserved","preparing","dispatched","delivered"];
  const current=stages.indexOf(status);
  const instructions:Record<string,string>={
    reserved:"Check the order and start preparing. Stock is reserved for this customer.",
    preparing:"Pack the items, then dispatch or hand over the order. Stock and the sale are posted together.",
    dispatched:paymentRequired&&Number(outstanding)>0
      ?"Record the outstanding payment below before confirming delivery."
      :"Confirm delivery when the customer has received the order.",
    delivered:"Order completed. Review payments and the Finance reference below.",
    cancelled:"Order cancelled. Its stock reservation has been released.",
    expired:"The reservation expired. Create a new order if the customer still needs the items.",
  };
  return <section className="shop-progress" aria-label={t("Order progress")}>
    {current>=0&&<ol>{stages.map((stage,index)=><li key={stage} className={index<current?"done":index===current?"current":""} aria-current={index===current?"step":undefined}><span aria-hidden="true">{index<current?"✓":index+1}</span>{t(stage)}</li>)}</ol>}
    <p>{t(instructions[status]||"Select an order")}</p>
  </section>;
}
