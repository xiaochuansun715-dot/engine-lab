import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PRESETS,Simulation,STARTER_DURATION_SECONDS} from '../physics.mjs';
import {phoneSelection} from '../phone-adapter.mjs';

function advance(sim,seconds,input={}){for(let i=0;i<Math.round(seconds*120);i++)sim.step(1/120,input);return sim;}

test('starter requires a sustained hold and produces no engine power while cranking',()=>{
  const sim=new Simulation();advance(sim,2,{drive:true,throttle:1});assert.equal(sim.rpm,0);
  assert.equal(sim.beginCranking(),true);advance(sim,.55,{drive:true,throttle:1});
  assert.equal(sim.running,false);assert.equal(sim.cranking,true);assert.ok(Math.abs(sim.starterProgress-.5)<1e-9);
  assert.ok(sim.rpm>100&&sim.rpm<240);assert.equal(sim.torque,0);assert.equal(sim.power,0);assert.equal(sim.speed,0);
  advance(sim,.55);assert.equal(sim.running,true);assert.equal(sim.cranking,false);assert.equal(sim.starterProgress,1);
  sim.endCranking();advance(sim,.2);assert.equal(sim.running,true);assert.ok(sim.rpm>800);
});

test('releasing a partial hold cancels it and the next attempt starts at zero',()=>{
  const sim=new Simulation();sim.beginCranking();advance(sim,.4);
  const progress=sim.starterProgress;assert.equal(sim.beginCranking(),false);assert.equal(sim.starterProgress,progress);
  sim.endCranking();assert.equal(sim.cranking,false);assert.equal(sim.starterProgress,0);
  advance(sim,2);assert.equal(sim.running,false);assert.equal(sim.rpm,0);
  sim.beginCranking();advance(sim,.1);assert.ok(sim.starterProgress<.1);assert.equal(sim.running,false);
});

test('stop, reset, and the programmatic start entry point clear starter state',()=>{
  const sim=new Simulation();sim.beginCranking();advance(sim,.2);sim.stop();
  assert.equal(sim.cranking,false);assert.equal(sim.starterProgress,0);assert.equal(sim.power,0);
  sim.beginCranking();sim.start();assert.equal(sim.running,true);assert.equal(sim.cranking,false);assert.equal(sim.rpm,850);
  assert.equal(sim.beginCranking(),false);sim.reset();assert.equal(sim.running,false);assert.equal(sim.cranking,false);assert.equal(sim.starterProgress,0);
  sim.health=0;assert.equal(sim.beginCranking(),false);sim.start();assert.equal(sim.running,false);
});

test('a delayed simulation frame cannot complete the hold in one step',()=>{
  const sim=new Simulation();assert.equal(sim.starterDurationSeconds,STARTER_DURATION_SECONDS);
  sim.beginCranking();sim.step(10);assert.equal(sim.running,false);assert.ok(sim.starterProgress<.05);
});

test('matching Hellcat uses the packaged hold, crank, and start-flare targets',()=>{
  const library=JSON.parse(readFileSync(new URL('../phone-data.json',import.meta.url),'utf8'));
  const {preset,tune}=phoneSelection(library,'hellcat',1),sim=new Simulation(preset,tune);
  assert.equal(preset.starterSource,'ipa-packaged-profile');assert.equal(sim.starterDurationSeconds,.72);
  assert.equal(preset.crankRpm,205);assert.equal(preset.startFlareRpm,1350);
  sim.beginCranking();advance(sim,.5,{drive:true,throttle:1});assert.equal(sim.running,false);assert.ok(Math.abs(sim.rpm-205)<20);assert.equal(sim.power,0);assert.equal(sim.speed,0);
  advance(sim,.225);assert.equal(sim.running,true);assert.equal(sim.cranking,false);assert.ok(sim.rpm>1250&&sim.rpm<=1350);
  advance(sim,2);assert.ok(Math.abs(sim.rpm-preset.idleRpm)<40);
});

test('an unmatched independent preset keeps the explicit fallback timing',()=>{
  const sim=new Simulation(PRESETS[2]);assert.equal(sim.starterDurationSeconds,1.1);
  sim.beginCranking();advance(sim,1);assert.equal(sim.running,false);advance(sim,.1);assert.equal(sim.running,true);
});
