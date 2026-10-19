import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {EngineAudio} from '../recorded-audio.js';
import {EngineDSP} from '../engine-dsp.mjs';
import {PACKAGE_PROFILES} from '../package-profiles.mjs';

const root=new URL('../',import.meta.url);
function decodeWav(arrayBuffer){
  const b=Buffer.from(arrayBuffer);assert.equal(b.toString('ascii',0,4),'RIFF');
  let offset=12;while(b.toString('ascii',offset,offset+4)!=='data')offset+=8+b.readUInt32LE(offset+4)+(b.readUInt32LE(offset+4)%2);
  const length=b.readUInt32LE(offset+4)/2,samples=Float32Array.from({length},(_,i)=>b.readInt16LE(offset+8+i*2)/32768);
  return {sampleRate:b.readUInt32LE(24),getChannelData:()=>samples};
}
const originalFetch=globalThis.fetch;
let bank;
try{
  globalThis.fetch=async url=>new Response(fs.readFileSync(new URL(url,root)));
  const audio=new EngineAudio();audio.context={decodeAudioData:async bytes=>decodeWav(bytes)};bank=await audio.loadBank();
  assert.deepEqual(audio.packageInfo,{version:'1.0.7',build:'14',engineClips:443,popClips:13,starterClips:5});
}finally{globalThis.fetch=originalFetch;}

function output(dsp,seconds=.5){
  const l=new Float32Array(Math.round(dsp.rate*seconds)),r=new Float32Array(l.length);dsp.render(l,r);
  assert.ok(l.every(Number.isFinite));assert.ok(r.every(Number.isFinite));
  const rms=Math.sqrt(l.reduce((s,v)=>s+v*v,0)/l.length),peak=l.reduce((m,v)=>Math.max(m,Math.abs(v)),0);
  assert.ok(peak<.851);return {l,r,rms,peak};
}
test('all packaged banks load through production loader with both sample rates and complete pitch-mark coverage',()=>{
  assert.deepEqual(Object.fromEntries(Object.entries(bank.families).map(([k,v])=>[k,v.clips.length])),{v8:109,v10:100,i4:196,diesel:38,pops:13,oneshots:5});
  for(const name of ['v8','v10','i4','diesel'])for(const clip of bank.families[name].clips){assert.ok(clip.grains.length>0);assert.ok(clip.sourceRpm>400&&clip.sourceRpm<7000);assert.ok(clip.grains.every(g=>g.every(Number.isFinite)));}
  for(const name of ['pops','oneshots'])assert.ok(bank.families[name].clips.every(c=>c.samples.length===c.length));
});
test('four source families and three modes produce audible, bounded, distinct audio',()=>{
  const takes=[];
  for(const [family,cylinders,rpm]of [['v8',8,750],['v10',10,3500],['i4',4,4000],['diesel',6,700]]){
    const d=new EngineDSP(48000,bank);d.setParams({profile:'package',family,cylinders,rpm,running:true,throttle:.5});const a=output(d);assert.ok(a.rms>.005);takes.push(a);
    d.setParams({profile:'recorded'});assert.ok(output(d).rms>.002);d.setParams({profile:'legacy'});assert.ok(output(d).rms>.002);
  }
  for(let i=1;i<takes.length;i++)assert.notDeepEqual(takes[i].l,takes[0].l);
});
test('nonuniform V10 events preserve packaged 54/90 degree gaps and average combustion rate',()=>{
  const angles=PACKAGE_PROFILES.v10.firing.map(e=>e.deg),d=new EngineDSP(48000,bank);
  d.setParams({profile:'package',family:'v10',cylinders:10,rpm:6000,running:true,firingAngles:angles});output(d,.5);
  assert.deepEqual(d.eventLog.slice(0,20),[...angles,...angles]);const before=d.fireIndex;output(d,1);assert.ok(Math.abs(d.fireIndex-before-500)<2);
});
test('starter is audible only with an active hold, honours mute, and fades after cancellation',()=>{
  for(const volume of [0,.55]){
    const d=new EngineDSP(48000,bank);d.setParams({profile:'package',family:'v8',starterKind:'v8',cranking:true,running:false,rpm:205,starterVolume:volume});
    const a=output(d);assert.ok(volume?a.rms>.004:a.rms<.000001);assert.equal(d.fireIndex,0);
    d.setParams({cranking:false,rpm:0});output(d,1);assert.ok(output(d,.1).rms<.000001);
  }
});
test('package overrun selects original transients, stops at zero amount, and main mute is silent',()=>{
  for(const amount of [0,.8]){
    const d=new EngineDSP(48000,bank);d.setParams({profile:'package',family:'v8',running:true,rpm:4000,throttle:1,popAmount:amount});output(d,.2);d.setParams({throttle:0,rpm:3000});output(d,.5);
    assert.ok(amount?d.popCount>0:d.popCount===0);
    d.setParams({volume:0});assert.equal(output(d,.1).rms,0);
  }
});
