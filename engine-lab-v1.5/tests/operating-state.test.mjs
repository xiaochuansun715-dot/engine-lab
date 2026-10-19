import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Simulation} from '../physics.mjs';
import {decodePhoneBackup,phoneSelection} from '../phone-adapter.mjs';
const raw=JSON.parse(readFileSync(new URL('../phone-current-data.json',import.meta.url),'utf8'));
const selected=()=>phoneSelection(raw);
function make(){const {preset,tune}=selected();const s=new Simulation(preset,tune);s.selectGear(0);return s;}
function run(s,time,input={drive:true}){for(let i=0;i<time*120;i++)s.step(1/120,input);return s;}

test('cold V8 instruments match the documented stopped reference, without running consumption',()=>{
  const s=make(),before=s.snapshot().operating;run(s,5);
  assert.equal(s.temperature,28);assert.equal(before.oilTemperatureC,28);assert.equal(before.intakeTemperatureC,27);
  assert.equal(before.fuelL,60);assert.equal(before.batteryPercent,85);assert.equal(before.voltage,12.6);
  assert.equal(s.operating.fuelL,60);assert.equal(s.oilPressureBar,0);assert.equal(s.operating.boostVacuumBar,0);
  assert.equal(Math.round(s.tractionLimit),16950);
});
test('neutral idle produces flow, fuel use, charge and vacuum while driver input and wheel power stay zero',()=>{
  const s=make();s.start();run(s,30);
  const o=s.operating;assert.equal(s.throttle,0);assert.equal(o.actualThrottle,.01);assert.equal(s.speed,0);assert.equal(s.wheelPower,0);
  assert.ok(o.boostVacuumBar<-.65&&o.boostVacuumBar>-.75);assert.ok(o.intakeMassKgS>.004&&o.intakeMassKgS<.006);
  assert.ok(o.fuelLph>1.4&&o.fuelLph<1.6);assert.ok(o.fuelL<60);assert.ok(o.batteryPercent>85);assert.ok(o.voltage>=13.9&&o.voltage<=14);
  assert.ok(o.oilTemperatureC>28&&o.coolantTemperatureC>o.oilTemperatureC);assert.ok(s.oilPressureBar>1&&s.oilPressureBar<3);
  assert.equal(o.engineLoad,.02);assert.equal(s.health,100);
});
test('refill rejects running, cranking and coasting engine RPM; complete shutdown preserves thermal and wear state',()=>{
  const s=make();s.beginCranking();assert.equal(s.operating.refill('all',s),false);s.endCranking();s.start();run(s,20);
  assert.equal(s.operating.refill('all',s),false);s.stop();assert.equal(s.operating.refill('fuel',s),false);run(s,3);
  s.distance=123.4;s.health=81;s.operating.fuelL=21;s.operating.oilPercent=66;s.operating.batteryPercent=32;
  const before={distance:s.distance,health:s.health,coolant:s.temperature,oil:s.operating.oilTemperatureC,header:s.operating.headerTemperatureC};
  assert.equal(s.operating.refill('all',s),true);assert.equal(s.operating.fuelL,60);assert.equal(s.operating.oilPercent,100);assert.equal(s.operating.batteryPercent,100);
  assert.deepEqual({distance:s.distance,health:s.health,coolant:s.temperature,oil:s.operating.oilTemperatureC,header:s.operating.headerTemperatureC},before);
});
test('empty fuel stops combustion, start guards respect battery and unlimited fuel does not drain the tank',()=>{
  const s=make();s.operating.fuelL=0;assert.equal(s.beginCranking(),false);s.start();assert.equal(s.running,false);
  s.operating.unlimitedFuel=true;assert.equal(s.beginCranking(),true);s.endCranking();s.start();run(s,3);assert.equal(s.running,true);assert.equal(s.operating.fuelL,0);
  s.stop();s.rpm=0;s.operating.batteryPercent=2;assert.equal(s.beginCranking(),false);
  s.operating.batteryPercent=85;s.operating.unlimitedFuel=false;s.operating.fuelL=.00001;s.start();run(s,1);assert.equal(s.running,false);assert.equal(s.operating.fuelL,0);
});
test('partial refills only change their own resource and capacity changes do not create fuel',()=>{
  const s=make(),o=s.operating;o.fuelL=30;o.oilPercent=50;o.batteryPercent=40;
  assert.equal(o.refill('fuel',s),true);assert.equal(o.fuelL,60);assert.equal(o.oilPercent,50);assert.equal(o.batteryPercent,40);
  o.setTankCapacity(80);assert.equal(o.fuelL,60);o.setTankCapacity(20);assert.equal(o.fuelL,20);assert.equal(o.setTankCapacity(NaN),false);assert.equal(o.refill('invalid',s),false);
});
test('road multipliers affect real traction and resistance; displayed force total is the actual integrated sum',()=>{
  const s=make();s.start();s.selectGear(1);run(s,3,{drive:true,throttle:1});const dry=s.tractionLimit;
  s.operating.setRoad('wet');s.step(1/120,{drive:true,throttle:1});assert.ok(Math.abs(s.tractionLimit/dry-.69)<1e-9);
  s.operating.roadLoad=75;s.step(1/120,{drive:true,throttle:1});assert.ok(s.slopeForce>0);
  assert.equal(s.totalResistance,s.dragForce+s.rollingForce+s.engineBrakeForce+s.slopeForce);
  assert.ok(s.wheelPower>0&&s.driveForce>0);s.selectGear(0);run(s,.1);assert.equal(s.driveForce,0);assert.equal(s.wheelPower,0);assert.equal(s.clutchEngagement,0);
});
test('life off prevents knock wear and enabling life permits damage without resetting temperatures',()=>{
  const s=make();s.tune.boost=4;s.tune.ignition=25;s.start();run(s,8,{throttle:1});assert.ok(s.knock>0);assert.equal(s.health,100);
  s.operating.lifeEnabled=true;const temp=s.temperature;run(s,8,{throttle:1});assert.ok(s.health<100);assert.ok(s.temperature>temp);
});
test('automatic V8 display thresholds correspond to the reviewed UI while source null remains intact',()=>{
  const s=make();assert.ok(Math.abs(s.upshiftRpm-6984)<1e-8);assert.ok(Math.abs(s.downshiftRpm-3960)<1e-8);
  assert.equal(s.preset.source.automaticTransmission.upshiftRpm,null);assert.equal(s.preset.source.automaticTransmission.downshiftRpm,null);
  s.configure(s.preset,{...s.tune,mass:1800});assert.equal(s.operating.fuelL,60);assert.equal(s.temperature,28);
});
