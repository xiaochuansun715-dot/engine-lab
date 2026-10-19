import test from 'node:test';
import assert from 'node:assert/strict';
import {PRESETS,Simulation,defaultTune,cleanTune,torqueAt,dynoCurve} from '../physics.mjs';
const run=(s,seconds,input)=>{for(let n=0;n<seconds*120;n++)s.step(1/120,input);return s;};
test('ignition, unloaded throttle response and shutdown',()=>{
  const s=new Simulation();run(s,2,{throttle:1});assert.equal(s.rpm,0);
  s.start();run(s,2,{throttle:0});assert.ok(s.rpm>800&&s.rpm<930);
  run(s,2,{throttle:.7});assert.ok(s.rpm>5000&&s.rpm<s.tune.redline+200);
  s.running=false;run(s,4,{throttle:1});assert.equal(s.rpm,0);assert.equal(s.power,0);
});
test('every engine completes 400m with automatic gear changes and finite telemetry',()=>{
  for(const p of PRESETS){const s=new Simulation(p);s.start();let elapsed=0;while(s.distance<400&&elapsed<40){s.step(1/120,{drive:true,throttle:1});elapsed+=1/120;}
    assert.ok(s.distance>=400,p.id+' should finish');assert.ok(elapsed>7&&elapsed<30,p.id+' plausible elapsed');assert.ok(s.gear>1&&s.gear<=6);assert.ok(s.zeroTo100>2&&s.zeroTo100<20);
    for(const key of ['rpm','speed','temperature','power','torque','health'])assert.ok(Number.isFinite(s[key]),p.id+' '+key);
    assert.ok(s.rpm<=s.tune.redline+200);
  }
});
test('braking and disengaged clutch remove traction',()=>{
  const s=new Simulation();s.start();run(s,7,{drive:true,throttle:1});assert.ok(s.speed>20);const speed=s.speed;
  run(s,.5,{drive:true,throttle:1,clutch:true});assert.ok(s.speed<speed);
  run(s,5,{drive:true,throttle:0,brake:1});assert.equal(s.speed,0);
});
test('boost changes the torque curve and power uses consistent SI units',()=>{
  const p=PRESETS[0],stock=defaultTune(p),low={...stock,boost:0},high={...stock,boost:1.5};
  assert.ok(torqueAt(4000,high,p)>torqueAt(4000,low,p)*1.4);
  for(const point of dynoCurve(stock,p)){assert.ok(point.torque>=0);assert.ok(Math.abs(point.kw-point.torque*point.rpm/9549.3)<1e-8);}
  assert.equal(torqueAt(stock.redline+200,stock,p),0);
});
test('imported tuning is bounded and ignores unknown properties',()=>{
  const p=PRESETS[0],c=cleanTune({boost:999,redline:-1,ignition:'invalid',mass:1,exhaust:-5,unknown:'value'},p);
  assert.equal(c.boost,2.2);assert.equal(c.redline,5000);assert.equal(c.ignition,0);assert.equal(c.mass,850);assert.equal(c.exhaust,0);assert.equal(c.unknown,undefined);
});
test('reset and repair restore a playable state without losing the chosen engine',()=>{
  const s=new Simulation(PRESETS[2]);s.start();run(s,9,{drive:true,throttle:1});s.health=71;s.temperature=120;s.repair();assert.equal(s.health,100);assert.equal(s.temperature,79);
  s.reset();assert.equal(s.preset.id,'v8');assert.equal(s.distance,0);assert.equal(s.running,false);s.start();run(s,3,{drive:true,throttle:1});assert.ok(s.speed>10);
});
