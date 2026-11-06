import {t,language,escape as e} from './i18n.js';
// Delivery results for managers: what reached the app, what was read and
// acknowledged, teacher replies, outstanding timetable changes and the
// administrator's urgent-alert policy.
const when=value=>value?new Date(value).toLocaleString(language==='ar'?'ar-QA':'en-GB',{dateStyle:'short',timeStyle:'short'}):'—';
const lessonText=row=>row?[row.subjectEn||row.subjectAr,row.start&&`${row.start}–${row.end}`,row.room].filter(Boolean).join(' · '):'—';
const changeKinds={cancelled:'Lesson cancelled',room:'Room changed',time:'Time changed',substitute:'Cover assignment',covered:'Lesson covered by another teacher',added:'Lesson added'};
const priorityLabel=value=>value==='urgent'?'Urgent':value==='important'?'Important':'Normal';

function batchRow(batch){
 const count=key=>batch.recipients.filter(row=>row[key]).length,open=batch.requireAck?batch.recipients.filter(row=>!row.ackAt):[];
 return `<details class="report-row"><summary><strong>${e(batch.subject||batch.text.slice(0,60))}</strong><span class="badge">${e(t(priorityLabel(batch.priority)))}</span><small>${e(when(batch.at))} · ${t('Delivered')} ${count('deliveredAt')}/${batch.recipients.length} · ${t('Read')} ${count('readAt')}${batch.requireAck?` · ${t('Acknowledged')} ${count('ackAt')}`:''}</small></summary>${open.length?`<p class="issue-card">${t('Waiting for acknowledgement')}: ${open.map(row=>e(row.name)).join(', ')}</p>`:''}<p class="report-text">${e(batch.text)}</p><div class="table-scroll"><table><thead><tr><th>${t('Recipient')}</th><th>${t('In the app')}</th><th>${t('Read')}</th><th>${t('Acknowledged')}</th><th>${t('Push')}</th><th>${t('Email')}</th></tr></thead><tbody>${batch.recipients.map(row=>`<tr><td>${e(row.name)}</td><td>${e(row.deliveredAt?when(row.deliveredAt):t('Waiting'))}</td><td>${e(when(row.readAt))}</td><td>${batch.requireAck?e(when(row.ackAt)):'—'}</td><td>${t('Not set up')}</td><td>${t('Not set up')}</td></tr>`).join('')}</tbody></table></div></details>`;
}
function conversationRow(c){
 return `<details class="report-row" ${c.unread?'open':''}><summary><strong>${e(c.teacher)}</strong>${c.unread?`<span class="badge">${c.unread} ${t('new')}</span>`:''}<small>${e(c.subject||c.messages[0].text.slice(0,60))}</small></summary><div class="report-thread">${c.messages.map(m=>`<p class="${m.direction==='up'?'from-teacher':''}"><b>${e(m.fromName)}</b> · <small>${e(when(m.at))}</small><br>${e(m.text)}</p>`).join('')}</div><form class="staff-reply" data-thread="${e(c.threadId)}"><label>${t('Reply')}<textarea name="text" rows="2" maxlength="2000" required></textarea></label><button class="primary">${t('Send reply')}</button></form></details>`;
}
function changeRow(c){
 const status=c.conflict?`<span class="danger">${t('Conflict')}: ${e(c.conflict.text)}</span>`:e(t(c.readAt?'Seen':c.deliveredAt?'Delivered':'Waiting'));
 return `<tr><td>${e(c.teacher)}</td><td>${e(t(changeKinds[c.kind]||c.kind))}</td><td>${e(c.date)}</td><td>${e(lessonText(c.before))} → ${e(c.kind==='cancelled'?t('Cancelled'):lessonText(c.after))}</td><td>${status}</td></tr>`;
}
function policyForm(policy){
 return `<form id="policy-form" class="policy-form"><h3>${t('Urgent alerts and quiet hours')}</h3><label class="toggle"><span>${t('Urgent alerts sound during teachers’ quiet hours')}</span><input type="checkbox" name="urgentBypassQuiet" ${policy.urgentBypassQuiet?'checked':''}></label><div class="form-grid"><label>${t('Explanation shown to teachers (English)')}<input name="noteEn" maxlength="300" value="${e(policy.noteEn||'')}"></label><label>${t('Explanation shown to teachers (Arabic)')}<input name="noteAr" maxlength="300" dir="rtl" value="${e(policy.noteAr||'')}"></label></div><button class="secondary">${t('Save policy')}</button></form>`;
}
export function messageReport(report,admin){
 const changes=report.changes.filter(c=>!c.ackAt||c.conflict).slice(0,30);
 return `<h3>${t('Sent messages')}</h3>${report.batches.map(batchRow).join('')||`<p class="empty">${t('No messages sent in the last 30 days.')}</p>`}<h3>${t('Teacher replies')}</h3>${report.conversations.map(conversationRow).join('')||`<p class="empty">${t('No replies yet.')}</p>`}<h3>${t('Timetable changes waiting for teachers')}</h3>${changes.length?`<div class="table-scroll"><table><thead><tr><th>${t('Teacher')}</th><th>${t('Change')}</th><th>${t('Date')}</th><th>${t('Before → now')}</th><th>${t('Status')}</th></tr></thead><tbody>${changes.map(changeRow).join('')}</tbody></table></div>`:`<p class="empty">${t('Every change has been acknowledged.')}</p>`}${admin?policyForm(report.policy):''}`;
}
export function bindMessageReport(node,{api,load,toast,safe,admin}){
 api('teacher-messages').then(report=>{
  if(!document.body.contains(node))return;
  node.innerHTML=messageReport(report,admin);
  node.querySelectorAll('.staff-reply').forEach(form=>{form.onsubmit=safe(async()=>{await api('teacher-messages/reply',{threadId:form.dataset.thread,text:new FormData(form).get('text')});await load();toast('Reply sent.');});});
  const policy=node.querySelector('#policy-form');
  if(policy)policy.onsubmit=safe(async()=>{const v=new FormData(policy);await api('message-policy',{urgentBypassQuiet:v.get('urgentBypassQuiet')==='on',noteEn:v.get('noteEn'),noteAr:v.get('noteAr')},'PUT');await load();toast('Saved successfully.');});
 }).catch(()=>{node.innerHTML=`<p class="empty">${t('Delivery results could not be loaded.')}</p>`;});
}
