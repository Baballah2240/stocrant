import {createHash, randomBytes, timingSafeEqual} from 'node:crypto';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), {status}); };
const id = () => randomBytes(16).toString('hex');
const digest = value => createHash('sha256').update(value).digest();
const clean = (value, max) => typeof value === 'string' && value.trim().length <= max ? value.trim() : '';

export function community(state) {
  const board = state.community ??= {
    joinHash: '', posts: [], notices: [],
    settings: {teacher: true, parent: true, posts: true, classwork: true}
  };
  board.settings.showParentComments ??= false;
  return board;
}

export function rotateCommunityCode(state) {
  const code = randomBytes(12).toString('hex').toUpperCase();
  community(state).joinHash = digest(code).toString('hex');
  return code;
}

export function checkCommunityCode(state, code) {
  const saved = community(state).joinHash;
  if (!saved || typeof code !== 'string' || code.length > 48 ||
      !timingSafeEqual(Buffer.from(saved, 'hex'), digest(code.trim().toUpperCase()))) {
    fail('Enter the current school community code.', 403);
  }
}

export function saveCommunitySettings(state, body) {
  const settings = community(state).settings;
  for (const key of Object.keys(settings)) {
    if (key === 'showParentComments' && body[key] === undefined) continue;
    if (typeof body[key] !== 'boolean') fail('Choose a value for each notification setting.');
  }
  community(state).settings = Object.fromEntries(Object.keys(settings).map(key => [key, body[key] ?? settings[key]]));
}

export function addCommunityPost(state, body, uploadPhoto) {
  const text = clean(body.text, 1800);
  if (!text) fail('Enter a post of up to 1,800 characters.');
  const board = community(state);
  if (board.posts.length >= 100) fail('Remove an older post before publishing another.', 409);
  const photo = body.photo ? uploadPhoto(body.photo) : null;
  const post = {id: id(), text, photo, at: new Date().toISOString(), likes: [], comments: []};
  board.posts.unshift(post);
  return post;
}

export function findCommunityPost(state, postId) {
  const post = community(state).posts.find(row => row.id === postId);
  if (!post) fail('Post not found.', 404);
  return post;
}

export function attachCommunityPhoto(state, body, uploadPhoto) {
  const post = findCommunityPost(state, body.postId);
  if (post.photo) fail('This post already has a photo.', 409);
  if (typeof body.photo !== 'string' || !body.photo) fail('Choose a photo before saving.');
  post.photo = uploadPhoto(body.photo);
  return post;
}

export function communityView(state, user, {administrator = false} = {}) {
  const visible = administrator || community(state).settings.showParentComments;
  return community(state).posts.map(({id, text, photo, at, likes, comments}) => ({
    id, text, at, photo: Boolean(photo), liked: likes.includes(user.id), likeCount: likes.length,
    commentCount: comments.length,
    // Families see staff names, but other parents only as "Parent".
    comments: visible ? comments.map(({id, author, authorId, authorRole, text, at}) => ({id, text, at,
      author: administrator || authorId === user.id || (authorRole && authorRole !== 'parent') ? author : 'ولي أمر · Parent'})) : [],
  }));
}

export function reactToPost(state, user, body) {
  const post = findCommunityPost(state, body.postId);
  if (typeof body.liked !== 'boolean') fail('Choose whether to like the post.');
  const likes = new Set(post.likes);
  if (body.liked) likes.add(user.id);
  else likes.delete(user.id);
  post.likes = [...likes];
}

export function commentOnPost(state, user, body) {
  const post = findCommunityPost(state, body.postId);
  const text = clean(body.text, 500);
  if (!text) fail('Enter a comment of up to 500 characters.');
  if (post.comments.length >= 100) fail('This post has reached its comment limit.', 409);
  post.comments.push({id: id(), author: user.name, authorId: user.id, authorRole: user.role, text, at: new Date().toISOString()});
}

export function moderateCommunityPost(state, body) {
  const board = community(state);
  const post = findCommunityPost(state, body.postId);
  if (body.commentId) post.comments = post.comments.filter(row => row.id !== body.commentId);
  else board.posts = board.posts.filter(row => row !== post);
}

function noticeFields(body) {
  const title = clean(body.title, 100), text = clean(body.text, 500);
  if (!title || !text || !['teacher','parent','both'].includes(body.audience)) {
    fail('Enter a title, message, and app audience.');
  }
  return {title, text, audience: body.audience};
}

export function enabledCommunityRoles(settings, audience) {
  return (audience === 'both' ? ['teacher','parent'] : [audience]).filter(role => settings[role]);
}

export function addCommunityNotice(state, body) {
  const {title, text, audience} = noticeFields(body);
  const type = ['posts','classwork'].includes(body.type) ? body.type : null;
  const notice = {id: id(), title, text, audience, type, at: new Date().toISOString()};
  const board = community(state);
  board.notices = [notice, ...board.notices].slice(0, 50);
  return notice;
}

export function editCommunityNotice(state, body) {
  const board = community(state);
  const notice = board.notices.find(row => row.id === body.id);
  if (!notice) fail('Notification not found.', 404);
  if (notice.type) fail('Automatic notifications cannot be edited.', 409);
  const fields = noticeFields(body);
  if (!enabledCommunityRoles(board.settings, fields.audience).length) fail('Enable notifications for the selected audience.', 409);
  Object.assign(notice, fields, {editedAt: new Date().toISOString()});
  return notice;
}

export function communityNotices(state, role) {
  const {settings, notices} = community(state);
  if (!settings[role]) return [];
  return notices.filter(row => (row.audience === 'both' || row.audience === role) && (!row.type || settings[row.type]));
}

