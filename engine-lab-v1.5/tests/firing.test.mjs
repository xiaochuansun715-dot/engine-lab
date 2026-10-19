import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {phonePreset} from '../phone-adapter.mjs';
import {PACKAGE_PROFILES,PACKAGE_PROFILE_EVIDENCE} from '../package-profiles.mjs';
import {CYCLE,createFiringSchedule,cylinderPhase,strokeState,crankKinematics,cylinderBanks} from '../firing.mjs';
const library=JSON.parse(readFileSync(new URL('../phone-data.json',import.meta.url),'utf8'));
const preset=key=>phonePreset(library.engines.find(item=>item.key===key));
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-10,`${actual} != ${expected}`);

test('only the 24 exact package keys acquire their original events and starter parameters',()=>{
  assert.equal(Object.keys(PACKAGE_PROFILES).length,24);
  let matched=0;
  for(const item of library.engines){
    const p=phonePreset(item),source=PACKAGE_PROFILES[item.key];
    if(!source){assert.equal(p.firingSource,'illustrative');assert.equal(p.firingOrder,undefined);assert.equal(p.starterHoldSeconds,undefined);continue;}
    matched++;
    assert.equal(p.firingSource,'ipa-packaged-profile',item.key);
    assert.deepEqual(p.firing,source.firing);
    assert.deepEqual(p.firingOrder,source.firing.map(event=>event.cyl));
    assert.deepEqual(p.firingAngles,source.firing.map(event=>event.deg));
    assert.equal(p.starterHoldSeconds,source.startHoldMs/1000);
    assert.equal(p.crankRpm,source.crankRpm);assert.equal(p.startFlareRpm,source.startFlareRpm);
    assert.equal(p.firingSourceEvidence.sha256,PACKAGE_PROFILE_EVIDENCE.sha256);
    assert.equal(p.firingSourceEvidence.runtimeVerified,false);
    assert.equal(createFiringSchedule(p).packaged,true);
  }
  assert.equal(matched,24);
});

test('custom or structurally changed builds do not inherit stock timing by ID',()=>{
  const original=library.engines.find(item=>item.key==='hellcat');
  for(const item of [{...original,custom:true},{...original,build:{...original.build,cylinders:6}},{...original,build:{...original.build,layout:'inline'}},{...original,key:'catalog-hellcat-similar'}]){
    const p=phonePreset(item);assert.equal(p.firingSource,'illustrative');assert.equal(p.firingAngles,undefined);assert.equal(p.crankRpm,undefined);
  }
  const a=preset('hellcat');a.firing[0].deg=400;a.firingSourceEvidence.runtimeVerified=true;
  assert.equal(preset('hellcat').firing[0].deg,0);assert.equal(preset('hellcat').firingSourceEvidence.runtimeVerified,false);
});

test('R1 and V10 retain nonuniform package intervals including the cycle boundary',()=>{
  for(const [key,expected] of [['yzfR1',[270,180,90,180]],['v10',[54,90,54,90,54,90,54,90,54,90]]]){
    const p=preset(key),angles=p.firingAngles;
    assert.deepEqual(angles.map((deg,i)=>(angles[i+1]??angles[0]+720)-deg),expected);
  }
  assert.deepEqual(preset('hellcat').firingOrder,[1,8,4,3,6,5,7,2]);
  assert.equal(preset('hellcat').starterHoldSeconds,.72);
});

test('cylinder IDs are resolved independently of their firing sequence position',()=>{
  const schedule=createFiringSchedule(preset('hellcat'));
  near(schedule.byCylinder[8].offset,Math.PI/2);
  near(schedule.byCylinder[2].offset,Math.PI*3.5);
  near(cylinderPhase(Math.PI/2,8,schedule),0);
  near(cylinderPhase(Math.PI/2,2,schedule),Math.PI);
  for(const key of Object.keys(PACKAGE_PROFILES)){
    const s=createFiringSchedule(preset(key));
    for(const event of s.events){near(cylinderPhase(event.offset,event.cylinder,s),0);near(cylinderPhase(event.offset+CYCLE,event.cylinder,s),0);}
  }
  assert.throws(()=>cylinderPhase(0,9,schedule),RangeError);
});

test('both geometry views share the four-stroke order and never open exhaust during compression',()=>{
  const epsilon=1e-7;
  for(let stage=0;stage<4;stage++){
    for(const phase of [stage*Math.PI+epsilon,(stage+.5)*Math.PI,(stage+1)*Math.PI-epsilon]){
      const state=strokeState(phase);assert.equal(state.stage,stage);
      assert.equal(state.intakeOpen,stage===2);assert.equal(state.exhaustOpen,stage===1);
    }
  }
  assert.equal(strokeState(Math.PI).stage,1);assert.equal(strokeState(Math.PI*2).stage,2);
  assert.equal(strokeState(Math.PI*3).stage,3);assert.equal(strokeState(CYCLE).stage,0);
  assert.equal(strokeState(-epsilon).stage,3);
});

test('shared crank geometry preserves rod length and full stroke at the source timing',()=>{
  for(const radius of [.27,20])for(const ratio of [1,1.64,1.9,3]){
    const length=radius*2*ratio;
    near(crankKinematics(0,radius,ratio).pistonAlong,length+radius);
    near(crankKinematics(Math.PI,radius,ratio).pistonAlong,length-radius);
    for(let phase=0;phase<CYCLE;phase+=.13){
      const m=crankKinematics(phase,radius,ratio);
      near(Math.hypot(m.pinAcross,m.pistonAlong-m.pinAlong),length);
      assert.ok(Number.isFinite(m.pistonAlong));
    }
  }
});

test('physical bank grouping uses source labels instead of the source audio lane index',()=>{
  const banks=key=>{const p=preset(key);return cylinderBanks(p,createFiringSchedule(p));};
  assert.deepEqual(banks('gtr'),[[1,3,5],[2,4,6]]);
  assert.deepEqual(banks('v8'),[[5,6,7,8],[1,2,3,4]]);
  assert.deepEqual(banks('hellcat'),[[1,3,5,7],[2,4,6,8]]);
  assert.deepEqual(banks('yzfR1'),[[1,2,3,4]]);
  assert.deepEqual(banks('w16'),[[1,2,3,4],[5,6,7,8],[9,10,11,12],[13,14,15,16]]);
});

test('unknown or malformed timing falls back to explicitly illustrative equal spacing',()=>{
  const schedule=createFiringSchedule({cylinders:4,firingSource:'ipa-packaged-profile',firingOrder:[1,1,3,4],firingAngles:[0,180,360,540]});
  assert.equal(schedule.source,'illustrative');assert.equal(schedule.packaged,false);
  assert.deepEqual(schedule.events.map(event=>event.deg),[0,180,360,540]);
  const p=preset('rotary');assert.equal(p.layout,'rotary');assert.equal(p.physicalRotors,2);assert.equal(p.eventsPerShaftRev,2);
});
