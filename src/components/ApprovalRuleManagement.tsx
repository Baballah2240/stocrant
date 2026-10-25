import {useState,type FormEvent} from "react";
import {useLanguage} from "../language-context";
import type {CollectionItem} from "../types";
import ChoiceSelect from "./ChoiceSelect";

const sectionLabels:Record<string,string>={organizations:"Organizations",locations:"Locations",hr:"Workforce & HR",operations:"Operations",customerService:"Customer Service",inventory:"Inventory",finance:"Finance",access:"User management"};
type RuleInput={section:string;action:string;active:boolean};
const blank:RuleInput={section:"finance",action:"create",active:true};
export default function ApprovalRuleManagement({rules,saving,onSave}:{rules:CollectionItem[];saving:boolean;onSave:(id:string|undefined,input:Partial<RuleInput>)=>Promise<boolean>}){
  const {t}=useLanguage();const [editing,setEditing]=useState<string>(),[form,setForm]=useState(blank);
  const reset=()=>{setEditing(undefined);setForm(blank);};
  async function save(event:FormEvent){event.preventDefault();if(await onSave(editing,form))reset();}
  return <section className="approval-rule-management"><h3>{t(editing?"Edit approval rule":"Create approval rule")}</h3>
    <p className="hint">{t("Main Administrator changes apply immediately. These rules apply to other users.")}</p>
    <form className="inline-form" onSubmit={event=>void save(event)}>
      <label className="form-field"><span className="field-label">{t("Section")}</span><ChoiceSelect disabled={saving} value={form.section} onChange={event=>setForm({...form,section:event.target.value})}>{Object.entries(sectionLabels).map(([id,label])=><option key={id} value={id}>{t(label)}</option>)}</ChoiceSelect></label>
      <label className="form-field"><span className="field-label">{t("Action")}</span><ChoiceSelect disabled={saving} value={form.action} onChange={event=>setForm({...form,action:event.target.value})}>{["create","edit","delete"].map(action=><option key={action} value={action}>{t(action)}</option>)}</ChoiceSelect></label>
      <label className="check-field"><input type="checkbox" disabled={saving} checked={form.active} onChange={event=>setForm({...form,active:event.target.checked})}/>{t("Active")}</label>
      <button className="primary" disabled={saving}>{t(editing?"Save approval rule":"Create approval rule")}</button>{editing&&<button type="button" disabled={saving} onClick={reset}>{t("Cancel")}</button>}
    </form>
    <div className="stack-list">{rules.map(rule=><div className="approval-row" key={rule.id}><div><strong>{t(sectionLabels[String(rule.section)]||String(rule.section))} · {t(String(rule.action))}</strong><span>{t(rule.active?"Approval required before change is applied":"Approval not required")}</span></div><div className="inline-actions"><button type="button" disabled={saving} onClick={()=>{setEditing(rule.id);setForm({section:String(rule.section),action:String(rule.action),active:rule.active===true});}}>{t("Edit approval rule")}</button><label className="switch-field"><input type="checkbox" disabled={saving} checked={rule.active===true} onChange={event=>void onSave(rule.id,{active:event.target.checked})}/>{t("Active")}</label></div></div>)}</div>
    {!rules.length&&<p className="empty">{t("No approval rules configured.")}</p>}
  </section>;
}
