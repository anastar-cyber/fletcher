import { cupidSVG, cupidFlyingSVG, pixelHeartSVG } from './cupid.js';
import {
  STEPS,
  FIELDS,
  PHOTO_PROMPTS,
  MIN_PROMPT_PHOTOS,
  MAX_PROMPT_PHOTOS,
  DONE_WITH_PHOTOS,
  SKIP_PHOTOS,
  SKIP,
  promptById,
  afterPromptPhoto,
  parseTopics,
  introFor,
  firstName,
  isSkipAnswer,
  wrapUp,
  afterSendOff,
  followUpReplies,
  FEEDBACK,
  modeFor,
} from './flow.js';
import { RESPONSES_URL } from './config.js';
import { buildDemo } from './demo.js';
import { processPhoto, putPhoto, photoURL, deletePhoto, clearPhotos } from './photos.js';

const STORAGE_KEY = 'fletcher.onboarding.v2';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const $ = (sel) => document.querySelector(sel);
const thread = $('#thread');
const list = $('#messages');
const form = $('#composer');
const input = $('#input');
const sendBtn = $('#send');
const attachBtn = $('#attach');
const fileInput = $('#file');
const chips = $('#chips');
const status = $('#status');
const progress = $('#progress');

/* ---------- state ---------- */

const freshState = () => ({
  id: Math.random().toString(36).slice(2, 10), // anonymous id that ties a profile to its feedback
  step: 0, // index into STEPS of the question being answered
  asked: false, // has the current step's question been fully delivered?
  phase: 'onboarding', // onboarding → ready → sent
  profile: {},
  photos: [], // { id, prompt } — prompt is null for the face photo
  pendingPrompt: null, // prompt picked, waiting for its photo
  visibility: {}, // field key or `photo:<id>` → true (shared) / false (private)
  intro: null, // the user's own rewrite of Fletcher's intro
  feedback: null, // after the send-off: 'rating' → 'comment' → 'done'
  outbox: [], // submissions waiting to reach the responses sheet
  messages: [], // { from: 'bot' | 'me', type: 'text' | 'photo' | 'review', text?, photoId? }
  startedAt: Date.now(),
});

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.messages)) return { ...freshState(), ...saved };
  } catch {}
  return freshState();
}

let state = load();
let busy = false; // Fletcher is "typing"
let runId = 0; // bumps on restart so in-flight typing sequences stop

const save = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
};

const currentStep = () => (state.phase === 'onboarding' ? STEPS[state.step] : undefined);
const facePhoto = () => state.photos.find((p) => !p.prompt);
const promptPhotos = () => state.photos.filter((p) => p.prompt);

function isShared(key) {
  if (key in state.visibility) return state.visibility[key];
  if (key.startsWith('photo:')) return true;
  return FIELDS.find((f) => f.key === key)?.share ?? false;
}

/* ---------- rendering ---------- */

const escapeHTML = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** <img> that fills in once its photo loads from storage. */
function photoImg(id, cls = '') {
  const img = document.createElement('img');
  img.className = cls;
  img.alt = '';
  img.decoding = 'async';
  photoURL(id).then((url) => {
    if (url) img.src = url;
    else img.closest('.photo-frame')?.classList.add('is-missing');
  });
  return img;
}

function renderMessage(msg, animate) {
  const el = document.createElement('div');
  el.className = `msg msg--${msg.from}`;
  if (animate && !reduceMotion) el.classList.add('msg--enter');

  if (msg.type === 'photo') {
    el.classList.add('msg--photo');
    const frame = document.createElement('div');
    frame.className = 'photo-frame';
    frame.appendChild(photoImg(msg.photoId));
    el.appendChild(frame);
  } else if (msg.type === 'demo') {
    el.classList.add('msg--card');
    el.innerHTML = `
      <article class="demo-card">
        <div class="demo-card__pair" aria-hidden="true">
          <div class="avatar avatar--xs">${cupidSVG()}</div>
          <div class="avatar avatar--xs avatar--alt">${cupidSVG()}</div>
        </div>
        <div class="demo-card__text">
          <div class="review-card__title">Fletcher meets Fletcher</div>
          <div class="review-card__sub">A sample conversation with a made-up match.</div>
        </div>
        <button class="review-card__btn" type="button">Watch the demo</button>
      </article>`;
    el.querySelector('button').addEventListener('click', openDemo);
  } else if (msg.type === 'review') {
    el.classList.add('msg--card');
    el.innerHTML = '<article class="review-card"></article>';
    fillReviewCard(el.firstElementChild);
  } else {
    el.innerHTML = `<div class="bubble">${escapeHTML(msg.text).replace(/\n/g, '<br>')}</div>`;
  }
  list.appendChild(el);
  return el;
}

function fillReviewCard(card) {
  const sent = state.phase === 'sent';
  card.innerHTML = `
    <div class="review-card__thumbs"></div>
    <div class="review-card__text">
      <div class="review-card__title">Your Fletcher profile</div>
      <div class="review-card__sub">${
        sent ? `Sent ${escapeHTML(formatStamp(state.sentAt))}. You can still change what I share.` : 'Choose what I can share, then send me off.'
      }</div>
    </div>
    <button class="review-card__btn ${sent ? 'is-secondary' : ''}" type="button">${sent ? 'View profile' : 'Review profile'}</button>`;
  const thumbs = card.querySelector('.review-card__thumbs');
  [facePhoto(), ...promptPhotos()].filter(Boolean).slice(0, 3).forEach((p) => {
    const f = document.createElement('div');
    f.className = 'photo-frame';
    f.appendChild(photoImg(p.id));
    thumbs.appendChild(f);
  });
  card.querySelector('button').addEventListener('click', openSheet);
}

const refreshReviewCards = () => document.querySelectorAll('.review-card').forEach(fillReviewCard);

function renderReceipt() {
  list.querySelector('.receipt')?.remove();
  const last = list.lastElementChild;
  if (!last || !last.classList.contains('msg--me')) return;
  const r = document.createElement('div');
  r.className = 'receipt';
  r.textContent = busy ? 'Read' : 'Delivered';
  list.appendChild(r);
}

function scrollToEnd(smooth = true) {
  thread.scrollTo({ top: thread.scrollHeight, behavior: smooth && !reduceMotion ? 'smooth' : 'auto' });
}

function formatStamp(t) {
  const d = new Date(t);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? `Today ${time}`
    : `${d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} at ${time}`;
}

function chipLabels(step) {
  if (step.input === 'prompts') {
    const used = new Set(state.photos.map((p) => p.prompt));
    const open = PHOTO_PROMPTS.filter((p) => !used.has(p.id) && p.id !== state.pendingPrompt).map((p) => p.label);
    return [promptPhotos().length >= MIN_PROMPT_PHOTOS ? DONE_WITH_PHOTOS : SKIP_PHOTOS, ...open];
  }
  return step.chips;
}

function feedbackChips() {
  if (state.feedback === 'rating') return FEEDBACK.ratings;
  if (state.feedback === 'comment') return [FEEDBACK.noIdeas];
  return null;
}

function renderChips() {
  chips.innerHTML = '';
  const step = currentStep();
  const labels = busy ? null : step ? (state.asked ? chipLabels(step) : null) : feedbackChips();
  chips.hidden = !labels?.length;
  if (chips.hidden) return;
  for (const label of labels) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    if (label === DONE_WITH_PHOTOS) b.classList.add('chip--strong');
    if (label === SKIP_PHOTOS || label === SKIP) b.classList.add('chip--quiet');
    b.textContent = label;
    b.addEventListener('click', () => submit(label));
    chips.appendChild(b);
  }
}

/** Is Fletcher waiting on a photo right now? */
function wantsPhoto() {
  const step = currentStep();
  if (!step || !state.asked || busy) return false;
  return step.input === 'photo' || (step.input === 'prompts' && !!state.pendingPrompt);
}

function syncComposer() {
  const step = currentStep();
  const photoStep = step && (step.input === 'photo' || step.input === 'prompts');
  attachBtn.hidden = !photoStep;
  attachBtn.disabled = !wantsPhoto();
  attachBtn.classList.toggle('is-ready', wantsPhoto());

  input.placeholder = step
    ? step.input === 'prompts' && state.pendingPrompt
      ? 'Tap the photo button to add it'
      : step.placeholder
    : state.feedback === 'rating'
      ? 'A number, 1 to 5'
      : state.feedback === 'comment'
        ? 'One thing to improve'
        : state.phase === 'sent'
          ? 'Tell Fletcher anything'
      : 'Message Fletcher';
  sendBtn.disabled = !input.value.trim() || busy;
  status.textContent =
    busy ? 'typing…' : state.phase === 'sent' ? 'On standby · network opening soon' : 'Your personal cupid';
  status.classList.toggle('is-standby', state.phase === 'sent' && !busy);
  $('#profile-btn').hidden = state.phase === 'onboarding';
  $('#demo-btn').hidden = state.phase !== 'sent';

  // Progress: one tick per question, plus the profile review at the end.
  const total = STEPS.length + 1;
  const done = state.phase === 'onboarding' ? state.step : total;
  progress.hidden = state.phase === 'sent';
  progress.style.setProperty('--p', done / total);
  progress.setAttribute('aria-valuenow', String(Math.round((done / total) * 100)));

  const hadChips = !chips.hidden;
  renderChips();
  // Chips take room from the thread; keep the latest message in view.
  if (!chips.hidden && !hadChips) scrollToEnd();
}

function renderAll() {
  list.innerHTML = '';
  $('#stamp').textContent = formatStamp(state.startedAt);
  state.messages.forEach((m) => renderMessage(m, false));
  renderReceipt();
  syncComposer();
  requestAnimationFrame(() => scrollToEnd(false));
}

/* ---------- Fletcher speaking ---------- */

const wait = (ms) => new Promise((r) => setTimeout(r, reduceMotion ? Math.min(ms, 150) : ms));
const typingTime = (text = '') => Math.min(1700, Math.max(650, 420 + text.length * 14));

function showTyping() {
  const el = document.createElement('div');
  el.className = 'msg msg--bot msg--typing';
  el.setAttribute('aria-label', 'Fletcher is typing');
  el.innerHTML = '<div class="bubble"><span></span><span></span><span></span></div>';
  list.appendChild(el);
  scrollToEnd();
  return el;
}

/** Deliver bot messages one at a time with typing pauses. Returns false if interrupted. */
async function say(items) {
  const id = runId;
  busy = true;
  renderReceipt();
  syncComposer();
  await wait(380);
  for (const item of items) {
    if (id !== runId) return false;
    const msg = typeof item === 'string' ? { from: 'bot', type: 'text', text: item } : { from: 'bot', ...item };
    const typing = showTyping();
    await wait(msg.type === 'text' ? typingTime(msg.text) : 900);
    typing.remove();
    if (id !== runId) return false;
    state.messages.push(msg);
    save();
    renderMessage(msg, true);
    scrollToEnd();
    await wait(220);
  }
  if (id !== runId) return false;
  busy = false;
  syncComposer();
  if (matchMedia('(hover: hover)').matches) input.focus({ preventScroll: true });
  return true;
}

async function askCurrent() {
  const step = currentStep();
  if (step) {
    if (await say(step.ask(state.profile))) {
      state.asked = true;
      save();
      syncComposer();
    }
  } else if (state.phase === 'onboarding') {
    if (await say([...wrapUp(state.profile), { type: 'review' }])) {
      state.phase = 'ready';
      save();
      syncComposer();
    }
  }
}

/** Move past the current step: react, then ask the next question. */
async function advance(reaction) {
  state.step += 1;
  state.asked = false;
  state.pendingPrompt = null;
  save();
  if (await say(reaction)) await askCurrent();
}

/* ---------- user input ---------- */

function pushMine(msg) {
  state.messages.push(msg);
  save();
  renderMessage(msg, true);
  renderReceipt();
  scrollToEnd();
}

async function submit(raw) {
  const text = raw.trim();
  if (!text || busy) return;

  pushMine({ from: 'me', type: 'text', text });
  input.value = '';
  autosize();

  if (state.feedback === 'rating') {
    const n = Number.parseInt(text, 10);
    if (!(n >= 1 && n <= 5)) {
      await say([FEEDBACK.retryRating]);
      return;
    }
    state.rating = n;
    state.feedback = 'comment';
    save();
    await say(FEEDBACK.afterRating(n));
    return;
  }
  if (state.feedback === 'comment') {
    state.feedback = 'done';
    save();
    queueSubmission({
      type: 'feedback',
      rating: state.rating,
      comment: text === FEEDBACK.noIdeas ? '' : text,
    });
    await say(FEEDBACK.done);
    return;
  }

  if (state.phase !== 'onboarding') {
    state.profile.extras = [...extras(), { id: newId(), text }];
    save();
    queueSubmission({ type: 'note', comment: text });
    const n = state.profile.extras.length;
    await say([followUpReplies[(n - 1) % followUpReplies.length]]);
    return;
  }

  const step = currentStep();
  if (step.input === 'photo') {
    if (isSkipAnswer(text)) await advance(step.skipped());
    else await say(['Send a photo, or tap Skip for now.']);
    return;
  }
  if (step.input === 'prompts') {
    await handlePromptText(step, text);
    return;
  }

  const value = step.parse ? step.parse(text) : text;
  if (!value) {
    await say(step.retry());
    return;
  }
  state.profile[step.key] = value;
  await advance(step.react(value, state.profile));
}

async function handlePromptText(step, text) {
  const count = promptPhotos().length;
  const done = text === DONE_WITH_PHOTOS || text === SKIP_PHOTOS || isSkipAnswer(text) || /^(done|i'?m done|that'?s enough)/i.test(text);
  if (done) {
    await advance(count >= MIN_PROMPT_PHOTOS ? step.react(promptPhotos()) : step.skipped());
    return;
  }
  const prompt = PHOTO_PROMPTS.find((p) => p.label.toLowerCase() === text.toLowerCase());
  if (prompt) {
    state.pendingPrompt = prompt.id;
    save();
    await say([prompt.ask]);
    return;
  }
  await say(['Pick a prompt below, then tap the photo button.']);
}

async function submitPhoto(file) {
  if (!file || !wantsPhoto()) return;
  const step = currentStep();
  let blob;
  try {
    blob = await processPhoto(file);
  } catch {
    await say(['Hmm, I couldn’t open that one. Try a JPG or PNG?']);
    return;
  }
  const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  await putPhoto(id, blob);
  const prompt = step.input === 'prompts' ? state.pendingPrompt : null;
  state.photos.push({ id, prompt });
  state.pendingPrompt = null;
  pushMine({ from: 'me', type: 'photo', photoId: id });

  if (step.input === 'photo') {
    await advance(step.react());
    return;
  }
  const count = promptPhotos().length;
  const reaction = promptById(prompt).react;
  if (count >= MAX_PROMPT_PHOTOS) await advance([reaction, ...step.react(promptPhotos())]);
  else await say([reaction, ...afterPromptPhoto(count)]);
}

/* ---------- send-off ---------- */

async function sendOff() {
  if (state.phase !== 'ready' || busy) return;
  state.phase = 'sent';
  state.sentAt = Date.now();
  save();
  refreshReviewCards();
  syncComposer();
  queueSubmission(profileSubmission());
  await playFlyoff();
  if (await say(afterSendOff())) {
    state.feedback = 'rating';
    save();
    syncComposer();
  }
}

/* ---------- responses sheet ---------- */

/** One row for the responses sheet. Photos and texting samples stay on the device. */
function profileSubmission() {
  const p = state.profile;
  const items = [
    ...FIELDS.filter((f) => p[f.key] && !(f.key === 'anythingElse' && isSkipAnswer(p.anythingElse))).map((f) => ({
      key: f.key,
      label: f.label,
      value: p[f.key],
    })),
    ...extras().map((x) => ({ key: `extra:${x.id}`, label: 'Added', value: x.text })),
  ];
  const list = (shared) =>
    items
      .filter((i) => isShared(i.key) === shared)
      .map((i) => `${i.label}: ${i.value}`)
      .join(' | ');
  return {
    type: 'profile',
    mode: modeFor(p),
    name: p.name || '',
    school: p.school || '',
    hometown: p.hometown || '',
    lookingFor: p.lookingFor || '',
    myType: p.type || '',
    greenFlags: p.greenFlags || '',
    dealbreakers: p.dealbreakers || '',
    hobbies: p.hobbies || '',
    anythingElse: p.anythingElse && !isSkipAnswer(p.anythingElse) ? p.anythingElse : '',
    public: list(true),
    private: list(false),
    neverBringUp: (p.offLimits || []).join(', '),
    facePhoto: facePhoto() ? 'yes' : 'no',
    promptPhotos: promptPhotos()
      .map((ph) => promptById(ph.prompt).label + (isShared(`photo:${ph.id}`) ? '' : ' (private)'))
      .join(' | '),
    textingSample: p.texting && !isSkipAnswer(p.texting) ? 'yes' : 'no',
    intro: state.intro || introFor(p, isShared),
  };
}

function queueSubmission(data) {
  if (!RESPONSES_URL) return;
  state.outbox = [...(state.outbox || []), { submittedAt: new Date().toISOString(), id: state.id, ...data }];
  save();
  flushOutbox();
}

let flushing = false;
async function flushOutbox() {
  if (!RESPONSES_URL || flushing || !state.outbox?.length) return;
  flushing = true;
  try {
    while (state.outbox.length) {
      // Apps Script doesn't send CORS headers, so post blind; a network error throws and we retry later.
      await fetch(RESPONSES_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(state.outbox[0]),
      });
      state.outbox.shift();
      save();
    }
  } catch {
    // Offline or blocked: keep the queue and try again on the next visit.
  } finally {
    flushing = false;
  }
}

function playFlyoff() {
  const stage = $('#flyoff');
  if (reduceMotion) return Promise.resolve();
  const hearts = Array.from({ length: 9 }, (_, i) => {
    const colors = ['#8C1D35', '#D9798C', '#EBC3BE'];
    return `<span class="flyoff__heart" style="--i:${i};--x:${(i % 3) - 1};--c:${colors[i % 3]}">${pixelHeartSVG(colors[i % 3])}</span>`;
  }).join('');
  stage.innerHTML = `<div class="flyoff__cupid">${cupidFlyingSVG()}</div>${hearts}`;
  stage.classList.add('is-playing');
  return new Promise((resolve) =>
    setTimeout(() => {
      stage.classList.remove('is-playing');
      stage.innerHTML = '';
      resolve();
    }, 2400),
  );
}

/* ---------- profile review sheet ---------- */

const sheet = $('#sheet');
const sheetBody = $('#sheet-body');
const sheetFoot = $('#sheet-foot');
const sheetFile = $('#sheet-file');
let editing = null; // field key, 'intro', or null

const ICONS = {
  open: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.8-1.2"/></svg>',
  locked: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>',
  shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v6c0 4.4-3 7.7-7 9-4-1.3-7-4.6-7-9V6l7-3z"/><path d="M9 12l2 2 4-4"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>',
  info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
  camera: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="15" rx="3"/><circle cx="9" cy="10.5" r="1.8"/><path d="M21 16l-5-5-8 9"/></svg>',
};

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** Extra details, from chat after the send-off or added on the profile screen. */
function extras() {
  const list = state.profile.extras || [];
  if (list.some((x) => typeof x === 'string')) {
    state.profile.extras = list.map((x) => (typeof x === 'string' ? { id: newId(), text: x } : x));
  }
  return state.profile.extras || [];
}

function visSwitch(key, label) {
  const on = isShared(key);
  return `<button class="switch ${on ? 'is-on' : ''}" type="button" role="switch" aria-checked="${on}" data-act="toggle" data-key="${key}" aria-label="${escapeHTML(label)}: ${on ? 'public' : 'private'}">
    <span class="switch__text">${on ? 'Public' : 'Private'}</span><span class="switch__track"><span class="switch__thumb"></span></span>
  </button>`;
}

/** One row of the "About you" list. `remove` lets the user delete it while editing. */
function itemRow({ key, label, value, remove = false }) {
  if (editing === key) {
    return `<li class="pf-row is-editing">
      <label class="pf-row__label" for="edit-field">${label}</label>
      <textarea class="pf-textarea" id="edit-field" rows="2">${escapeHTML(value)}</textarea>
      <div class="pf-edit-actions">
        ${remove ? `<button class="btn-text btn-text--danger" type="button" data-act="remove-extra" data-key="${key}">Delete</button><span class="pf-edit-actions__gap"></span>` : ''}
        <button class="btn-text" type="button" data-act="cancel">Cancel</button>
        <button class="btn-small" type="button" data-act="save" data-key="${key}">Save</button>
      </div>
    </li>`;
  }
  return `<li class="pf-row ${isShared(key) ? '' : 'is-private'}">
    <button class="pf-row__main" type="button" data-act="edit" data-key="${key}" aria-label="Edit ${escapeHTML(label)}">
      <span class="pf-row__label">${label}</span>
      <span class="pf-row__value">${escapeHTML(value)}</span>
    </button>
    ${visSwitch(key, label)}
  </li>`;
}

function photoSlide(photo) {
  const prompt = photo.prompt ? promptById(photo.prompt) : null;
  const key = `photo:${photo.id}`;
  const shared = !prompt || isShared(key);
  const slide = document.createElement('div');
  slide.className = `pf-slide ${shared ? '' : 'is-private'}`;
  slide.innerHTML = `
    <div class="photo-frame">
      ${prompt ? `<button class="pf-slide__remove" type="button" data-act="remove-photo" data-id="${photo.id}" aria-label="Remove photo: ${escapeHTML(prompt.label)}">${ICONS.x}</button>` : ''}
      ${shared ? '' : `<span class="pf-slide__lock">${ICONS.locked}Hidden</span>`}
    </div>
    <div class="pf-slide__title">${prompt ? escapeHTML(prompt.label) : 'You'}</div>
    <div class="pf-slide__meta">${
      prompt
        ? visSwitch(key, prompt.label)
        : `<span class="pf-slide__note">Always shown</span><button class="btn-text" type="button" data-act="replace-face">Replace</button>`
    }</div>`;
  slide.querySelector('.photo-frame').prepend(photoImg(photo.id));
  return slide;
}

function renderCarousel() {
  const track = sheetBody.querySelector('.pf-carousel');
  const dots = sheetBody.querySelector('.pf-dots');
  const face = facePhoto();
  if (face) track.appendChild(photoSlide(face));
  else
    track.insertAdjacentHTML(
      'beforeend',
      `<div class="pf-slide"><button class="pf-add-photo" type="button" data-act="replace-face"><span class="pf-add-photo__icon">${ICONS.camera}</span>Add a photo of you</button><div class="pf-slide__title">You</div><div class="pf-slide__meta"><span class="pf-slide__note">Matches see this first</span></div></div>`,
    );
  promptPhotos().forEach((ph) => track.appendChild(photoSlide(ph)));

  const count = track.children.length;
  dots.innerHTML =
    count > 1
      ? Array.from({ length: count }, (_, i) => `<button type="button" aria-label="Photo ${i + 1} of ${count}"></button>`).join('')
      : '';
  const slideStep = () => (track.children[1]?.offsetLeft ?? 0) - (track.children[0]?.offsetLeft ?? 0) || 1;
  const markDot = () => {
    // At the far end, the last slide may not reach the left edge, so treat it as active.
    const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
    const i = atEnd ? count - 1 : Math.min(count - 1, Math.round(track.scrollLeft / slideStep()));
    [...dots.children].forEach((d, j) => d.classList.toggle('is-active', i === j));
  };
  [...dots.children].forEach((d, i) =>
    d.addEventListener('click', () =>
      track.scrollTo({ left: i * slideStep(), behavior: reduceMotion ? 'auto' : 'smooth' }),
    ),
  );
  track.addEventListener('scroll', markDot, { passive: true });
  markDot();
}

function renderSheet() {
  const scroll = sheet.scrollTop;
  const carouselScroll = sheetBody.querySelector('.pf-carousel')?.scrollLeft ?? 0;
  const p = state.profile;
  const intro = state.intro || introFor(p, isShared);
  const meta = [isShared('school') && p.school, isShared('hometown') && p.hometown].filter(Boolean);
  const topics = p.offLimits || [];
  const items = [
    ...FIELDS.filter((f) => p[f.key] && !(f.key === 'anythingElse' && isSkipAnswer(p.anythingElse))).map((f) => ({
      key: f.key,
      label: f.label,
      value: p[f.key],
    })),
    ...extras().map((x) => ({ key: `extra:${x.id}`, label: 'Added by you', value: x.text, remove: true })),
  ];
  const texting = p.texting && !isSkipAnswer(p.texting);

  sheetBody.innerHTML = `
    <header class="pf-hero">
      <p class="pf-eyebrow">What other Fletchers see</p>
      <h2 class="pf-name">${escapeHTML(firstName(p))}</h2>
      ${meta.length ? `<p class="pf-meta">${meta.map(escapeHTML).join('<span aria-hidden="true"> · </span>')}</p>` : ''}
    </header>
    <section class="pf-photos" aria-label="Photos">
      <div class="pf-carousel"></div>
      <div class="pf-dots" aria-hidden="true"></div>
    </section>
    <section class="pf-intro">
      <div class="pf-intro__head">
        <div class="avatar avatar--xs">${cupidSVG()}</div>
        <span>How I’ll introduce you</span>
        ${editing === 'intro' ? '' : '<button class="btn-text" type="button" data-act="edit" data-key="intro">Edit</button>'}
      </div>
      ${
        editing === 'intro'
          ? `<label class="sr-only" for="edit-intro">Your intro</label><textarea class="pf-textarea" id="edit-intro" rows="5">${escapeHTML(intro)}</textarea>
             <div class="pf-edit-actions"><button class="btn-text" type="button" data-act="cancel">Cancel</button><button class="btn-small" type="button" data-act="save" data-key="intro">Save</button></div>`
          : `<p class="pf-intro__text">${escapeHTML(intro)}</p>${
              state.intro ? '<button class="btn-text pf-intro__reset" type="button" data-act="reset-intro">Use Fletcher’s version</button>' : ''
            }`
      }
    </section>
    <section class="pf-group">
      <h3 class="pf-group__title">About you</h3>
      <p class="pf-group__hint">Public things are fair game when I talk to other Fletchers. Private ones help me choose, but I never say them.</p>
      <ul class="pf-list">
        ${items.map(itemRow).join('')}
        ${
          texting
            ? `<li class="pf-row is-private"><div class="pf-row__main"><span class="pf-row__label">Texting style</span><span class="pf-row__value">Only used to help you practice dates</span></div><span class="pf-fixed">${ICONS.locked}Private</span></li>`
            : ''
        }
      </ul>
      <label class="sr-only" for="extra-input">Add something about you</label>
      <input class="tag-input tag-input--wide" id="extra-input" type="text" placeholder="Add something about you" enterkeyhint="done" />
    </section>
    <section class="pf-group">
      <h3 class="pf-group__title">Never bring up</h3>
      <p class="pf-group__hint">Optional. Topics I’ll avoid, no matter who asks.</p>
      <div class="pf-tags">
        ${topics
          .map(
            (t, i) =>
              `<span class="tag">${escapeHTML(t)}<button type="button" data-act="remove-topic" data-i="${i}" aria-label="Remove ${escapeHTML(t)}">${ICONS.x}</button></span>`,
          )
          .join('')}
        <label class="sr-only" for="topic-input">Add a topic</label>
        <input class="tag-input" id="topic-input" type="text" placeholder="${topics.length ? 'Add another' : 'Add a topic'}" enterkeyhint="done" />
      </div>
    </section>
    <p class="pf-safety">${ICONS.shield}<span>I never share your last name, phone number, socials, workplace, or where you live. You two swap those yourselves, once you both say yes.</span></p>`;

  renderCarousel();
  sheetBody.querySelector('.pf-carousel').scrollLeft = carouselScroll;

  sheetFoot.innerHTML =
    state.phase === 'ready'
      ? `<button class="cta__btn" type="button" data-act="send">Send off your Fletcher <span class="cta__heart">${pixelHeartSVG()}</span></button>
         <p class="sheet__note">Your answers are shared with the Fletcher team to improve the app. Photos stay on your device.</p>`
      : `<button class="cta__btn is-secondary" type="button" data-act="close">Done</button>`;

  sheet.scrollTop = scroll;
  if (editing) sheetBody.querySelector('textarea')?.focus({ preventScroll: true });
}

function openSheet() {
  editing = null;
  renderSheet();
  sheet.classList.remove('is-closing');
  sheet.hidden = false;
  sheet.scrollTop = 0;
  $('#sheet-close').focus({ preventScroll: true });
}

function closeSheet() {
  if (sheet.hidden) return Promise.resolve();
  sheet.classList.add('is-closing');
  return new Promise((resolve) =>
    setTimeout(() => {
      sheet.hidden = true;
      sheet.classList.remove('is-closing');
      resolve();
    }, reduceMotion ? 0 : 280),
  );
}

function afterProfileChange() {
  save();
  renderSheet();
  refreshReviewCards();
}

async function onSheetClick(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const { act, key } = btn.dataset;
  if (act === 'toggle') {
    state.visibility[key] = !isShared(key);
    afterProfileChange();
    sheetBody.querySelector(`[data-act="toggle"][data-key="${CSS.escape(key)}"]`)?.focus({ preventScroll: true });
  } else if (act === 'edit') {
    editing = key;
    renderSheet();
  } else if (act === 'cancel') {
    editing = null;
    renderSheet();
  } else if (act === 'save') {
    const value = sheetBody.querySelector('textarea').value.trim();
    if (key === 'intro') state.intro = value && value !== introFor(state.profile, isShared) ? value : null;
    else if (key.startsWith('extra:')) {
      const item = extras().find((x) => `extra:${x.id}` === key);
      if (item && value) item.text = value;
    } else if (value) state.profile[key] = value;
    editing = null;
    afterProfileChange();
  } else if (act === 'reset-intro') {
    state.intro = null;
    afterProfileChange();
  } else if (act === 'remove-extra') {
    state.profile.extras = extras().filter((x) => `extra:${x.id}` !== key);
    delete state.visibility[key];
    editing = null;
    afterProfileChange();
  } else if (act === 'remove-topic') {
    state.profile.offLimits.splice(Number(btn.dataset.i), 1);
    afterProfileChange();
  } else if (act === 'remove-photo') {
    const id = btn.dataset.id;
    state.photos = state.photos.filter((p) => p.id !== id);
    delete state.visibility[`photo:${id}`];
    await deletePhoto(id);
    afterProfileChange();
    renderAll();
  } else if (act === 'replace-face') {
    sheetFile.click();
  } else if (act === 'send') {
    await closeSheet();
    sendOff();
  } else if (act === 'close') {
    closeSheet();
  }
}

sheetBody.addEventListener('click', onSheetClick);
sheetFoot.addEventListener('click', onSheetClick);
$('#sheet-close').addEventListener('click', closeSheet);

sheetBody.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.isComposing) return;
  if (e.target.id === 'extra-input') {
    e.preventDefault();
    const text = e.target.value.trim();
    if (!text) return;
    const item = { id: newId(), text };
    state.profile.extras = [...extras(), item];
    state.visibility[`extra:${item.id}`] = true; // added on purpose, so public by default
    afterProfileChange();
    sheetBody.querySelector('#extra-input')?.focus({ preventScroll: true });
    return;
  }
  if (e.target.id !== 'topic-input') return;
  e.preventDefault();
  const added = parseTopics(e.target.value);
  const current = state.profile.offLimits || [];
  const seen = new Set(current.map((t) => t.toLowerCase()));
  state.profile.offLimits = [...current, ...added.filter((t) => !seen.has(t.toLowerCase()))];
  afterProfileChange();
  sheetBody.querySelector('#topic-input')?.focus({ preventScroll: true });
});

sheetFile.addEventListener('change', async () => {
  const file = sheetFile.files[0];
  sheetFile.value = '';
  if (!file) return;
  try {
    const blob = await processPhoto(file);
    let face = facePhoto();
    if (!face) {
      face = { id: 'p' + newId(), prompt: null };
      state.photos.unshift(face);
    }
    await deletePhoto(face.id); // drops the cached URL so the new image shows
    await putPhoto(face.id, blob);
    afterProfileChange();
    renderAll();
  } catch {
    // Unreadable file: keep the current photo.
  }
});

/* ---------- scripted demo: Fletcher meets Fletcher ---------- */

const demo = $('#demo');
const demoBody = $('#demo-body');
const demoFoot = $('#demo-foot');
let demoRun = 0;
let demoSkip = false;

const TAGS = {
  shared: { icon: () => ICONS.open, text: 'Shared' },
  private: { icon: () => ICONS.locked, text: 'Kept private' },
  off: { icon: () => ICONS.x, text: 'Never bring up' },
};

const demoWait = (ms) => (demoSkip ? Promise.resolve() : wait(ms));

function demoScrollToEnd() {
  demo.scrollTo({ top: demo.scrollHeight, behavior: demoSkip || reduceMotion ? 'auto' : 'smooth' });
}

/** Append one line to a demo conversation; `who` labels the first bubble of each run. */
function demoLine(container, { side, who, text, tags = [] }) {
  const last = container.querySelector(':scope > .msg:last-of-type');
  const sameSide = last?.classList.contains(side === 'right' ? 'msg--me' : 'msg--bot');
  if (!sameSide) container.insertAdjacentHTML('beforeend', `<div class="demo-who demo-who--${side}">${escapeHTML(who)}</div>`);
  const el = document.createElement('div');
  el.className = `msg ${side === 'right' ? 'msg--me' : 'msg--bot'}${demoSkip || reduceMotion ? '' : ' msg--enter'}`;
  el.innerHTML = `<div class="bubble">${escapeHTML(text)}</div>`;
  container.appendChild(el);
  if (tags.length) {
    container.insertAdjacentHTML(
      'beforeend',
      `<div class="demo-tags demo-tags--${side}">${tags
        .map((t) => `<span class="demo-tag demo-tag--${t.kind}">${TAGS[t.kind].icon()}${TAGS[t.kind].text}: ${escapeHTML(t.label)}</span>`)
        .join('')}</div>`,
    );
  }
}

async function demoTyping(container, side, ms) {
  if (demoSkip) return;
  const t = document.createElement('div');
  t.className = `msg ${side === 'right' ? 'msg--me' : 'msg--bot'} msg--typing`;
  t.innerHTML = '<div class="bubble"><span></span><span></span><span></span></div>';
  container.appendChild(t);
  demoScrollToEnd();
  await demoWait(ms);
  t.remove();
}

async function openDemo() {
  const run = ++demoRun;
  demoSkip = false;
  const d = buildDemo(state.profile, isShared);
  const theirs = `${d.match}’s Fletcher`;

  demoBody.innerHTML = `
    <p class="demo__banner">${ICONS.info}<span>Demo with a made-up person. Real matching isn’t live yet.</span></p>
    <div class="demo__pair">
      <div class="demo__agent"><div class="avatar avatar--sm">${cupidSVG()}</div><span>Your Fletcher</span></div>
      <span class="demo__heart">${pixelHeartSVG()}</span>
      <div class="demo__agent"><div class="avatar avatar--sm avatar--alt">${cupidSVG()}</div><span>${escapeHTML(theirs)}</span></div>
    </div>
    <div class="demo__chat" id="demo-chat"></div>
    <div id="demo-after" hidden>
      <section class="demo__verdict">
        <p class="pf-eyebrow">Fletcher’s take</p>
        <p>Looks promising! In the real app, you’d see ${escapeHTML(d.match)}’s profile next. You’re only introduced if you both say yes.</p>
      </section>
      <section class="demo__ask">
        <h3 class="pf-group__title">Ask ${escapeHTML(theirs)}</h3>
        <p class="pf-group__hint">Get answers before you ever talk.</p>
        <div class="demo__qa" id="demo-qa"></div>
        <div class="demo__questions" id="demo-questions"></div>
      </section>
    </div>`;
  demoFoot.innerHTML = '<button class="cta__btn is-secondary" type="button" data-act="skip">Skip to the end</button>';

  demo.classList.remove('is-closing');
  demo.hidden = false;
  demo.scrollTop = 0;
  $('#demo-close').focus({ preventScroll: true });

  if (!state.demoSeen) {
    state.demoSeen = true;
    save();
    queueSubmission({ type: 'demo', comment: 'Watched the Fletcher-to-Fletcher demo' });
  }

  const chat = $('#demo-chat');
  await demoWait(500);
  for (const line of d.script) {
    if (run !== demoRun) return;
    const side = line.from === 'you' ? 'right' : 'left';
    await demoTyping(chat, side, Math.min(1500, 500 + line.text.length * 12));
    if (run !== demoRun) return;
    demoLine(chat, { side, who: side === 'right' ? 'Your Fletcher' : theirs, text: line.text, tags: line.tags });
    demoScrollToEnd();
    await demoWait(350);
  }
  if (run !== demoRun) return;

  // The conversation is over: show the verdict and the questions to ask.
  $('#demo-after').hidden = false;
  demoFoot.innerHTML = '<button class="cta__btn" type="button" data-act="close-demo">Back to chat</button>';
  const qa = $('#demo-qa');
  const box = $('#demo-questions');
  d.questions.forEach((item) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = item.q;
    b.addEventListener('click', async () => {
      b.remove();
      box.querySelectorAll('button').forEach((x) => (x.disabled = true));
      demoSkip = false;
      demoLine(qa, { side: 'right', who: 'You', text: item.q });
      demoScrollToEnd();
      await demoTyping(qa, 'left', 900);
      if (run !== demoRun) return;
      demoLine(qa, { side: 'left', who: theirs, text: item.a, tags: item.tags });
      box.querySelectorAll('button').forEach((x) => (x.disabled = false));
      demoScrollToEnd();
    });
    box.appendChild(b);
  });
  demoScrollToEnd();
}

function closeDemo() {
  if (demo.hidden) return;
  demoRun += 1;
  demo.classList.add('is-closing');
  setTimeout(() => {
    demo.hidden = true;
    demo.classList.remove('is-closing');
  }, reduceMotion ? 0 : 280);
}

demoFoot.addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'skip') demoSkip = true;
  if (act === 'close-demo') closeDemo();
});
$('#demo-close').addEventListener('click', closeDemo);
$('#demo-btn').addEventListener('click', () => {
  setMenu(false);
  openDemo();
});

/* ---------- composer ---------- */

function autosize() {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 132) + 'px';
}

input.addEventListener('input', () => {
  autosize();
  sendBtn.disabled = !input.value.trim() || busy;
});

input.addEventListener('keydown', (e) => {
  // Enter sends; Shift+Enter adds a line (handy when pasting texting examples).
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    submit(input.value);
  }
});

// Pasting an image works too, when Fletcher is waiting for one.
input.addEventListener('paste', (e) => {
  const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith('image/'));
  if (file && wantsPhoto()) {
    e.preventDefault();
    submitPhoto(file);
  }
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  submit(input.value);
});

attachBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  fileInput.value = '';
  submitPhoto(file);
});

/* ---------- menu ---------- */

const menuBtn = $('#menu-btn');
const menu = $('#menu');
const setMenu = (open) => {
  menu.hidden = !open;
  menuBtn.setAttribute('aria-expanded', String(open));
};
menuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  setMenu(menu.hidden);
});
document.addEventListener('click', () => setMenu(false));
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  setMenu(false);
  if (!demo.hidden) closeDemo();
  else if (editing) {
    editing = null;
    renderSheet();
  } else closeSheet();
});

$('#profile-btn').addEventListener('click', () => {
  setMenu(false);
  openSheet();
});

// Two taps to start over, so nobody wipes their answers by accident.
const restartBtn = $('#restart-btn');
let restartArmed = false;
const disarmRestart = () => {
  restartArmed = false;
  restartBtn.textContent = 'Start over';
  restartBtn.classList.remove('is-armed');
};
menuBtn.addEventListener('click', disarmRestart);

restartBtn.addEventListener('click', async (e) => {
  if (!restartArmed) {
    e.stopPropagation();
    restartArmed = true;
    restartBtn.textContent = 'Tap again to confirm';
    restartBtn.classList.add('is-armed');
    return;
  }
  setMenu(false);
  disarmRestart();
  runId += 1;
  busy = false;
  await closeSheet();
  await clearPhotos();
  state = freshState();
  save();
  renderAll();
  askCurrent();
});

/* ---------- boot ---------- */

document.querySelectorAll('[data-cupid]').forEach((el) => (el.innerHTML = cupidSVG()));
renderAll();
save(); // persists the anonymous id for older saved sessions
flushOutbox();
window.addEventListener('online', flushOutbox);
// Resume wherever we left off: if a question wasn't fully delivered, ask it again.
if (state.phase === 'onboarding' && !state.asked) askCurrent();
