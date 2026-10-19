const STORAGE='engine-lab-audio-v1',defaults={profile:'package',volume:.7,popAmount:.7,inductionVolume:.7,starterVolume:0,listener:'outside'};
const clamp=(v,a,b)=>Math.min(b,Math.max(a,Number.isFinite(Number(v))?Number(v):a));
export class EngineAudio {
  constructor(){this.context=null;this.voice=null;this.enabled=false;this.error=null;this.ready=false;this.visible=true;this.settings={...defaults};try{this.setSettings(JSON.parse(localStorage.getItem(STORAGE))||{},false);}catch{}}
  setSettings(next,persist=true){
    this.settings={...this.settings,...next};const s=this.settings;s.profile=['package','recorded','legacy'].includes(s.profile)?s.profile:'package';s.listener=s.listener==='inside'?'inside':'outside';
    for(const k of ['volume','popAmount','inductionVolume','starterVolume'])s[k]=clamp(s[k],0,1);if(persist)try{localStorage.setItem(STORAGE,JSON.stringify(s));}catch{}
  }
  async loadBank(){
    const response=await fetch('./audio/bank.json');if(!response.ok)throw new Error('录音参数未载入');const manifest=await response.json();
    const decode=async file=>{const r=await fetch('./audio/'+file);if(!r.ok)throw new Error('录音文件未载入');return this.context.decodeAudioData(await r.arrayBuffer());};const banks=[];
    for(const item of manifest.banks){const buffer=await decode(item.file),samples=buffer.getChannelData(0),ratio=buffer.sampleRate/manifest.sampleRate;banks.push({name:item.name,sourceHz:item.sourceHz,grains:item.grains.map(g=>samples.slice(Math.round(g.offset*ratio),Math.round((g.offset+g.length)*ratio)))});}
    const pop=await decode(manifest.overrun.file);
    const packageResponse=await fetch('./audio/package/manifest.json');if(!packageResponse.ok)throw new Error('IPA 音频资源未载入');
    const packageManifest=await packageResponse.json(),families={};
    await Promise.all(Object.entries(packageManifest.families).map(async([name,family])=>{
      const buffer=await decode('package/'+family.file),samples=buffer.getChannelData(0),ratio=buffer.sampleRate/family.sampleRate;
      const clips=family.clips.map(clip=>{
        const start=Math.round(clip.offset*ratio),end=Math.round((clip.offset+clip.length)*ratio),raw=samples.slice(start,end);
        // ESAB stores normalized PCM16 plus each clip's amplitude scale.
        // Retain that original scale before our own loudness treatment.
        for(let i=0;i<raw.length;i++)raw[i]*=clip.pcmScale??1;
        const measuredRms=Math.sqrt(raw.reduce((sum,v)=>sum+v*v,0)/Math.max(1,raw.length));
        const gain=Math.min(24,.14/Math.max(.005,measuredRms));
        const grains=[];
        for(let i=1;i<clip.marks.length-1;i++){
          const left=Math.round(clip.marks[i-1]*ratio),center=Math.round(clip.marks[i]*ratio),right=Math.min(raw.length,Math.round(clip.marks[i+1]*ratio));
          const grain=new Float32Array(Math.max(0,right-left));
          for(let j=0;j<grain.length;j++){const pos=j+left,phase=pos<=center?(pos-left)/Math.max(1,center-left):(right-pos)/Math.max(1,right-center);grain[j]=raw[pos]*Math.sin(Math.PI*.5*phase)**2*gain;}
          if(grain.length>2)grains.push(grain);
        }
        return {...clip,measuredRms,grains,samples:clip.marks.length?null:raw};
      });
      families[name]={clips};
    }));
    this.packageInfo={version:packageManifest.origin.version,build:packageManifest.origin.build,engineClips:['v8','v10','i4','diesel'].reduce((n,k)=>n+families[k].clips.length,0),popClips:families.pops.clips.length,starterClips:families.oneshots.clips.length};
    return {banks,overrun:pop.getChannelData(0).slice(),families};
  }
  async enable(){
    try{
      if(!this.context){this.context=new AudioContext({latencyHint:'interactive'});this.initialising=(async()=>{const bank=await this.loadBank();await this.context.audioWorklet.addModule('./recorded-worklet.js');this.voice=new AudioWorkletNode(this.context,'recorded-engine-voice',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2],processorOptions:{bank}});this.voice.port.onmessage=e=>{if(e.data.ready)this.ready=true;};this.gain=this.context.createGain();this.gain.gain.value=0;this.analyser=this.context.createAnalyser();this.analyser.fftSize=2048;this.voice.connect(this.gain);this.gain.connect(this.analyser);this.analyser.connect(this.context.destination);})();}
      await this.initialising;await this.context.resume();this.gain.gain.setTargetAtTime(this.visible?1:0,this.context.currentTime,.06);this.enabled=true;this.error=null;return true;
    }catch(e){this.error=e.message;this.enabled=false;await this.context?.close().catch(()=>{});this.context=null;this.initialising=null;return false;}
  }
  disable(){if(this.gain)this.gain.gain.setTargetAtTime(0,this.context.currentTime,.05);this.enabled=false;}
  setPageVisible(visible){this.visible=visible;if(this.gain)this.gain.gain.setTargetAtTime(visible&&this.enabled?1:0,this.context.currentTime,.025);}
  update(sim){
    const p=sim.preset,key=p.sourceKey||p.id,name=(p.name||'')+' '+key;
    const diesel=/diesel|柴油|cummins|duramax|tdi|6bt/i.test(name),bike=/motorcycle|摩托|yamaha|cb[46]|gsx|r1\b|h2\b|cbr|panigale|ducati|mt09/i.test(name);
    const family=diesel?'diesel':p.cylinders===8?'v8':p.cylinders<=4||p.isRotary?'i4':'v10';
    const familyNext=diesel?'i4':family==='v8'?'v10':null,familyMix=diesel?clamp((sim.rpm-1100)/700,0,1):family==='v8'?clamp((sim.rpm-1400)/600,0,1):0;
    const labels={v8:'V8 · Caprice',v10:'V10 · Audi R8',i4:'I4 · 190E',diesel:'柴油 · F350'};
    this.bankLabel=familyNext&&familyMix>.5?labels[familyNext]:labels[family];
    if(this.voice)this.voice.port.postMessage({...this.settings,family,familyNext,familyMix,starterKind:diesel?'diesel':bike?'bike':p.cylinders===8?'v8':'default',rpm:sim.rpm,redline:sim.tune.redline,throttle:sim.throttle,cylinders:p.cylinders,running:sim.running&&this.visible,cranking:!!sim.cranking&&this.visible,firingAngles:p.firingAngles,firingBanks:p.firing?.map(e=>e.bank),exhaust:sim.tune.exhaust,induction:p.induction??(sim.tune.boost>0?'turbo':'na'),boost:sim.boost});
  }
  rms(){if(!this.analyser)return 0;const samples=new Float32Array(this.analyser.fftSize);this.analyser.getFloatTimeDomainData(samples);return Math.sqrt(samples.reduce((s,v)=>s+v*v,0)/samples.length);}
}
