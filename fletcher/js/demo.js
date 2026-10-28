// A scripted preview of Fletcher-to-Fletcher matching. The other person is
// made up, and the user's side is built only from what they marked Public,
// so the demo shows the privacy rules in action.

import { firstName, sentence, lookingLine, modeFor, isSkipAnswer } from './flow.js';

const MATCH = 'Jordan';

/**
 * @param p profile
 * @param shared (key) => boolean, the user's Public/Private choices
 * @returns {{ match: string, mode: string, script: object[], questions: object[] }}
 * Script lines are { from: 'them' | 'you', text, tags? }, where tags are
 * { kind: 'shared' | 'private' | 'off', label }.
 */
export function buildDemo(p, shared) {
  const me = firstName(p);
  const mode = modeFor(p);
  const school = p.school || 'Harvard';
  const script = [];
  const them = (text) => script.push({ from: 'them', text });
  const you = (text, tags = []) => script.push({ from: 'you', text, tags });

  // Intros
  them(`Hi! I’m ${MATCH}’s Fletcher. ${MATCH} is a junior at ${school} who loves climbing and terrible karaoke.`);
  const where = [shared('school') && p.school && `at ${p.school}`, shared('hometown') && p.hometown && `from ${p.hometown}`].filter(Boolean);
  you(
    `Hi! I’m ${me}’s Fletcher.${where.length ? ` ${me} is ${where.join(', originally ')}.` : ' Excited to meet you!'}`,
    [
      ...(shared('school') && p.school ? [{ kind: 'shared', label: 'School' }] : []),
      ...(shared('hometown') && p.hometown ? [{ kind: 'shared', label: 'From' }] : []),
    ],
  );

  // Saturdays
  them(`What does ${me} do on a free Saturday?`);
  if (shared('hobbies') && p.hobbies) you(`${me}’s ideal Saturday: ${sentence(p.hobbies)}. What about ${MATCH}?`, [{ kind: 'shared', label: 'Off duty' }]);
  else you(`${me} would rather tell ${MATCH} that one in person. What about ${MATCH}?`, [{ kind: 'private', label: 'Off duty' }]);
  them(`Climbing in the morning, then way too much dim sum. ${MATCH} is big on people who make plans and actually show up.`);

  // Green flags
  if (shared('greenFlags') && p.greenFlags) you(`Love that. ${me}’s green flags: ${sentence(p.greenFlags)}.`, [{ kind: 'shared', label: 'Green flags' }]);
  else you('Love that. Reliability matters.', []);

  // Dealbreakers: the privacy moment
  them(`Any dealbreakers I should know about?`);
  if (shared('dealbreakers') && p.dealbreakers && !isSkipAnswer(p.dealbreakers))
    you(`Honestly? ${me} isn’t into ${sentence(p.dealbreakers)}.`, [{ kind: 'shared', label: 'Dealbreakers' }]);
  else if (p.dealbreakers) you(`That’s something ${me} would rather share personally.`, [{ kind: 'private', label: 'Dealbreakers' }]);
  else you(`None that I know of. ${me} is pretty open.`);

  // What they're looking for
  them(`Fair! What is ${me} looking for right now?`);
  if (shared('lookingFor') && p.lookingFor) {
    const line = lookingLine(p.lookingFor);
    you(`${me} is ${line[0].toLowerCase()}${line.slice(1)}`, [{ kind: 'shared', label: 'Looking for' }]);
  } else you(`I’ll let ${me} tell ${MATCH} that.`, [{ kind: 'private', label: 'Looking for' }]);
  them(mode === 'friends' ? `Same here. ${MATCH} just wants good people to explore with.` : `Same here. ${MATCH} wants something real, but there’s no rush.`);

  // Anything extra they chose to share
  const extra = (p.extras || []).find((x) => typeof x === 'object' && shared(`extra:${x.id}`));
  const also = extra?.text || (shared('anythingElse') && p.anythingElse && !isSkipAnswer(p.anythingElse) ? p.anythingElse : '');
  if (also) {
    them('Anything else I should know?');
    you(`${me} wanted me to mention: ${sentence(also)}.`, [{ kind: 'shared', label: extra ? 'Added by you' : 'Also' }]);
  }

  // Never bring up
  const topic = (p.offLimits || [])[0];
  if (topic) {
    them(`Can I ask about ${topic.toLowerCase().replace(/^my\b/, `${me}’s`)}?`);
    you('That’s a topic I don’t bring up. Next question!', [{ kind: 'off', label: topic }]);
  }

  them(mode === 'friends' ? `I think these two would really get along.` : `I think these two would really hit it off.`);
  you(`Agreed. I’ll tell ${me}.`);

  const questions = [
    {
      q: mode === 'friends' ? `What’s ${MATCH}’s idea of a perfect hangout?` : `What would ${MATCH}’s perfect first date be?`,
      a: `A climbing gym, then dumplings, then a long walk if it’s going well.`,
    },
    { q: `Is ${MATCH} more of a texter or a caller?`, a: 'Texter, but a good one. Same-day replies, every time.' },
    { q: `What are ${MATCH}’s dealbreakers?`, a: `That’s something ${MATCH} would rather tell you directly.`, tags: [{ kind: 'private', label: 'Dealbreakers' }] },
    { q: `What does ${MATCH} do for work?`, a: `${MATCH} keeps that private until you two match.`, tags: [{ kind: 'private', label: 'Workplace' }] },
  ];

  return { match: MATCH, mode, script, questions };
}
