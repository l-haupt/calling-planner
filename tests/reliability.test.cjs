// Run with: node tests/reliability.test.cjs
//
// These load the single HTML file, pull the application script out of it, and
// exercise the pure functions in a bare VM. No DOM, no browser, no network, so
// they run anywhere Node does and finish in milliseconds.
//
// They assert on BEHAVIOUR, not on source text. An earlier version of this file
// matched exact code strings, which meant any rewording of a message broke the
// build while real regressions could still slip through.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('calling-planner.html', 'utf8');
const found = html.match(/<script>([\s\S]*?)<\/script>/);
assert(found, 'application script found');
const src = found[1];

// Parses cleanly.
new vm.Script(src, { filename: 'calling-planner.js' });

const REV = (src.match(/const REV='(\d+)'/) || [])[1];
assert(REV, 'revision number present');

// Lift one top-level function out of the IIFE and evaluate it on its own.
// `deps` are other declarations it needs in scope.
function lift(name, deps = []) {
  const re = new RegExp(`(?:^|\\n)(function ${name}\\([\\s\\S]*?\\n\\})`, 'm');
  const m = src.match(re);
  assert(m, `${name}() found`);
  return vm.runInNewContext(`${deps.join('\n')}\n${m[1]}\n${name}`);
}
function liftConst(name) {
  const m = src.match(new RegExp(`const ${name}=([^;]+);`));
  assert(m, `${name} found`);
  return m[0];
}

// ---------------------------------------------------------------- backups

const uid = 'const uid=()=>Math.random().toString(36).slice(2,10);';
const NG = liftConst('NG');
const valid = lift('valid');
const norm = lift('norm', [uid, NG, 'let REPAIRS=[];']);

const base = () => ({
  orgs: [{ id: 'o1', name: 'Primary', collapsed: false }],
  members: [{ id: 'm1', name: 'Test Member', avail: false }],
  callings: [{ id: 'c1', orgId: 'o1', group: '', title: 'Teacher',
               since: '', current: 'm1', proposed: 'm1', cands: [] }],
  hidden: [], groupColors: {}
});
const clone = o => JSON.parse(JSON.stringify(o));

assert.equal(valid(base()), true, 'a current backup is accepted');
assert.equal(valid(null), false, 'null is rejected');
assert.equal(valid({}), false, 'an empty object is rejected');
const noCallings = clone(base()); delete noCallings.callings;
assert.equal(valid(noCallings), false, 'a file with no callings array is rejected');

// Damaged files are REPAIRED rather than refused: a bishopric should not lose a
// whole board because one reference went stale. Every repair is recorded so the
// Data check can show it.
{
  const d = clone(base());
  d.callings[0].current = 'ghost';
  const out = norm(d);
  assert.equal(out.callings[0].current, null, 'an unknown member is cleared');
  assert.equal(out.callings.length, 1, 'the calling itself survives');
}
{
  const d = clone(base());
  d.callings[0].cands = ['ghost', 'm1', 'm1'];
  d.callings[0].proposed = null;
  const out = norm(d);
  assert.equal(out.callings[0].cands.join(','), 'm1', 'shortlists drop unknown and repeated names');
}
{
  const d = clone(base());
  d.callings[0].orgId = 'ghost';
  const out = norm(d);
  const org = out.orgs.find(o => o.id === out.callings[0].orgId);
  assert(org, 'a calling whose organization vanished is rehomed');
  assert.equal(org.name, 'Unsorted', 'it lands in Unsorted');
}
{
  const d = clone(base());
  d.callings[0].proposed = 'm1';
  d.callings[0].cands = ['m1'];
  const out = norm(d);
  assert.equal(out.callings[0].proposed, 'm1', 'a decision beats a leftover shortlist');
  assert.equal(out.callings[0].cands.length, 0, 'and the shortlist is emptied');
}
{
  const d = clone(base());
  d.members.push({ id: 'm1', name: 'Duplicate' });
  d.orgs.push({ name: 'No id' });
  assert.equal(norm(d).members.length, 1, 'duplicate member ids collapse to one');
  assert.equal(norm(d).orgs.length, 1, 'an organization with no id is dropped');
}
{
  // A board written before candidates, tenure or groups existed still loads.
  const legacy = {
    orgs: [{ id: 'o1', name: 'Primary' }],
    members: [{ id: 'm1', name: 'Test Member' }],
    callings: [{ id: 'c1', orgId: 'o1', title: 'Teacher', current: 'm1' }]
  };
  assert.equal(valid(legacy), true, 'a legacy backup is accepted');
  const out = norm(legacy);
  assert.equal(out.callings[0].cands.length, 0, 'cands defaults to empty');
  assert.equal(out.callings[0].group, '', 'group defaults to empty');
  assert.equal(out.callings[0].since, '', 'since defaults to empty');
  assert.equal(out.callings[0].proposed, 'm1', 'proposed defaults to the current holder');
}

// ------------------------------------------------------- dates and tenure

const MON = liftConst('MON');
const MONTH_NO = liftConst('MONTH_NO');
const parseDate = lift('parseDate', [MON, MONTH_NO]);
const tenureText = lift('tenureText', [MON, MONTH_NO, src.match(/function parseDate[\s\S]*?\n\}/)[0]]);

assert.equal(parseDate('16 Jul 2023').getFullYear(), 2023, 'LCR date parses');
assert.equal(parseDate('16 Jul 2023').getMonth(), 6, 'LCR month parses');
assert.equal(parseDate('not a date'), null, 'junk is not a date');
assert.equal(tenureText(''), '', 'no date means no tenure shown');
{
  const d = new Date(); d.setFullYear(d.getFullYear() - 3); d.setMonth(d.getMonth() - 2);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const t = tenureText(`${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`);
  assert.match(t, /^3 yr/, `three years back reads as 3 yr (got ${t})`);
}
{
  const d = new Date(); d.setFullYear(d.getFullYear() + 1);
  assert.equal(tenureText(`1 Jan ${d.getFullYear()}`), '', 'a future date shows nothing');
}

// --------------------------------------------------------------- importing

const parseCallings = lift('parseCallings', [
  MON, MONTH_NO,
  ...['parseDate','isDate','splitCells','splitRecords','recParts','looksLabeled',
      'parseLabeled','isKnownOrg','isMainOrg','isSubHead','inferOrg','inferGroup','labelOrg']
    .map(fn => (src.match(new RegExp(`(?:^|\\n)(function ${fn}\\([\\s\\S]*?\\n\\})`, 'm')) || [])[1] || ''),
  liftConst('vacantRx'), liftConst('isVacant'), liftConst('isCommaName'),
  liftConst('KNOWN_ORGS'), liftConst('LABEL_RX'), liftConst('cleanHead'), liftConst('VAC')
]);

{
  // LCR List view: a section label on every record, dates closing each one.
  const rows = parseCallings([
    'Bishopric','Bishop','Hansen, David','16 Jul 2023','',
    'Elders Quorum Presidency','Elders Quorum President','Brooks, Aaron','15 Jan 2023','',
    'Teachers','Elders Quorum Teacher','Tilley, Jay','27 Oct 2024',''
  ].join('\n'));
  assert.equal(rows.length, 3, 'three records parse');
  assert.equal(rows[0].name, 'Hansen, David', 'the name is read');
  assert.equal(rows[0].since, '16 Jul 2023', 'the sustained date is kept');
  assert.equal(rows[1].group, 'Presidency', 'a label leading with the org name is trimmed');
  assert.equal(rows[2].org, 'Elders Quorum', 'a generic label takes its org from the title');
}
{
  // The older stacked export, and vacancies.
  const rows = parseCallings([
    'Bishop','Barrett, Brett','16 Jul 2023','',
    'Ward Assistant Clerk--Membership','Calling Vacant'
  ].join('\n'));
  assert.equal(rows.length, 2, 'stacked records parse');
  assert.equal(rows[1].name, '', 'Calling Vacant becomes an open position');
}
{
  const rows = parseCallings(['Calling','Name','Sustained','','Bishop','Hansen, David','16 Jul 2023'].join('\n'));
  assert.equal(rows.length, 1, 'column headings are not mistaken for callings');
  assert.equal(rows[0].name, 'Hansen, David', 'the real record still parses');
}
{
  const rows = parseCallings('Primary Pianist | Smith, Jane');
  assert.equal(rows.length, 1, 'a typed pipe row parses');
  assert.equal(rows[0].name, 'Smith, Jane', 'its name is read');
}

// ------------------------------------------------------ behaviour contracts
// Narrow checks for defects that have actually bitten, phrased against the
// parsed script rather than exact wording.

assert(/case 'delMember'[\s\S]{0,400}?c\.cands=cands\(c\)\.filter/.test(src),
  'removing a member also clears them from shortlists');
assert(/URL\.createObjectURL/.test(src) && /link\.download=fn/.test(src),
  'backups download as a real file');
assert(/Copy this text into a file|copy this text into a file/.test(src),
  'a copy fallback remains for browsers that refuse the download');
assert(/function save\(\)\{[\s\S]*?return true;[\s\S]*?return false;[\s\S]*?\n\}/.test(src),
  'save() reports whether it succeeded instead of swallowing the error');
assert(/if\(msg&&ok\)toast\(msg\)/.test(src),
  'a failed save does not get reported as success');

console.log(`Calling Planner rev ${REV}: reliability checks passed`);
