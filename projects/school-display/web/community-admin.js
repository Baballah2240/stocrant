const byId = id => document.getElementById(id);
const status = byId('status');
const settings = byId('settings');
const postForm = byId('post');
const attachForm = byId('attach-form');
const attachDialog = byId('attach-dialog');
const noticeForm = byId('notice');
const flags = ['teacher', 'parent', 'posts', 'classwork', 'showParentComments'];
const audiences = {
  teacher: 'المعلمون / Teachers',
  parent: 'أولياء الأمور / Parents',
  both: 'التطبيقان / Both apps',
};
let state;
let editing = null;
let saving = false;
let photoVersion = 0;
let attachingPost;

const theme = byId('theme');
try {
  const saved = localStorage.getItem('school-community-theme');
  if (['system','light','dark'].includes(saved)) theme.value = saved;
} catch {}
function applyTheme() {
  if (theme.value === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme.value;
}
theme.onchange = () => {
  applyTheme();
  try { localStorage.setItem('school-community-theme', theme.value); } catch {}
};
applyTheme();

async function endpoint(path = '', body) {
  const response = await fetch('/api/community' + path, body === undefined ? {} : {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)
  });
  if (response.status === 401) throw Error('سجّل الدخول من لوحة المدرسة. Sign in from the school dashboard.');
  if (response.status === 403 && body === undefined) throw Error('يلزم حساب مسؤول. Administrator access is required.');
  const result = await response.json();
  if (!response.ok) throw Error(result.error);
  return result;
}

function showStatus(message, error = false) {
  status.textContent = message;
  status.dataset.error = String(error);
}

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) {
    element.textContent = text;
    element.dir = 'auto';
  }
  return element;
}

function button(label, action, danger = false) {
  const element = node('button', label, danger ? 'secondary danger' : 'secondary');
  element.type = 'button';
  element.onclick = () => action(element);
  return element;
}

function removeButton(label, path, body) {
  return button(label, control => {
    if (confirm('هل تريد إزالة هذا المحتوى؟ Remove this content?')) {
      act(control, async () => {
        await endpoint(path,body);
        if (path === '/notice/remove' && editing === body.id) resetNotice();
      });
    }
  }, true);
}

function enabledAudiences(audience) {
  return (audience === 'both' ? ['teacher','parent'] : [audience]).filter(role => state?.settings[role]);
}

function updatePreview() {
  const wanted = noticeForm.elements.audience.value;
  const enabled = enabledAudiences(wanted);
  byId('preview-title').textContent = noticeForm.elements.title.value.trim() || 'عنوان الإشعار / Notification title';
  byId('preview-text').textContent = noticeForm.elements.text.value.trim() || 'نص الرسالة / Message text';
  const count = enabled.reduce((sum, role) => sum + (state?.recipients?.[role] ?? 0), 0);
  const audienceStatus = byId('audience-status');
  if (enabled.length) {
    const recipient = node('span',audiences[enabled.length === 2 ? 'both' : enabled[0]]);
    const countLabel = node('span',count + ' حساب نشط / Active accounts');
    countLabel.dir = 'rtl';
    audienceStatus.replaceChildren(recipient, countLabel);
  } else {
    audienceStatus.textContent = 'فعّل الإشعارات لجمهور واحد على الأقل. Enable notifications for at least one selected audience.';
  }
  byId('send-notice').disabled = saving || enabled.length === 0;
}

function editNotice(notice) {
  if (saving) return;
  const draft = noticeForm.elements.title.value.trim() || noticeForm.elements.text.value.trim();
  if (draft && editing !== notice.id && !confirm('استبدال المسودة الحالية؟ Replace the current draft?')) return;
  editing = notice.id;
  for (const key of ['title','text','audience']) noticeForm.elements[key].value = notice[key];
  byId('send-notice').textContent = 'حفظ التعديل / Save changes';
  byId('cancel-edit').hidden = false;
  updatePreview();
  noticeForm.elements.title.focus();
  noticeForm.scrollIntoView({block:'nearest'});
}

function resetNotice() {
  editing = null;
  noticeForm.reset();
  byId('send-notice').textContent = 'نشر الإشعار / Publish notification';
  byId('cancel-edit').hidden = true;
  updatePreview();
}

function dateLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('ar-QA', {
    dateStyle:'medium', timeStyle:'short', timeZone:state.timezone || 'Asia/Qatar',
  }).format(date);
}

function renderNotices() {
  const filter = byId('notice-filter').value;
  const notices = state.notices.filter(row => !filter || row.audience === filter || row.audience === 'both');
  byId('notices').replaceChildren(...(notices.length ? notices.map(notice => {
    const item = node('li', undefined, 'record');
    const headline = node('div', undefined, 'record-head');
    headline.append(node('strong',notice.title), node('span',dateLabel(notice.editedAt || notice.at),'muted'));
    const roles = enabledAudiences(notice.audience);
    const active = roles.length > 0 && (!notice.type || state.settings[notice.type]);
    item.append(headline, node('p',notice.text), node('p',
      audiences[notice.audience] + ' · ' + (active ? 'ظاهر في التطبيق / Visible in app' : 'مخفي بالإعدادات / Hidden by settings'),
      'muted'));
    const actions = node('div',undefined,'actions');
    if (!notice.type) actions.append(button('تعديل / Edit', () => editNotice(notice)));
    actions.append(removeButton('إزالة / Remove', '/notice/remove', {id:notice.id}));
    item.append(actions);
    return item;
  }) : [node('li','لا توجد إشعارات هنا. No notifications here.','muted')]));
}

function renderPosts() {
  byId('posts').replaceChildren(...(state.posts.length ? state.posts.map(post => {
    const item = node('li', undefined, 'record');
    item.append(node('p',post.text), node('p', dateLabel(post.at) + ' · ♥ ' + post.likeCount,'muted'));
    if (post.photo) {
      const photo = node('img', undefined, 'photo');
      photo.alt = 'صورة المنشور / Post photo';
      photo.loading = 'lazy';
      photo.src = '/api/community/photo/' + encodeURIComponent(post.id);
      item.append(photo);
    }
    const actions = node('div',undefined,'actions');
    if (!post.photo) actions.append(button('إضافة صورة / Add photo', () => openAttachment(post)));
    actions.append(removeButton('إزالة المنشور / Remove post','/moderate',{postId:post.id}));
    item.append(actions);
    if (post.comments.length) {
      const comments = node('ul',undefined,'comments');
      for (const comment of post.comments) {
        const line = node('li');
        line.append(node('strong',comment.author),node('p',comment.text),
          removeButton('إزالة التعليق / Remove comment','/moderate',{postId:post.id,commentId:comment.id}));
        comments.append(line);
      }
      item.append(comments);
    }
    return item;
  }) : [node('li','لا توجد منشورات بعد. No posts yet.','muted')]));
}

async function load({applySettings = false} = {}) {
  state = await endpoint();
  if (applySettings) for (const key of flags) settings.elements[key].checked = state.settings[key];
  byId('workspace').hidden = false;
  postForm.elements.notify.disabled = !state.settings.parent || !state.settings.posts;
  byId('post-notify-help').hidden = !postForm.elements.notify.disabled;
  byId('code').textContent = state.hasCode ? 'تجديد رمز المدرسة / Rotate school code' : 'إنشاء رمز المدرسة / Generate school code';
  updatePreview();
  renderNotices();
  renderPosts();
}

async function initialize() {
  byId('loading').hidden = false;
  byId('retry').hidden = true;
  showStatus('');
  try { await load({applySettings:true}); }
  catch (error) { showStatus(error.message,true); byId('retry').hidden = false; }
  finally { byId('loading').hidden = true; }
}

async function act(control, action, options) {
  if (saving) return;
  saving = true;
  if (control) control.disabled = true;
  updatePreview();
  showStatus('');
  try {
    await action();
    try {
      await load(options);
      showStatus('تم الحفظ / Saved');
    } catch {
      showStatus('تم الحفظ. حدّث الصفحة لعرض أحدث النتائج. Saved. Reload to see the latest results.',true);
    }
  } catch (error) {
    showStatus(error.message,true);
  } finally {
    saving = false;
    if (control) control.disabled = false;
    updatePreview();
  }
}

function photoData(file) {
  if (!file) return Promise.resolve(null);
  if (!file.size || file.size > 5 * 1024 * 1024 || !['image/png','image/jpeg','image/webp'].includes(file.type)) {
    return Promise.reject(Error('اختر صورة PNG أو JPEG أو WebP بحجم لا يتجاوز 5 MB. Choose a PNG, JPEG or WebP up to 5 MB.'));
  }
  return new Promise((resolve,reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const preview = new Image();
        preview.src = reader.result;
        await preview.decode();
        resolve(reader.result);
      } catch {
        reject(Error('تعذّر قراءة الصورة. اختر ملف صورة سليمًا. This image could not be decoded.'));
      }
    };
    reader.onerror = () => reject(Error('تعذّر فتح الصورة. Could not open the photo.'));
    reader.readAsDataURL(file);
  });
}

function resetPhoto() {
  photoVersion++;
  setPhotoError(postForm.elements.photo,byId('photo-error'),'');
  byId('remove-photo').hidden = !postForm.elements.photo.files.length;
  const image = byId('photo-preview');
  image.hidden = true;
  image.removeAttribute('src');
}
postForm.elements.photo.onchange = async () => {
  resetPhoto();
  const version = photoVersion;
  try {
    const data = await photoData(postForm.elements.photo.files[0]);
    if (data && version === photoVersion) {
      byId('photo-preview').src = data;
      byId('photo-preview').hidden = false;
    }
  } catch (error) {
    if (version === photoVersion) {
      setPhotoError(postForm.elements.photo,byId('photo-error'),error.message);
    }
  }
};

function setPhotoError(input, message, error) {
  input.setCustomValidity(error);
  message.textContent = error;
  message.hidden = !error;
}

byId('remove-photo').onclick = () => {
  postForm.elements.photo.value = '';
  resetPhoto();
  postForm.elements.photo.focus();
};

function openAttachment(post) {
  if (saving) return;
  attachingPost = post.id;
  attachForm.reset();
  setPhotoError(attachForm.elements.photo,byId('attach-error'),'');
  byId('attach-caption').textContent = post.text;
  attachDialog.showModal();
}

attachForm.elements.photo.onchange = () => setPhotoError(attachForm.elements.photo,byId('attach-error'),'');
byId('cancel-attach').onclick = () => { if (!saving) attachDialog.close(); };
attachDialog.oncancel = event => { if (saving) event.preventDefault(); };
attachForm.onsubmit = event => {
  event.preventDefault();
  return act(event.submitter, async () => {
    try {
      const photo = await photoData(attachForm.elements.photo.files[0]);
      await endpoint('/post/photo',{postId:attachingPost,photo});
      attachDialog.close();
    } catch (error) {
      byId('attach-error').textContent = error.message;
      byId('attach-error').hidden = false;
      throw error;
    }
  });
};

settings.onsubmit = event => {
  event.preventDefault();
  return act(event.submitter, () => endpoint('/settings', Object.fromEntries(flags.map(key => [key, settings.elements[key].checked]))), {applySettings:true});
};
noticeForm.onsubmit = event => {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(noticeForm));
  const id = editing;
  return act(event.submitter, async () => {
    await endpoint(id ? '/notice/edit' : '/notice', id ? {...body,id} : body);
    resetNotice();
  });
};
postForm.onsubmit = event => {
  event.preventDefault();
  const {text,notify,photo} = postForm.elements;
  return act(event.submitter, async () => {
    await endpoint('/post', {text:text.value, notify:notify.checked && !notify.disabled, photo:await photoData(photo.files[0])});
    postForm.reset();
    resetPhoto();
  });
};
byId('code').onclick = event => {
  const control = event.currentTarget;
  if (state.hasCode && !confirm('تجديد الرمز يلغي رمز التسجيل السابق. Rotate the code and invalidate the previous registration code?')) return;
  return act(control, async () => {
    const {code} = await endpoint('/code',{});
    byId('new-code').textContent = code;
    byId('new-code').hidden = false;
  });
};
noticeForm.oninput = updatePreview;
noticeForm.elements.audience.onchange = updatePreview;
byId('cancel-edit').onclick = resetNotice;
byId('notice-filter').onchange = renderNotices;
byId('retry').onclick = initialize;
initialize();


if (new URLSearchParams(location.search).get('embed') === '1' && window.parent !== window) {
  document.documentElement.classList.add('embedded-community');
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== window.parent) return;
    const mode = event.data?.schoolCommunityTheme;
    if (mode === 'light' || mode === 'dark') document.documentElement.dataset.theme = mode;
  });
  const shell = document.querySelector('.shell');
  new ResizeObserver(() => {
    window.parent.postMessage({schoolCommunityHeight: shell.getBoundingClientRect().height + 2}, location.origin);
  }).observe(shell);
}