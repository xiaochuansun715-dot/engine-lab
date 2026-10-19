import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Simulation,PRESETS} from '../physics.mjs';
import {phoneSelection} from '../phone-adapter.mjs';
const library=JSON.parse(fs.readFileSync(new URL('../phone-data.json',import.meta.url)));
const make=()=>{const {preset,tune}=phoneSelection(library,'hellcat',1),s=new Simulation(preset,tune);s.auto=false;s.start();return s;};
const run=(s,seconds,input={drive:true,throttle:1})=>{for(let i=0;i<seconds*120;i++)s.step(1/120,input);return s;};

test('neutral freely revs with no wheel torque or vehicle motion, even in automatic mode',()=>{
 const s=make();s.selectGear(0);s.auto=true;run(s,3);
 assert.equal(s.gear,0);assert.equal(s.neutral,true);assert.ok(s.rpm>6000);assert.equal(s.wheelTorque,0);assert.equal(s.speed,0);assert.equal(s.distance,0);
});
test('shift controls reach N below first and every actual gear without exceeding its range',()=>{
 const s=make();s.shift(-1);assert.equal(s.gear,0);assert.equal(s.shift(-1),false);s.shift(1);assert.equal(s.gear,1);
 for(let i=0;i<30;i++)s.shift(1);assert.equal(s.gear,8);assert.equal(s.shift(1),false);assert.equal(s.selectGear(NaN),false);
 assert.ok(Math.abs(s.gearRatio-.67)<1e-10);assert.ok(Math.abs(s.totalRatio-.67*2.62)<1e-10);
});
test('engaged gears accelerate while shifting and held clutch disconnect wheel torque',()=>{
 const s=make();s.selectGear(0);s.selectGear(1);s.step(1/120,{drive:true,throttle:1});assert.ok(s.shiftTimer>0);assert.equal(s.wheelTorque,0);
 run(s,2);assert.ok(s.speed>5&&s.wheelTorque>0);const speed=s.speed;
 s.shift(1);s.step(1/120,{drive:true,throttle:1});assert.equal(s.wheelTorque,0);assert.ok(s.speed<=speed);
 run(s,.7);assert.ok(s.wheelTorque>0);const engaged=s.speed;run(s,.7,{drive:true,throttle:1,clutch:true});assert.equal(s.wheelTorque,0);assert.ok(s.speed<engaged);
});
test('at a shared road speed upshift lowers RPM and downshift raises it',()=>{
 const s=make();s.speed=25;s.selectGear(2);run(s,.7,{drive:true,throttle:.25});const second=s.rpm;
 s.selectGear(3);run(s,.7,{drive:true,throttle:.25});const third=s.rpm;assert.ok(third<second-400,`${third} < ${second}`);
 s.selectGear(2);run(s,.7,{drive:true,throttle:.25});assert.ok(s.rpm>third+400);
});
test('selecting N while moving permits coasting without engine traction',()=>{
 const s=make();run(s,4);const speed=s.speed;s.selectGear(0);run(s,.5);
 assert.ok(s.speed>0&&s.speed<speed);assert.equal(s.wheelTorque,0);assert.ok(s.rpm>5000);
});
test('all built-in transmissions remain finite through neutral, extreme shifts and automatic acceleration',()=>{
 for(const p of PRESETS){const s=new Simulation(p);s.start();s.selectGear(0);run(s,.3);s.selectGear(s.gearCount);run(s,.4);s.selectGear(1);s.auto=true;run(s,8);for(const k of ['rpm','speed','wheelTorque','totalRatio','power'])assert.ok(Number.isFinite(s[k]),p.id+' '+k);assert.ok(s.gear>1);}
});
