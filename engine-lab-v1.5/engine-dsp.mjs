// Independent renderer. Package mode uses extracted PCM and pitch marks;
// the original encrypted DSP method bodies have not been recovered.
const clamp=(v,a,b)=>Math.min(b,Math.max(a,Number.isFinite(v)?v:a)),TAU=Math.PI*2;
export class EngineDSP {
  constructor(rate=48000,bank={banks:[],overrun:null}){
    this.rate=rate;this.bank=bank;this.voices=[];this.pops=[];this.seed=14327;
    this.p={rpm:0,redline:7000,throttle:0,cylinders:8,running:false,cranking:false,exhaust:.55,induction:'na',boost:0,profile:'recorded',family:'v8',volume:.7,popAmount:.7,inductionVolume:.7,starterVolume:.55,listener:'outside'};
    this.rpm=0;this.amp=0;this.phase=0;this.crank=0;this.fireIndex=0;this.overrunTime=0;this.nextPop=0;this.popCount=0;this.blowoff=0;this.whinePhase=0;
    this.low=[0,0];this.dc=[0,0];this.legacyLow=0;this.legacyBand=0;this.legacyNoise=0;
    this.firingAngles=Array.from({length:8},(_,i)=>i*90);this.eventIndex=0;this.cycleDeg=0;this.eventLog=[];this.activeClip=null;this.starterPos=0;this.starterAmp=0;this.starterClip=null;this.engagePos=-1;
  }
  random(){let x=this.seed;x^=x<<13;x^=x>>>17;x^=x<<5;this.seed=x;return(x>>>0)/4294967296;}
  setParams(next){
    const previous=this.p;this.p={...previous,...next};const p=this.p;
    p.rpm=clamp(p.rpm,0,25200);p.redline=clamp(p.redline,500,25000);p.throttle=clamp(p.throttle,0,1);p.cylinders=Math.round(clamp(p.cylinders,1,16));p.volume=clamp(p.volume,0,1);p.popAmount=clamp(p.popAmount,0,1);p.inductionVolume=clamp(p.inductionVolume,0,1);p.starterVolume=clamp(p.starterVolume,0,1);
    const valid=Array.isArray(p.firingAngles)&&p.firingAngles.length===p.cylinders&&p.firingAngles.every((v,i,a)=>Number.isFinite(v)&&v>=0&&v<720&&(i===0||v>a[i-1]));
    const angles=valid?p.firingAngles:Array.from({length:p.cylinders},(_,i)=>i*720/p.cylinders),signature=angles.join(',');
    if(signature!==this.firingSignature){this.firingSignature=signature;this.firingAngles=angles;this.eventIndex=0;this.cycleDeg=0;this.voices=[];}
    const family=this.bank.families?.[p.family];
    if(family?.clips?.length){
      // Select by measured mark period. This routing and distance metric are our design.
      let best=Infinity;
      for(const clip of family.clips){const score=Math.abs(Math.log(Math.max(1,p.rpm)/Math.max(1,clip.sourceRpm)));if(score<best){best=score;this.activeClip=clip;}}
    }
    this.nextClip=null;
    const nextFamily=this.bank.families?.[p.familyNext];
    if(nextFamily?.clips?.length){let best=Infinity;for(const clip of nextFamily.clips){const score=Math.abs(Math.log(Math.max(1,p.rpm)/Math.max(1,clip.sourceRpm)));if(score<best){best=score;this.nextClip=clip;}}}
    const shots=this.bank.families?.oneshots?.clips;
    if(shots){this.starterClip=shots.find(c=>c.id==='starter.crank.'+p.starterKind)||shots.find(c=>c.id==='starter.crank');this.engageClip=shots.find(c=>c.id==='starter.engage');}
    if(p.cranking&&!previous.cranking){this.starterPos=0;this.engagePos=0;}
    if(p.running&&previous.throttle>.32&&p.throttle<previous.throttle-.25&&p.rpm>1800){this.overrunTime=.45+.4*p.popAmount;this.nextPop=.02;this.popCount=0;this.blowoff=p.induction==='turbo'?clamp(p.boost,0,2):0;}
    if(!p.running)this.overrunTime=0;
  }
  trigger(eventIndex=0){
    const p=this.p,rev=this.rpm/p.redline,activity=clamp(rev*.8+p.throttle*.55,0,1);
    if(p.profile==='package'&&this.activeClip?.grains?.length){
      const clip=this.nextClip&&this.random()<clamp(p.familyMix,0,1)?this.nextClip:this.activeClip,grains=clip.grains,grain=grains[this.fireIndex++%grains.length];
      const sourceHz=clip.sourceRpm*Math.max(1,clip.sampledCylinders)/120,targetHz=this.rpm*p.cylinders/120;
      const step=clamp(Math.pow(Math.max(.1,targetHz)/Math.max(1,sourceHz),.22),.72,1.65);
      const bank=p.firingBanks?.[eventIndex],pan=bank==='L'?-.28:bank==='R'?.28:p.cylinders>1?(eventIndex%2?.14:-.14):0;
      this.voices.push({samples:grain,pos:0,step,pan,gain:.94+this.random()*.12});
      if(this.voices.length>64)this.voices.shift();
      if(this.eventLog.length<128)this.eventLog.push(this.firingAngles[eventIndex]);
      return;
    }
    const mix=activity<.48?activity/.48:(activity-.48)/.52,lower=activity<.48?0:1;
    const bank=this.bank.banks[this.random()<mix?Math.min(lower+1,2):lower];
    if(!bank?.grains?.length)return;
    const grain=bank.grains[(this.fireIndex++)%bank.grains.length],step=.91+rev*.22,pan=p.cylinders>1?(this.fireIndex%2?-.22:.22):0;
    this.voices.push({samples:grain,pos:0,step,pan,gain:.94+this.random()*.12});
    if(this.voices.length>64)this.voices.shift();
  }
  render(left,right){
    const p=this.p,sr=this.rate,rpmSmoothing=1-Math.exp(-1/(sr*.014)),ampSmoothing=1-Math.exp(-1/(sr*.045));
    for(let i=0;i<left.length;i++){
      this.rpm+=(p.rpm-this.rpm)*rpmSmoothing;this.amp+=((p.running||p.cranking?1:0)-this.amp)*ampSmoothing;
      const rev=clamp(this.rpm/p.redline,0,1.15),firing=this.rpm/120*p.cylinders;
      this.phase+=firing/sr;if(this.phase>=1){this.phase-=Math.floor(this.phase);if(p.profile!=='package'&&p.running&&this.amp>.00001)this.trigger();}
      if(p.profile==='package'&&p.running&&this.rpm>1){
        this.cycleDeg+=this.rpm*6/sr;
        if(this.cycleDeg>=this.firingAngles[this.eventIndex]){
          this.trigger(this.eventIndex);this.eventIndex++;
          if(this.eventIndex>=this.firingAngles.length){this.eventIndex=0;this.cycleDeg-=720;}
        }
      }
      this.crank=(this.crank+this.rpm/60/sr)%1;const noise=this.random()*2-1;
      let l=0,r=0,weight=0;
      for(let v=this.voices.length-1;v>=0;v--){
        const voice=this.voices[v],j=Math.floor(voice.pos),s=voice.samples;
        if(j>=s.length-1){this.voices.splice(v,1);continue;}
        const frac=voice.pos-j,y=(s[j]+(s[j+1]-s[j])*frac)*voice.gain;
        l+=y*(1-voice.pan);r+=y*(1+voice.pan);const w=Math.sin(Math.PI*voice.pos/(s.length-1));weight+=w*w;voice.pos+=voice.step;
      }
      const norm=Math.max(.8,weight*.78);l/=norm;r/=norm;
      if(p.profile==='legacy'&&!p.cranking){
        this.legacyNoise+=.11*(noise-this.legacyNoise);const f=this.phase,sharpness=10+p.exhaust*12;
        const pulse=Math.exp(-f*sharpness)-1/sharpness,note=Math.sin(f*TAU)*.28+Math.sin(f*TAU*2+.4)*.13+Math.sin(f*TAU*3)*.06;
        const rumble=Math.sin(this.crank*TAU)*.16+Math.sin(this.crank*TAU*2+.2)*.11,raw=pulse*.85+note+rumble+this.legacyNoise*(.06+p.throttle*.23);
        this.legacyLow+=(raw-this.legacyLow)*(.05+p.exhaust*.2+p.throttle*.1);this.legacyBand+=(this.legacyLow-this.legacyBand)*.19;l=r=(this.legacyBand*.7+this.legacyLow*.3)*(.13+.6*p.throttle)*1.6;
      }else{
        const strength=.64+p.throttle*.6;l*=strength;r*=strength;const breathing=noise*(.005+p.throttle*.018)*rev*(p.running?1:0);l+=breathing;r+=breathing;
      }
      if(this.overrunTime>0&&p.running){
        this.overrunTime-=1/sr;this.nextPop-=1/sr;
        if(this.nextPop<=0&&this.popCount<5&&p.popAmount>.01&&this.bank.overrun){
          const clips=this.bank.families?.pops?.clips,samples=p.profile==='package'&&clips?.length?clips[Math.floor(this.random()*clips.length)].samples:this.bank.overrun;
          this.pops.push({samples,pos:0,step:.92+this.random()*.16,gain:p.popAmount*(.55+this.random()*.4)});this.nextPop=.045+this.random()*.16;this.popCount++;
        }
      }
      for(let v=this.pops.length-1;v>=0;v--){
        const pop=this.pops[v],j=pop.pos|0,s=pop.samples||this.bank.overrun;
        if(!s||j>=s.length-1){this.pops.splice(v,1);continue;}
        const frac=pop.pos-j,y=(s[j]+(s[j+1]-s[j])*frac)*pop.gain*.55;l+=y;r+=y*.92;pop.pos+=pop.step;
      }
      this.starterAmp+=((p.cranking?p.starterVolume:0)-this.starterAmp)*ampSmoothing;
      const starter=this.starterClip?.samples;
      if(starter?.length&&this.starterAmp>.000001){
        const j=Math.floor(this.starterPos)%starter.length,k=(j+1)%starter.length,frac=this.starterPos%1;
        const gain=Math.min(24,.12/Math.max(.005,this.starterClip.measuredRms||.04));
        const y=(starter[j]+(starter[k]-starter[j])*frac)*gain*this.starterAmp;
        l+=y;r+=y;this.starterPos=(this.starterPos+clamp(this.rpm/180,.65,1.55))%starter.length;
      }
      const engage=this.engageClip?.samples;
      if(p.cranking&&engage&&this.engagePos>=0&&this.engagePos<engage.length){const y=engage[Math.floor(this.engagePos)]*Math.min(16,.1/Math.max(.006,this.engageClip.measuredRms||.03))*p.starterVolume;l+=y;r+=y;this.engagePos++;}
      this.blowoff*=Math.exp(-1/(sr*.12));
      const whistleHz=p.induction==='supercharger'?this.rpm/60*7.8:2500+clamp(p.boost,0,3)*1100;
      this.whinePhase=(this.whinePhase+whistleHz/sr)%1;
      const whine=p.induction!=='na'?Math.sin(this.whinePhase*TAU)*p.inductionVolume*(p.induction==='supercharger'?.03:.012)*p.throttle*clamp(p.boost,0,2):0;
      const vent=noise*this.blowoff*.055*p.inductionVolume;l+=whine+vent;r+=whine+vent;
      const cabin=p.listener==='inside',cutoff=cabin?1250+rev*1200:2000+p.exhaust*3500+rev*3000;
      const a=1-Math.exp(-TAU*cutoff/sr),dcA=1-Math.exp(-TAU*30/sr),attenuation=this.amp*p.volume*(cabin?.82:1);
      this.low[0]+=(l-this.low[0])*a;this.low[1]+=(r-this.low[1])*a;this.dc[0]+=(this.low[0]-this.dc[0])*dcA;this.dc[1]+=(this.low[1]-this.dc[1])*dcA;
      left[i]=Math.tanh((this.low[0]-this.dc[0])*attenuation*1.45)*.85;if(right)right[i]=Math.tanh((this.low[1]-this.dc[1])*attenuation*1.45)*.85;
    }
  }
}
