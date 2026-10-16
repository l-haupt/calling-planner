// Run with: node tests/reliability.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('calling-planner.html','utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/);
assert(script, 'Application script found');
new vm.Script(script[1], { filename:'calling-planner.js' }); // parse without running DOM-dependent code
const match = script[1].match(/function valid\(d\)\{[\s\S]*?\n\}/);
assert(match, 'Backup validator present');
const valid = vm.runInNewContext('('+match[0]+')');
const base = {
  orgs:[{id:'o1',name:'Primary'}],
  members:[{id:'m1',name:'Test Member',avail:false}],
  callings:[{id:'c1',orgId:'o1',title:'Teacher',current:'m1',proposed:'m1',cands:[]}],
  hidden:[],groupColors:{}
};
const clone = () => JSON.parse(JSON.stringify(base));
assert.equal(valid(base), true, 'Existing backup schema accepted');
const missingMember=clone();missingMember.callings[0].current='missing';
assert.equal(valid(missingMember),false,'Orphaned current member rejected');
const orphanCandidate=clone();orphanCandidate.callings[0].cands=['missing'];
assert.equal(valid(orphanCandidate),false,'Orphaned candidate rejected');
const badOrg=clone();badOrg.callings[0].orgId='missing';
assert.equal(valid(badOrg),false,'Missing organization rejected');
const duplicate=clone();duplicate.members.push({...duplicate.members[0]});
assert.equal(valid(duplicate),false,'Duplicate member ids rejected');
const missingArrays=clone();delete missingArrays.callings;
assert.equal(valid(missingArrays),false,'Missing callings rejected');
const legacy=clone();delete legacy.callings[0].proposed;delete legacy.callings[0].cands;
assert.equal(valid(legacy),true,'Legacy callings remain accepted');
assert(script[1].includes('c.cands=cands(c).filter(id=>id!==m.id)'), 'Member deletion cleans candidates');
assert(script[1].includes('S=blank();undoStack=[]'), 'Clear resets undo history');
assert(script[1].includes('window.alert(\'Calling Planner could not save changes'), 'Save failures are visible');
assert(script[1].includes("new Blob([data],{type:'application/json;charset=utf-8'})"), 'Backup is generated as JSON');
assert(script[1].includes("link.download=fn"), 'Backup uses a downloaded filename');
assert(script[1].includes("URL.createObjectURL(blob)"), 'Browser backup uses a downloadable blob');
assert(!script[1].includes('Copy this text into a file'), 'Manual copy fallback removed');
console.log('Calling Planner reliability checks passed');
