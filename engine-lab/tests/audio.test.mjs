import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {EngineDSP} from '../engine-dsp.mjs';
const root=new URL('../audio/',import.meta.url),manifest=JSON.parse(fs.readFileSync(new URL('bank.json',root)));
function wav(name){const b=fs.readFileSync(new URL(name,root));let offset=12;while(b.toString('ascii',offset,offset+4)!=='data')offset+=8+b.readUInt32LE(offset+4)+(b.readUInt32LE(offset+4)%2);const bytes=b.readUInt32LE(offset+4);return Float32Array.from({length:bytes/2},(_,i)=>b.readInt16LE(offset+8+i*2)/32768);}
const bank={banks:manifest.banks.map(b=>{const samples=wav(b.file);return{grains:b.grains.map(g=>samples.slice(g.offset,g.offset+g.length))};}),overrun:wav(manifest.overrun.file)};
function render(dsp,seconds=1){const l=new Float32Array(Math.round(dsp.rate*seconds)),r=new Float32Array(l.length);dsp.render(l,r);return{l,r,rms:Math.sqrt(l.reduce((s,v)=>s+v*v,0)/l.length),peak:l.reduce((m,v)=>Math.max(m,Math.abs(v)),0)};}
test('recorded stereo output is finite, bounded and distinct from synthetic output',()=>{
  const d=new EngineDSP(48000,bank);d.setParams({running:true,rpm:750,cylinders:8,throttle:.1});const a=render(d);
  assert.ok(a.rms>.005&&a.peak<.851);assert.ok(a.l.every(Number.isFinite));assert.ok(a.l.some((v,i)=>Math.abs(v-a.r[i])>.001));
  d.setParams({profile:'legacy'});const b=render(d);const diff=Math.sqrt(a.l.reduce((sum,v,i)=>sum+(v-b.l[i])**2,0)/a.l.length);assert.ok(diff>.01);
});
test('recorded firing event rate follows RPM and cylinder count',()=>{
  for(const [rpm,cylinders] of [[750,8],[6000,8],[12000,16],[800,1]]){
    const d=new EngineDSP(48000,bank);d.setParams({running:true,rpm,cylinders,throttle:.7,redline:Math.max(6200,rpm)});render(d,.5);const before=d.fireIndex;const a=render(d,1);
    assert.ok(Math.abs(d.fireIndex-before-rpm*cylinders/120)<2);assert.ok(a.l.every(Number.isFinite));assert.ok(a.peak<.851);assert.ok(d.voices.length<=64);
  }
});
test('overrun release creates bounded transients, zero setting suppresses them, shutdown fades out',()=>{
  for(const amount of [0,.8]){const d=new EngineDSP(48000,bank);d.setParams({running:true,rpm:4000,throttle:1,popAmount:amount});render(d,.4);d.setParams({rpm:3000,throttle:0});render(d,1);assert.ok(amount===0?d.popCount===0:d.popCount>0&&d.popCount<=5);d.setParams({running:false,rpm:0});render(d,1);assert.ok(render(d,.1).rms<.000001);}
});
