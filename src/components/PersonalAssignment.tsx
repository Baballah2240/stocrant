import { useLanguage } from "../language-context";
export default function PersonalAssignment({profile}:{profile:{[key:string]:unknown}}){
 const {t}=useLanguage();const fields=[["Department",profile.department],["Section",profile.section],["Manager",profile.manager]].filter(([,value])=>typeof value==="string"&&value);
 if(!fields.length)return null;
 return <section className="card"><h2>{t("My employment")}</h2><dl className="personal-assignment">{fields.map(([label,value])=><div key={String(label)}><dt>{t(String(label))}</dt><dd>{String(value)}</dd></div>)}</dl></section>;
}
