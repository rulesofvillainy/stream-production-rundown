// generate-production.js
// Run with: node generate-production.js
// Outputs: rov-championship-day1.json

const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

const PROD_ID = 'PLACEHOLDER'; // gets replaced on import

// ── Helpers ──────────────────────────────────────────────────────────────────
function event(title, type, obsScene, duration, notes, typeData) {
  return {
    id: uuidv4(), productionId: PROD_ID,
    objectType: 'event', title, type,
    estimatedDuration: duration,
    notes: notes || '',
    status: 'pending',
    obsScene: obsScene || '',
    typeData: typeData || {},
    tasks: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}
function taskList(title, tasks, notes) {
  return {
    id: uuidv4(), productionId: PROD_ID,
    objectType: 'taskList', title,
    estimatedDuration: 5,
    notes: notes || '',
    status: 'pending',
    type: 'custom', obsScene: 'GraphicsDisplay',
    typeData: {},
    tasks: tasks.map(t => ({ id: uuidv4(), text: t, complete: false })),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

const casterPairs = [
  { castera: 'Andy', casterb: 'Vince' },
  { castera: 'Brando', casterb: 'Zero' },
  { castera: 'Andy', casterb: 'Avery' },
  { castera: 'Vince', casterb: 'Courtney' },
];

const tableACasters = [
  { gpcastera: 'Brando', gpcasterb: 'Zero' },
  { gpcastera: 'Andy', gpcasterb: 'Avery' },
  { gpcastera: 'Vince', gpcasterb: 'Courtney' },
  { gpcastera: 'Brando', gpcasterb: 'Kirsten' },
];
const tableBCasters = [
  { gpcastera: 'Andy', gpcasterb: 'Courtney' },
  { gpcastera: 'Vince', gpcasterb: 'Zero' },
  { gpcastera: 'Brando', gpcasterb: 'Avery' },
  { gpcastera: 'Kirsten', gpcasterb: 'Andy' },
];

const interviewers = ['Avery', 'Courtney', 'Kirsten', 'Brad', 'Avery', 'Courtney', 'Kirsten', 'Brad'];

// ── Timeline builder ─────────────────────────────────────────────────────────
const timeline = [];

// ── INTRO ────────────────────────────────────────────────────────────────────
timeline.push(event(
  'Starting Soon', 'starting-soon', 'StartingSoon', 30,
  'Hold on Starting Soon screen until casters are ready.',
  {}
));

timeline.push(event(
  'Caster Intro', 'casters', 'CasterLocalRemote2', 8,
  'Casters introduce themselves, welcome the audience, and overview the day.',
  casterPairs[0]
));

timeline.push(event(
  'In-Person Intro — MC Welcome', 'live-video', 'CasterLocal', 6,
  'Cut to floor camera. MC welcomes players, explains rules, and kicks off Round 1.',
  { camSource: 'Floor Cam' }
));

timeline.push(event(
  'Caster Talk — Player Meeting Wrap', 'casters', 'CasterLocalRemote2', 5,
  'Casters recap the player meeting and preview Round 1 matchups while players find their seats.',
  casterPairs[0]
));

// ── ROUNDS 1–8 ───────────────────────────────────────────────────────────────
const roundNotes = [
  'First round of Swiss — 64 players.',
  'Second round of Swiss — 64 players.',
  'Third round — field thinning out.',
  'Fourth round — mid-day intensity.',
  'Fifth round — elimination pressure building.',
  'Sixth round — cosplay contest follows this round!',
  'Seventh round — playoff bubble.',
  'Final Swiss round — standings finalize for Top Cut.',
];

for (let r = 1; r <= 8; r++) {
  const pair = casterPairs[(r - 1) % casterPairs.length];
  const acasters = tableACasters[(r - 1) % tableACasters.length];
  const bcasters = tableBCasters[(r - 1) % tableBCasters.length];
  const interviewer = interviewers[r - 1];

  // Pre-round caster talk
  timeline.push(event(
    `Caster Talk — Pre Round ${r}`, 'casters',
    r <= 2 ? 'CasterLocalRemote2' : r <= 4 ? 'CasterLocalRemote3' : 'CasterRemote2',
    6, `Casters preview Round ${r} matchups and discuss the current standings. ${roundNotes[r - 1]}`,
    pair
  ));

  // Round setup task list
  timeline.push(taskList(
    `Round ${r} Setup`,
    [
      `Confirm Round ${r} pairings are published`,
      `Set stream tables — Table A and Table B`,
      `Camera operators confirm table positions`,
      'Graphics team load round number overlay',
      'Score trackers reset and ready',
      'Confirm player names for ticker',
    ],
    `Complete all tasks before cutting to Table A gameplay for Round ${r}.`
  ));

  // Table A gameplay
  timeline.push(event(
    `Gameplay — Round ${r} Table A`, 'gameplay', 'Gameplay A', 60,
    `Stream Table A for Round ${r}. ~60 min game time. Watch for notable plays and call outs.`,
    { round: String(r), table: 'A', ...acasters }
  ));

  // After Table A caster talk
  timeline.push(event(
    `Caster Talk — Round ${r} Table A Result`, 'casters',
    r <= 3 ? 'CasterLocalRemote2' : 'CasterRemote3',
    4, `Recap Table A result, highlight key moments, and tease the Table A winner interview.`,
    pair
  ));

  // Table A winner interview
  timeline.push(event(
    `Interview — Round ${r} Table A Winner`, 'interview', 'Interview', 5,
    `Quick winner interview at the table. Ask about key turn and next round thoughts.`,
    { player: 'TBD', interviewer, ivRound: String(r) }
  ));

  // Pre Table B caster talk
  timeline.push(event(
    `Caster Talk — Pre Round ${r} Table B`, 'casters',
    'CasterLocalRemote2',
    4, `Transition from Table A to Table B. Casters preview the Table B matchup.`,
    pair
  ));

  // Table B gameplay
  timeline.push(event(
    `Gameplay — Round ${r} Table B`, 'gameplay', 'Gameplay B', 60,
    `Stream Table B for Round ${r}. Parallel game to Table A — may start or end at different times.`,
    { round: String(r), table: 'B', ...bcasters }
  ));

  // After Table B caster talk
  timeline.push(event(
    `Caster Talk — Round ${r} Table B Result`, 'casters',
    'CasterRemote2',
    4, `Recap Table B result, compare to Table A, discuss overall round picture.`,
    pair
  ));

  // Table B winner interview
  timeline.push(event(
    `Interview — Round ${r} Table B Winner`, 'interview', 'Interview', 5,
    `Table B winner interview. Ask deck choice and what they're playing next round.`,
    { player: 'TBD', interviewer, ivRound: String(r) }
  ));

  // Post-round caster transition talk
  timeline.push(event(
    `Caster Talk — Round ${r} Recap`, 'casters',
    r <= 4 ? 'CasterLocalRemote2' : 'CasterRemote2',
    5, `Full round recap. standings update, player storylines, and filler content as needed.`,
    pair
  ));

  // After Round 6 — Cosplay Contest
  if (r === 6) {
    timeline.push(taskList(
      'Cosplay Contest Setup',
      [
        'Confirm cosplay contestant list with judges',
        'Stage area clear for contestants',
        'MC briefed on order and judging criteria',
        'Camera set to floor/stage view',
      ]
    ));
    timeline.push(event(
      'Cosplay Contest', 'cosplay', 'CasterLocal', 20,
      'Floor camera. MC hosts cosplay contest — contestants walk, judges score, winner announced.',
      { camSource: 'Stage Cam' }
    ));
    timeline.push(event(
      'Cosplay Contest Caster Reaction', 'casters', 'CasterLocalRemote2', 4,
      'Casters react to cosplay winners and transition back to tournament coverage.',
      casterPairs[1]
    ));
  }
}

// ── POST SWISS / TOP CUT ─────────────────────────────────────────────────────
timeline.push(taskList(
  'Top Cut Setup',
  [
    'Confirm Top 8 standings with scorekeeper',
    'Publish Top Cut bracket to players and graphics',
    'Reset table cameras for Top Cut lighting',
    'Prepare Top Cut overlay graphics',
    'Brief players on Top Cut format and timing',
  ],
  'Complete before Top Cut Review segment.'
));

timeline.push(event(
  'Top Cut Review — Swiss Results', 'casters', 'CasterLocalRemote2', 10,
  'Casters walk through the full Top 8 standings, highlight bracket matchups, and build hype for the cut.',
  casterPairs[0]
));

timeline.push(event(
  'Deck Tech — Top Cut Decks', 'custom', 'GraphicsDisplay', 8,
  'Quick deep-dive into the Top 8 deck lists. Graphics team display decklists. Casters analyze.',
  { castera: 'Andy', casterb: 'Vince' }
));

timeline.push(event(
  'Caster Outro', 'casters', 'CasterLocalRemote2', 5,
  'Casters wrap the day, thank sponsors, shout out players, and preview the next stream day.',
  casterPairs[0]
));

timeline.push(event(
  'End Credits', 'end-credits', 'GraphicsDisplay', 3,
  'Roll end credits. Thank all staff, judges, sponsors, and players.',
  {}
));

// ── STANDBY (filler / on-demand items) ───────────────────────────────────────
const standby = [];

// Commercials
standby.push(event('RoV Commercial', 'pre-recorded', 'PreRecMedia', 1, 'RoV event commercial spot — 30s or 60s cut.', {}));
standby.push(event('RoV Commercial (60s)', 'pre-recorded', 'PreRecMedia', 1, 'Full 60-second RoV commercial.', {}));
standby.push(event('IGC Commercial', 'pre-recorded', 'PreRecMedia', 1, 'IGC sponsor commercial.', {}));
standby.push(event('IGC Commercial (Long)', 'pre-recorded', 'PreRecMedia', 2, 'Extended IGC commercial spot.', {}));

// Meta content
standby.push(event('Meta Breakdown — Current Format Overview', 'custom', 'GraphicsDisplay', 7,
  'High-level look at the dominant decks in the current meta. Casters discuss trends.',
  { castera: 'Andy', casterb: 'Vince' }
));
standby.push(event('Meta Breakdown — Top Ink Pairs', 'custom', 'GraphicsDisplay', 6,
  'Breakdown of which ink color pairs are performing best this event.',
  { castera: 'Brando', casterb: 'Avery' }
));
standby.push(event('Meta Breakdown — Surprise Decks', 'custom', 'GraphicsDisplay', 5,
  'Spotlight on unexpected or rogue decks making a run at this event.',
  { castera: 'Vince', casterb: 'Courtney' }
));

// Matchup Breakdowns
standby.push(event('Matchup Breakdown — Amber Steel vs Amber Amethyst', 'custom', 'GraphicsDisplay', 6,
  'Head-to-head matchup analysis. Key cards, tech choices, and who favors the matchup.',
  { castera: 'Andy', casterb: 'Brando' }
));
standby.push(event('Matchup Breakdown — Amber Steel vs Ruby Amethyst', 'custom', 'GraphicsDisplay', 6,
  'Aggressive vs control — how does Amber Steel handle the pressure of Ruby Amethyst?',
  { castera: 'Zero', casterb: 'Avery' }
));
standby.push(event('Matchup Breakdown — Sapphire Emerald vs Amethyst Emerald', 'custom', 'GraphicsDisplay', 6,
  'Mirror-ish matchup — two Emerald decks going for the long game.',
  { castera: 'Vince', casterb: 'Kirsten' }
));
standby.push(event('Matchup Breakdown — Ruby Sapphire vs Amber Steel', 'custom', 'GraphicsDisplay', 5,
  'Speed vs consistency. Ruby Sapphire aggro vs the Amber Steel midrange machine.',
  { castera: 'Courtney', casterb: 'Brad' }
));
standby.push(event('Matchup Breakdown — Amethyst Ruby vs Sapphire Amethyst', 'custom', 'GraphicsDisplay', 5,
  'Ink synergy comparison — two combo-ish decks with very different game plans.',
  { castera: 'Andy', casterb: 'Avery' }
));

// Deck Techs
standby.push(event('Deck Tech — Amber Steel Control', 'custom', 'GraphicsDisplay', 7,
  'Full deck tech with the pilot if possible. Walk through the 60 card choices and sideboard.',
  { castera: 'Andy', casterb: 'Vince' }
));
standby.push(event('Deck Tech — Ruby Amethyst Aggro', 'custom', 'GraphicsDisplay', 6,
  'Fast and furious — tech deep dive into the Ruby Amethyst aggressive build.',
  { castera: 'Brando', casterb: 'Zero' }
));
standby.push(event('Deck Tech — Sapphire Emerald Ramp', 'custom', 'GraphicsDisplay', 7,
  'The big mana deck of the format. Walk through the ramp package and win conditions.',
  { castera: 'Avery', casterb: 'Courtney' }
));

// Roaming
standby.push(event('Roaming Camera — Hall Footage', 'live-video', 'CasterLocal', 4,
  'Cut to roaming camera in the hall. Show crowd, games in progress, vendor area.',
  { camSource: 'Roaming Cam' }
));
standby.push(event('Roaming Camera — Vendor Hall', 'live-video', 'CasterLocal', 3,
  'Roaming coverage of vendor hall and community area.',
  { camSource: 'Roaming Cam' }
));
standby.push(event('BRB — Back in 5', 'brb', 'BrB', 5, 'Short break. BRB screen with music.', {}));

// TCC Content (recorded at event, edited for later)
standby.push(event('TCC Content — Arrivals Vlog', 'pre-recorded', 'PreRecMedia', 5,
  'Edited arrivals footage — players checking in, setting up, first reactions to the venue.',
  {}
));
standby.push(event('TCC Content — Community Spotlight', 'pre-recorded', 'PreRecMedia', 4,
  'Short community feature piece recorded earlier in the day.',
  {}
));
standby.push(event('TCC Content — Player Hype Interviews', 'pre-recorded', 'PreRecMedia', 6,
  'Pre-recorded player hype clips from before the event — "What deck are you playing and why?"',
  {}
));
standby.push(event('TCC Content — Hall Ambiance', 'pre-recorded', 'PreRecMedia', 3,
  'B-roll of the event hall, crowd, and energy. Good filler between segments.',
  {}
));

// Additional filler
standby.push(event('Guest Segment — Guest 1', 'casters', 'CasterLocalRemote2', 8,
  'Feature segment with Guest 1. Discuss current meta, player experience, or community topic.',
  { castera: 'Andy', casterb: 'Guest 1' }
));
standby.push(event('Guest Segment — Guest 2', 'casters', 'CasterLocalRemote2', 8,
  'Feature segment with Guest 2.',
  { castera: 'Vince', casterb: 'Guest 2' }
));

// ── Assemble production ──────────────────────────────────────────────────────
const allItems = [...timeline, ...standby];
const production = {
  id: PROD_ID,
  name: 'RoV Championship — Day 1',
  estimatedLength: 600,
  status: 'idle',
  currentItemIndex: 0,
  settings: {
    casters: ['Andy', 'Vince', 'Avery', 'Brando', 'Zero', 'Courtney', 'Brad', 'Kirsten', 'Guest 1', 'Guest 2'],
    obsScenes: [
      'StartingSoon', 'BrB', 'CasterLocal', 'CasterLocalRemote2',
      'CasterLocalRemote3', 'CasterRemote2', 'CasterRemote3',
      'Interview', 'Gameplay A', 'Gameplay B', 'PreRecMedia',
      'GraphicsDisplay', 'Roaming', 'Stage'
    ]
  },
  timeline: timeline.map(i => i.id),
  standby: standby.map(i => i.id),
  _items: allItems,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

const out = JSON.stringify(production, null, 2);
fs.writeFileSync('rov-championship-day1.json', out);
console.log(`✅ Generated ${timeline.length} timeline items + ${standby.length} standby items`);
console.log(`📄 Saved to rov-championship-day1.json`);
