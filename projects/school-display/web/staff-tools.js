import {t,language,escape as e} from './i18n.js';
// Manager tools for Faslii: answer teacher requests and maintain the school resources library.
const when=value=>value?new Date(value).toLocaleString(language==='ar'?'ar-QA':'en-GB',{dateStyle:'short',timeStyle:'short'}):'—';
const typeLabel={leave:'Leave',absence:'Absence',correction:'Timetable correction',maintenance:'Maintenance',technical:'Technical support'};
const statusLabel={pending:'Pending',approved:'Approved',rejected:'Rejected',completed:'Completed'};
const categoryLabel={policy:'Policy',teaching:'Teaching document',form:'Form',shared:'Shared file'};
const name=row=>language==='ar'?row.nameAr||row.nameEn:row.nameEn||row.nameAr;
const fileLink=file=>file?`<a href="/api/files/${e(file.id)}" download="${e(file.name)}">📎 ${e(file.name)}</a>`:'';
const readFile=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({name:file.name,data:String(reader.result)});reader.onerror=()=>reject(Error('The file could not be read.'));reader.readAsDataURL(file);});

export const staffPanels=()=>`<section class="panel"><header class="section-heading"><div><span class="eyebrow">${t('Faslii')}</span><h2>${t('Teacher requests')}</h2></div></header><div id="requests-panel" aria-live="polite"></div></section><section class="panel"><header class="section-heading"><div><span class="eyebrow">${t('Faslii')}</span><h2>${t('School resources')}</h2></div></header><div id="resources-panel" aria-live="polite"></div></section>`;

function requestRow(row){
 const open=row.status==='pending'||row.comments.some(item=>!item.staff&&(!row.statusAt||item.at>row.statusAt));
 return `<details class="request-row" ${row.status==='pending'?'open':''}><summary><strong>${e(row.title)}</strong><span class="status-tag ${e(row.status)}">${t(statusLabel[row.status])}</span><small>${e(row.userName)} · ${t(typeLabel[row.type]||row.type)}${row.from?` · ${e(row.from)}${row.to&&row.to!==row.from?' – '+e(row.to):''}`:''} · ${e(when(row.at))}</small></summary>${row.details?`<p class="report-text">${e(row.details)}</p>`:''}${row.attachments.length?`<div class="request-files">${row.attachments.map(fileLink).join('')}</div>`:''}<div class="report-thread">${row.comments.map(item=>`<p class="${item.staff?'':'from-teacher'}"><b>${e(item.byName)}</b> · <small>${e(when(item.at))}</small>${item.status?` · <span class="status-tag ${e(item.status)}">${t(statusLabel[item.status])}</span>`:''}${item.text?`<br>${e(item.text)}`:''}${(item.attachments||[]).length?`<br>${item.attachments.map(fileLink).join(' ')}`:''}</p>`).join('')}</div><form class="request-decide" data-request="${e(row.id)}"><label>${t('Feedback to the teacher (optional)')}<textarea name="comment" rows="2" maxlength="1000"></textarea></label><div class="actions"><button class="primary" name="status" value="approved">${t('Approve')}</button><button class="secondary" name="status" value="rejected">${t('Reject')}</button><button class="secondary" name="status" value="completed">${t('Mark completed')}</button><button class="ghost" name="status" value="comment">${t('Send comment')}</button></div></form>${open?'':''}</details>`;
}
function resourceForm(data,editing){
 const row=editing||{};const audience=row.audience||'all';
 return `<form id="resource-form" class="resource-form" data-id="${e(row.id||'')}"><h3>${t(row.id?'Replace file':'Upload a document')}${row.id?`: ${e(row.title)}`:''}</h3><div class="form-grid"><label>${t('Title')}<input name="title" required maxlength="140" value="${e(row.title||'')}"></label><label>${t('Category')}<select name="category">${Object.entries(categoryLabel).map(([key,label])=>`<option value="${key}" ${row.category===key?'selected':''}>${e(t(label))}</option>`).join('')}</select></label></div><label>${t('Description')}<input name="description" maxlength="600" value="${e(row.description||'')}"></label><label>${t('Who can see it')}<select name="audience" multiple size="${Math.min(6,data.classes.length+1)}"><option value="all" ${audience==='all'?'selected':''}>${t('All teachers')}</option>${data.classes.map(group=>`<option value="${e(group.id)}" ${Array.isArray(audience)&&audience.includes(group.id)?'selected':''}>${e(name(group))}</option>`).join('')}</select></label><label class="toggle"><span>${t('Important: notify teachers about revisions')}</span><input type="checkbox" name="important" ${row.important?'checked':''}></label><label class="toggle"><span>${t('Teachers can download it')}</span><input type="checkbox" name="downloadable" ${row.downloadable===false?'':'checked'}></label>${row.id?`<label>${t('What changed (for revisions)')}<input name="changeNote" maxlength="300"></label>`:''}<label>${t('Document')}<input name="file" type="file" ${row.id?'':'required'} accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.pptx,.txt"></label><p class="hint">${t('Up to 5 MB: PDF, image, Word, Excel, PowerPoint or text.')}</p><button class="primary">${t('Save document')}</button></form>`;
}
function resourceRows(list){
 return list.length?`<div class="table-scroll"><table><thead><tr><th>${t('Title')}</th><th>${t('Category')}</th><th>${t('Version')}</th><th>${t('Updated')}</th><th>${t('Document')}</th><th></th></tr></thead><tbody>${list.map(row=>`<tr><td>${e(row.title)}${row.important?' ★':''}${row.downloadable?'':` <small>(${t('View only')})</small>`}</td><td>${e(t(categoryLabel[row.category]))}</td><td>${row.version}</td><td>${e(when(row.updatedAt))}</td><td>${fileLink(row.file)}</td><td><button type="button" class="ghost" data-edit-resource="${e(row.id)}">${t('Replace file')}</button><button type="button" class="ghost danger" data-remove-resource="${e(row.id)}">${t('Remove')}</button></td></tr>`).join('')}</tbody></table></div>`:`<p class="empty">${t('No documents yet.')}</p>`;
}

export function bindStaffTools({data,api,load,toast,safe}){
 const requestsNode=document.querySelector('#requests-panel'),resourcesNode=document.querySelector('#resources-panel');
 if(requestsNode)api('teacher-requests').then(({requests})=>{
  if(!document.body.contains(requestsNode))return;
  requestsNode.innerHTML=requests.length?requests.map(requestRow).join(''):`<p class="empty">${t('No requests yet.')}</p>`;
  requestsNode.querySelectorAll('.request-decide').forEach(form=>{
   form.onsubmit=safe(async event=>{const status=event.submitter?.value,comment=new FormData(form).get('comment');
    if(status==='comment'){if(!String(comment||'').trim())throw Error('Write a comment first.');await api('teacher-requests/comment',{id:form.dataset.request,text:comment});}
    else await api('teacher-requests/decide',{id:form.dataset.request,status,comment});
    await load();toast('Saved successfully.');});
  });
 }).catch(()=>{requestsNode.innerHTML=`<p class="empty">${t('Requests could not be loaded.')}</p>`;});
 if(resourcesNode){
  let resources=[],editing=null;
  const draw=()=>{resourcesNode.innerHTML=resourceForm(data,editing)+resourceRows(resources);bind();};
  const bind=()=>{
   const form=resourcesNode.querySelector('#resource-form');
   form.onsubmit=safe(async()=>{const v=new FormData(form),file=form.querySelector('[name=file]').files[0];if(file&&file.size>5*1024*1024)throw Error('Each file must be 5 MB or smaller.');
    const audience=v.getAll('audience'),body={id:form.dataset.id||undefined,title:v.get('title'),description:v.get('description'),category:v.get('category'),audience:!audience.length||audience.includes('all')?'all':audience,important:v.get('important')==='on',downloadable:v.get('downloadable')==='on',changeNote:v.get('changeNote')||''};
    if(file)body.file=await readFile(file);
    await api('resources',body);await load();toast('Saved successfully.');});
   resourcesNode.querySelectorAll('[data-edit-resource]').forEach(button=>{button.onclick=()=>{editing=resources.find(row=>row.id===button.dataset.editResource);draw();resourcesNode.querySelector('#resource-form').scrollIntoView({block:'nearest'});};});
   resourcesNode.querySelectorAll('[data-remove-resource]').forEach(button=>{button.onclick=safe(async()=>{if(!confirm(t('Remove this document?')))return;await api('resources/remove',{id:button.dataset.removeResource});await load();toast('Document removed.');});});
  };
  api('resources').then(result=>{if(!document.body.contains(resourcesNode))return;resources=result.resources.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));draw();}).catch(()=>{});
 }
}
