import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodePhoneBackup,phoneSelection,phonePreset,decodeLabSave} from '../phone-adapter.mjs';
import {Simulation,cleanTune,torqueAt} from '../physics.mjs';
const library=JSON.parse(readFileSync(new URL('../phone-data.json',import.meta.url),'utf8'));
test('both phone selections preserve exact exported engine and drivetrain values',()=>{
  const a=phoneSelection(library,undefined,0),b=phoneSelection(library,undefined,1);
  assert.equal(library.engines.length,170);assert.equal(a.preset.cylinders,8);assert.equal(a.preset.idleRpm,900);assert.equal(a.tune.redline,7200);assert.equal(a.tune.boost,1.35);assert.equal(a.tune.mass,1630);assert.equal(a.preset.ratios.length-1,7);assert.equal(a.preset.finalDrive,3.67);
  assert.equal(b.preset.induction,'supercharger');assert.equal(b.preset.boreMm,103.9);assert.equal(b.preset.strokeMm,90.9);assert.equal(b.preset.idleRpm,750);assert.equal(b.tune.redline,6200);assert.equal(b.tune.boost,.8);assert.equal(b.tune.mass,2005);assert.equal(b.preset.ratios.length-1,8);assert.equal(b.preset.finalDrive,2.62);
});
test('170 entries retained; 2 extreme custom configurations are unavailable for simulation',()=>{
 const all=library.engines.map(e=>phonePreset(e));assert.equal(all.filter(p=>p.playable).length,168);const extreme=all.find(p=>p.sourceKey==='catalog-bugatti-chiron-super-sport-2022');assert.equal(extreme.source.build.cylinders,1000);assert.equal(extreme.source.build.redlineRpm,1620000);assert.equal(extreme.playable,false);assert.throws(()=>phoneSelection(library,'custom'));
});
test('complete native backup envelope decodes without executing or dropping numerical precision',()=>{
 const snapshot=library.snapshots[1],builds=Object.fromEntries(library.engines.map(e=>[e.key,e.build])),vehicles=Object.fromEntries(library.engines.map(e=>[e.key,e.vehicle]));
 const decoded=decodePhoneBackup({format:'noi-box-backup',version:1,draft:{...snapshot,engineBuildByEngine:builds,vehicleTuningByEngine:vehicles}});assert.equal(decoded.engines.length,170);assert.equal(phoneSelection(decoded).preset.boreMm,103.9);assert.throws(()=>decodePhoneBackup({format:'other'}));
});
test('saved phone configuration round trips including manual mode and timing',()=>{
 const a=phoneSelection(library,undefined,1),saved={version:1,preset:a.preset.id,tune:a.tune,phoneSource:a.preset.source},b=decodeLabSave(JSON.parse(JSON.stringify(saved)));assert.equal(b.preset.id,a.preset.id);assert.deepEqual(b.tune,a.tune);assert.equal(b.preset.automatic,false);assert.equal(b.preset.shiftDuration,.11);assert.equal(b.preset.ratios.length,9);
});
test('all playable imported models run with finite state, imported idle and actual gear count',()=>{
 for(const item of library.engines){const p=phonePreset(item,library.snapshots[0]);if(!p.playable)continue;const s=new Simulation(p);s.start();assert.equal(s.rpm,p.idleRpm);for(let i=0;i<1200;i++)s.step(1/120,{drive:true,throttle:1});for(const key of ['rpm','speed','power','torque','temperature'])assert.ok(Number.isFinite(s[key]),item.key+' '+key);for(let i=0;i<30;i++)s.shift(1);assert.equal(s.gear,p.ratios.length-1);}
});
test('lowered redline cannot produce a zero denominator or an idle above its configured range',()=>{
 const {preset:p,tune:t}=phoneSelection(library);const changed=cleanTune({...t,redline:p.peak-900},p);assert.ok(Number.isFinite(torqueAt(p.idleRpm,changed,p)));assert.ok(cleanTune({...t,redline:0},p).redline>p.idleRpm);
});
