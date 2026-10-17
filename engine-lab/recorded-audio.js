const STORAGE='engine-lab-audio-v1',defaults={profile:'recorded',volume:.7,popAmount:.7,inductionVolume:.7,listener:'outside'};
const clamp=(v,a,b)=>Math.min(b,Math.max(a,Number.isFinite(Number(v))?Number(v):a));
export class EngineAudio {
  constructor(){this.context=null;this.voice=null;this.enabled=false;this.error=null;this.ready=false;this.visible=true;this.settings={...defaults};try{this.setSettings(JSON.parse(localStorage.getItem(STORAGE))||{},false);}catch{}}
  setSettings(next,persist=true){
    this.settings={...this.settings,...next};const s=this.settings;s.profile=s.profile==='legacy'?'legacy':'recorded';s.listener=s.listener==='inside'?'inside':'outside';
    for(const k of ['volume','popAmount','inductionVolume'])s[k]=clamp(s[k],0,1);if(persist)try{localStorage.setItem(STORAGE,JSON.stringify(s));}catch{}
  }
  async loadBank(){
    const response=await fetch('./audio/bank.json');if(!response.ok)throw new Error('录音参数未载入');const manifest=await response.json();
    const decode=async file=>{const r=await fetch('./audio/'+file);if(!r.ok)throw new Error('录音文件未载入');return this.context.decodeAudioData(await r.arrayBuffer());};const banks=[];
    for(const item of manifest.banks){const buffer=await decode(item.file),samples=buffer.getChannelData(0),ratio=buffer.sampleRate/manifest.sampleRate;banks.push({name:item.name,sourceHz:item.sourceHz,grains:item.grains.map(g=>samples.slice(Math.round(g.offset*ratio),Math.round((g.offset+g.length)*ratio)))});}
    const pop=await decode(manifest.overrun.file);return {banks,overrun:pop.getChannelData(0).slice()};
  }
  async enable(){
    try{
      if(!this.context){this.context=new AudioContext({latencyHint:'interactive'});this.initialising=(async()=>{const bank=await this.loadBank();await this.context.audioWorklet.addModule('./recorded-worklet.js');this.voice=new AudioWorkletNode(this.context,'recorded-engine-voice',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2],processorOptions:{bank}});this.voice.port.onmessage=e=>{if(e.data.ready)this.ready=true;};this.gain=this.context.createGain();this.gain.gain.value=0;this.analyser=this.context.createAnalyser();this.analyser.fftSize=2048;this.voice.connect(this.gain);this.gain.connect(this.analyser);this.analyser.connect(this.context.destination);})();}
      await this.initialising;await this.context.resume();this.gain.gain.setTargetAtTime(this.visible?1:0,this.context.currentTime,.06);this.enabled=true;this.error=null;return true;
    }catch(e){this.error=e.message;this.enabled=false;await this.context?.close().catch(()=>{});this.context=null;this.initialising=null;return false;}
  }
  disable(){if(this.gain)this.gain.gain.setTargetAtTime(0,this.context.currentTime,.05);this.enabled=false;}
  setPageVisible(visible){this.visible=visible;if(this.gain)this.gain.gain.setTargetAtTime(visible&&this.enabled?1:0,this.context.currentTime,.025);}
  update(sim){if(this.voice)this.voice.port.postMessage({...this.settings,rpm:sim.rpm,redline:sim.tune.redline,throttle:sim.throttle,cylinders:sim.preset.cylinders,running:sim.running&&this.visible,exhaust:sim.tune.exhaust,induction:sim.preset.induction??(sim.tune.boost>0?'turbo':'na'),boost:sim.boost});}
  rms(){if(!this.analyser)return 0;const samples=new Float32Array(this.analyser.fftSize);this.analyser.getFloatTimeDomainData(samples);return Math.sqrt(samples.reduce((s,v)=>s+v*v,0)/samples.length);}
}
