// Fletcher's onboarding script. Each step asks one thing, then reacts in a few
// words. Reactions are hand-written and keyword-aware, so the conversation
// feels personal without pretending a live model is behind it.

const has = (text, ...words) => words.some((w) => new RegExp(`\\b${w}`, 'i').test(text));

// Stable "random" so a reload never changes what Fletcher already said.
const pick = (options, seed = '') => {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return options[h % options.length];
};

/** First name only, for addressing the user directly. */
const first = (p) => (p.name || '').split(' ')[0];

const titleCase = (s) => s.replace(/\b\p{L}/gu, (c) => c.toUpperCase());

export function parseName(raw) {
  const cleaned = raw
    .trim()
    .replace(/^(hi|hey|hello|yo)[,!.\s]+/i, '')
    .replace(/^(my name is|my name's|name's|i am|i'm|im|it's|its|call me|this is)\s+/i, '')
    .replace(/[.!?,]+$/, '')
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean).slice(0, 2);
  if (!words.length || words[0].length > 24) return '';
  return titleCase(words.join(' ').toLowerCase());
}

const isSkip = (t) =>
  /^(skip|skip for now|skip photos|no|nope|nah|nothing|none|n\/a|that's everything|thats everything|that's it|i'm good|im good)\.?!?$/i.test(
    t.trim().replace(/[’‘]/g, "'"),
  );

export const SKIP = 'Skip for now';

export const STEPS = [
  {
    key: 'name',
    placeholder: 'Your name',
    ask: () => [
      "Hi! I'm your Fletcher! Excited to meet you!!!",
      'Quick version: I get to know you, then I talk to other people’s Fletchers to find your matches.',
      "Tell me about yourself! First, what's your name?",
    ],
    parse: parseName,
    retry: () => ['Didn’t catch that. What’s your name?'],
    react: (name) => {
      const n = name.split(' ')[0];
      return [pick([`${n}! Love it.`, `${n}! Great name.`, `Hi, ${n}!`], name)];
    },
  },
  {
    key: 'school',
    placeholder: 'Your school',
    ask: () => ['Where do you go to school?'],
    react: (school) => {
      if (has(school, 'harvard', 'yale', 'princeton', 'stanford', 'mit\\b', 'columbia', 'penn', 'brown', 'dartmouth', 'cornell'))
        return [`${school}. Fancy.`];
      if (has(school, 'graduat', 'not in school', 'finished', 'work', 'none', 'dropped')) return ['Real world. Respect.'];
      return [pick([`${school}, nice!`, `${school}! Noted.`], school)];
    },
  },
  {
    key: 'hometown',
    placeholder: 'Your hometown',
    ask: () => ['Where’s home?'],
    react: (town) => [pick([`${town}! Noted.`, `Ooh, ${town}.`], town)],
  },
  {
    key: 'lookingFor',
    placeholder: 'What you’re looking for',
    ask: () => ['What are you looking for right now?'],
    chips: ['Something serious', 'Seeing where it goes', 'Something casual', 'New friends', 'Not sure yet'],
    react: (a) => {
      if (has(a, 'friend')) return ['New friends! Love that.'];
      if (has(a, 'serious', 'relationship', 'long', 'partner', 'marri', 'commit', 'person', 'the one')) return ['Something real. Love that.'];
      if (has(a, 'casual', 'fun', 'nothing serious', 'hook')) return ['Keeping it light. Got it.'];
      if (has(a, 'not sure', 'unsure', 'idk', "don't know", 'dont know', 'no idea')) return ['Totally fine. We’ll figure it out.'];
      if (has(a, 'see', 'open', 'flow', 'whatever', 'depends')) return ['Open-minded. Love it.'];
      return ['Got it.'];
    },
  },
  {
    key: 'type',
    placeholder: 'Your type',
    ask: () => ['Do you have a type?'],
    react: (a) => {
      if (has(a, 'no type', "don't have", 'dont have', 'not really') || /^no\b/i.test(a.trim())) return ['No type? I can work with that.'];
      if (has(a, 'tall')) return ['Tall. Of course.'];
      if (has(a, 'funny', 'humor', 'humour', 'laugh')) return ['Funny. Great call.'];
      if (has(a, 'smart', 'nerd', 'intellig', 'curious')) return ['Smart. Noted.'];
      if (has(a, 'kind(ness)?\\b', 'nice', 'sweet', 'gentle')) return ['Kind. The best type.'];
      if (has(a, 'ambitious', 'driven', 'motivated')) return ['Ambitious. Got it.'];
      return ['Specific. I like it.'];
    },
  },
  {
    key: 'greenFlags',
    placeholder: 'Your green flags',
    ask: () => ['Green flags? What wins you over?'],
    react: (a) => [
      has(a, 'kind(ness)?\\b', 'nice to', 'waiter', 'server')
        ? 'Kind to waiters. Classic.'
        : has(a, 'text', 'communic', 'reply', 'respond')
          ? 'A good texter. Rare!'
          : has(a, 'listen', 'remember')
            ? 'A good listener. Love that.'
            : 'Love that.',
    ],
  },
  {
    key: 'dealbreakers',
    placeholder: 'Your dealbreakers',
    ask: () => ['Any dealbreakers?'],
    react: (a) =>
      isSkip(a) || has(a, 'no dealbreakers', 'none', 'nothing really')
        ? ['No dealbreakers? Bold.']
        : ['Noted. I’ll filter those out.'],
  },
  {
    key: 'hobbies',
    placeholder: 'What you do for fun',
    ask: () => ['What do you do for fun?'],
    react: (a) => {
      if (has(a, 'run(s|ning)?\\b', 'marathon', 'jog')) return ['A runner! Love it.'];
      if (has(a, 'read(ing)?\\b', 'book')) return ['A reader. Love it.'];
      if (has(a, 'cook', 'bak', 'kitchen')) return ['You cook?? Huge.'];
      if (has(a, 'music', 'guitar', 'piano', 'sing(ing)?\\b', 'concert', 'band')) return ['Musical. Dangerous.'];
      if (has(a, 'hik', 'outdoor', 'climb', 'camp', 'ski(ing)?\\b')) return ['Outdoorsy. Love it.'];
      if (has(a, 'gym', 'lift', 'workout', 'work out', 'yoga', 'pilates')) return ['Disciplined. Respect.'];
      if (has(a, 'game', 'gaming')) return ['A gamer. Nice.'];
      if (has(a, 'art(s|ist)?\\b', 'paint', 'draw', 'photo', 'film', 'write')) return ['Creative. Love that.'];
      return ['Love that.'];
    },
  },
  {
    key: 'anythingElse',
    placeholder: 'Anything else',
    ask: () => ['Anything else I should know?'],
    chips: ['That’s everything'],
    react: (a) => (isSkip(a) ? ['All good.'] : ['Noted!']),
  },
  {
    key: 'face',
    input: 'photo',
    placeholder: 'Add a photo of you',
    ask: () => ['Photo time! Send one clear photo of you.'],
    chips: [SKIP],
    react: () => ['There you are!'],
    skipped: () => ['No problem. You can add one later from your profile.'],
  },
  {
    key: 'prompts',
    input: 'prompts',
    placeholder: 'Pick a prompt, then add a photo',
    ask: () => ['Now a few fun ones. Pick a prompt and send a photo for it.'],
    react: (photos) => [photos.length >= MAX_PROMPT_PHOTOS ? 'Full gallery! Moving on.' : 'Great gallery.'],
    skipped: () => ['No problem.'],
  },
  {
    key: 'texting',
    placeholder: 'Paste a few texts, or skip',
    multiline: true,
    ask: () => [
      'When I find someone, you can ask their Fletcher anything. I can also help you practice the first date.',
      'For that, paste a few texts you’ve sent. Totally optional.',
    ],
    chips: [SKIP],
    react: (a) => {
      if (isSkip(a)) return ['No problem.'];
      if (a === a.toLowerCase() && /[a-z]/.test(a)) return ['All lowercase. Cool.'];
      if ((a.match(/!/g) || []).length >= 3) return ['The exclamation points!! Love it.'];
      if (/\p{Extended_Pictographic}/u.test(a)) return ['An emoji texter. Love it.'];
      return ['Got it. Very you.'];
    },
  },
];

/* ---------- photo prompts ---------- */

export const MIN_PROMPT_PHOTOS = 2;
export const MAX_PROMPT_PHOTOS = 4;

export const PHOTO_PROMPTS = [
  { id: 'happy', label: 'My happy place', ask: 'Show me!', react: 'Gorgeous.' },
  { id: 'made', label: 'Something I made', ask: 'Let’s see it.', react: 'Impressive!' },
  { id: 'household', label: 'The most important member of my household', ask: 'Introduce me!', react: 'Iconic.' },
  { id: 'friends', label: 'A photo my friends would pick of me', ask: 'Go for it.', react: 'Your friends have taste.' },
  { id: 'saturday', label: 'My ideal Saturday', ask: 'Show me.', react: 'Perfect.' },
  { id: 'laugh', label: 'The last thing that made me laugh', ask: 'Screenshots count.', react: 'Ha! Love it.' },
  { id: 'cameraRoll', label: 'Something only I’d have in my camera roll', ask: 'The weird one. Go.', react: 'Perfectly weird.' },
];

export const promptById = (id) => PHOTO_PROMPTS.find((p) => p.id === id);

/** What Fletcher says after each prompt photo, given how many there are now. */
export const afterPromptPhoto = (count) => (count < MIN_PROMPT_PHOTOS ? ['One more!'] : ['Another, or done?']);

export const DONE_WITH_PHOTOS = 'Done with photos';
export const SKIP_PHOTOS = 'Skip photos';

/* ---------- off-limits topics (set on the profile screen) ---------- */

export function parseTopics(raw) {
  return raw
    .split(/[,;\n/]|\band\b/i)
    .map((x) => x.trim().replace(/[.!]+$/, ''))
    .filter((x) => x && x.length <= 40)
    .slice(0, 8)
    .map((x) => x[0].toUpperCase() + x.slice(1));
}

export const isSkipAnswer = isSkip;

/** What Fletcher says once the interview is done, before the profile review. */
export const wrapUp = (p) => [`All done, ${first(p)}!`, 'Last step: choose what I can share. Anything you lock stays private.'];

/** After the send-off. Honest about what does and doesn't exist yet. */
export const afterSendOff = () => [
  'Off I go!',
  'Heads up: matching isn’t live yet. You’re early! I’ve saved everything and I’ll start the moment it opens.',
  'Want a sneak peek? Here’s how I’ll talk to other Fletchers.',
  { type: 'demo' },
  'Quick favor: how was this, 1 to 5?',
];

/** Feedback after the send-off: a 1–5 rating, then one suggestion. */
export const FEEDBACK = {
  ratings: ['1', '2', '3', '4', '5'],
  retryRating: 'Just a number, 1 to 5.',
  afterRating: (n) => [n >= 4 ? 'Yay! Thank you.' : 'Thanks for being honest.', 'What’s one thing I should do better?'],
  noIdeas: 'Nothing, it’s great',
  done: ['Noted. Thank you!', 'Text me anytime with more.'],
};

/** "dating" or "friends", from what the user is looking for. */
export const modeFor = (p) => (p.lookingFor && has(p.lookingFor, 'friend') ? 'friends' : 'dating');

export const followUpReplies = ['Noted!', 'Got it.', 'Saved.', 'Good to know.'];

/* ---------- what Fletcher may share ---------- */

/** Profile fields shown on the review screen. `share` is the default pile. */
export const FIELDS = [
  { key: 'school', label: 'School', share: true },
  { key: 'hometown', label: 'From', share: true },
  { key: 'lookingFor', label: 'Looking for', share: true },
  { key: 'hobbies', label: 'Off duty', share: true },
  { key: 'greenFlags', label: 'Green flags', share: true },
  { key: 'type', label: 'My type', share: false },
  { key: 'dealbreakers', label: 'Dealbreakers', share: false },
  { key: 'anythingElse', label: 'Also', share: false },
];

export const firstName = first;

export const sentence = (s) => {
  const t = s.trim().replace(/[.!?…]+$/, '');
  return t ? t[0].toLowerCase() + t.slice(1) : t;
};

export function lookingLine(a) {
  if (has(a, 'friend')) return 'Here to make new friends.';
  if (has(a, 'serious', 'relationship', 'long', 'partner', 'marri', 'commit', 'the one')) return 'Looking for something real.';
  if (has(a, 'casual', 'fun', 'nothing serious', 'hook')) return 'Keeping things light for now.';
  if (has(a, 'not sure', 'unsure', 'idk', "don't know", 'dont know', 'no idea')) return 'Still figuring out what they want, and honest about it.';
  if (has(a, 'see', 'open', 'flow', 'whatever', 'depends')) return 'Open to seeing where things go.';
  return `Looking for ${sentence(a)}.`;
}

/** Fletcher's intro, built only from what the user chose to share. */
export function introFor(p, shared) {
  const parts = [`Meet ${first(p)}.`];
  const school = shared('school') && p.school;
  const town = shared('hometown') && p.hometown;
  if (school && town) parts.push(`${school}, by way of ${town}.`);
  else if (school) parts.push(`${school}.`);
  else if (town) parts.push(`Originally from ${town}.`);
  if (shared('lookingFor') && p.lookingFor) parts.push(lookingLine(p.lookingFor));
  if (shared('hobbies') && p.hobbies) parts.push(`On a free Saturday: ${sentence(p.hobbies)}.`);
  if (shared('greenFlags') && p.greenFlags) parts.push(`Green flags: ${sentence(p.greenFlags)}.`);
  if (shared('type') && p.type) parts.push(`Their type: ${sentence(p.type)}.`);
  if (shared('dealbreakers') && p.dealbreakers) parts.push(`Not for them: ${sentence(p.dealbreakers)}.`);
  const also = (p.extras || [])
    .filter((x) => typeof x === 'object' && shared(`extra:${x.id}`))
    .map((x) => sentence(x.text));
  if (shared('anythingElse') && p.anythingElse && !isSkip(p.anythingElse)) also.unshift(sentence(p.anythingElse));
  if (also.length) parts.push(`Also: ${also.join('; ')}.`);
  return parts.join(' ');
}
