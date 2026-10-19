import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodePhoneBackup,phoneSelection} from '../phone-adapter.mjs';
import {dynoCurve,torqueAt,PRESETS,defaultTune} from '../physics.mjs';
import {hasObservedStockV8} from '../reference-model.mjs';
const original=JSON.parse(readFileSync(new URL('../phone-current-data.json',import.meta.url),'utf8'));
test('stock V8 predicted display respects photographed peaks with consistent PS/kW conversion',()=>{
  const {preset:p,tune:t}=phoneSelection(original),curve=dynoCurve(t,p);
  const power=curve.reduce((a,b)=>a.kw>b.kw?a:b),torque=curve.reduce((a,b)=>a.torque>b.torque?a:b);
  assert.ok(hasObservedStockV8(p));assert.equal(torque.rpm,4079);assert.equal(torque.torque,700);
  assert.equal(power.rpm,7200);assert.ok(Math.abs(power.kw/.73549875-574)<1e-9);assert.equal(Math.round(power.kw*p.efficiency/.73549875),511);
});
test('observed anchors never spread to other V8s or modified/open-induction builds',()=>{
  const {preset:p,tune:t}=phoneSelection(original);
  assert.equal(hasObservedStockV8(PRESETS[2]),false);
  const q=structuredClone(p);q.source.engineSettings.inductionMode='turbo';assert.equal(hasObservedStockV8(q),false);
  q.source.engineSettings.inductionMode='stock';q.source.build.boreMm=84;assert.equal(hasObservedStockV8(q),false);
  assert.ok(torqueAt(4079,{...t,boost:0},p)<torqueAt(4079,t,p));
  for(const point of dynoCurve(defaultTune(PRESETS[2]),PRESETS[2]))assert.ok(Number.isFinite(point.kw));
});
