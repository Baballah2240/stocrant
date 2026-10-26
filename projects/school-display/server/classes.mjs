export const defaultClasses=()=>[{id:'default',nameEn:'Main class',nameAr:'الفصل الرئيسي'}];
export function validateClasses(input){
 if(!Array.isArray(input)||!input.length||input.length>50)throw Error('Use between 1 and 50 class groups.');
 const ids=new Set();
 const classes=input.map(row=>{
  if(!row||typeof row.id!=='string'||!/^[\w-]{1,80}$/.test(row.id)||ids.has(row.id))throw Error('Each class group needs a unique ID.');
  ids.add(row.id);
  if(['nameEn','nameAr'].some(key=>typeof row[key]!=='string'||row[key].length>120)||!row.nameEn.trim()&&!row.nameAr.trim())throw Error('Enter a class name in Arabic or English, up to 120 characters.');
  return {id:row.id,nameEn:row.nameEn.trim(),nameAr:row.nameAr.trim()};
 });
 if(!ids.has('default'))throw Error('Keep the original class group.');
 return classes;
}
export function validateClassSchedule(schedule,classes,validateSchedule){
 const rows=validateSchedule(schedule),ids=new Set(classes.map(row=>row.id));
 if(rows.some(row=>!ids.has(row.classId)))throw Error('Choose an existing class group for every activity.');
 return rows;
}
