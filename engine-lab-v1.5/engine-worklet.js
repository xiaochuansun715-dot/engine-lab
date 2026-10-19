class EngineVoice extends AudioWorkletProcessor {
  constructor(){super();this.rpm=0;this.phase=0;this.crank=0;this.low=0;this.band=0;this.noise=0;this.amp=0;this.seed=14327;this.params={rpm:0,throttle:0,cylinders:4,exhaust:0.55,running:false};this.port.onmessage=e=>{this.params={...this.params,...e.data};};}
  process(inputs,outputs){
    const out=outputs[0][0],p=this.params;
    for(let i=0;i<out.length;i++){
      this.rpm+=(p.rpm-this.rpm)*0.0015;
      this.amp+=((p.running?0.13+0.60*p.throttle:0)-this.amp)*0.0012;
      const firing=Math.max(0,this.rpm)/120*p.cylinders;
      this.phase=(this.phase+firing/sampleRate)%1;this.crank=(this.crank+this.rpm/60/sampleRate)%1;
      this.seed^=this.seed<<13;this.seed^=this.seed>>>17;this.seed^=this.seed<<5;
      const noise=(this.seed>>>0)/2147483648-1;
      this.noise+=0.11*(noise-this.noise);
      const f=this.phase,tw=Math.PI*2;
      const pulse=Math.exp(-f*(10+p.exhaust*12))-1/(10+p.exhaust*12);
      const rumble=Math.sin(this.crank*tw)*0.16+Math.sin(this.crank*tw*2+0.2)*0.11;
      const note=Math.sin(f*tw)*0.28+Math.sin(f*tw*2+0.4)*0.13+Math.sin(f*tw*3)*0.06;
      const uneven=p.cylinders===8?0.85+0.15*Math.sin(this.crank*tw*0.5):1;
      const raw=(pulse*0.85+note+rumble+this.noise*(0.06+p.throttle*0.23))*uneven;
      const cutoff=0.05+p.exhaust*0.2+p.throttle*0.10;
      this.low+=(raw-this.low)*cutoff;this.band+=(this.low-this.band)*0.19;
      out[i]=Math.tanh((this.band*0.7+this.low*0.3)*this.amp*1.6)*0.66;
    }
    for(let ch=1;ch<outputs[0].length;ch++)outputs[0][ch].set(out);
    return true;
  }
}
registerProcessor('engine-voice',EngineVoice);
