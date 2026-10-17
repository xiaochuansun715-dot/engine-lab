export class EngineAudio {
  constructor(){this.context=null;this.voice=null;this.enabled=false;this.error=null;}
  async enable(){
    try{
      if(!this.context){
        this.context=new AudioContext({latencyHint:'interactive'});
        await this.context.audioWorklet.addModule('./engine-worklet.js');
        this.voice=new AudioWorkletNode(this.context,'engine-voice',{numberOfOutputs:1,outputChannelCount:[1]});
        this.gain=this.context.createGain();this.gain.gain.value=0.7;
        this.analyser=this.context.createAnalyser();this.analyser.fftSize=1024;
        this.voice.connect(this.gain);this.gain.connect(this.analyser);this.analyser.connect(this.context.destination);
      }
      await this.context.resume();this.gain.gain.setTargetAtTime(0.7,this.context.currentTime,0.06);this.enabled=true;this.error=null;return true;
    }catch(e){this.error=e.message;this.enabled=false;return false;}
  }
  disable(){if(this.gain)this.gain.gain.setTargetAtTime(0,this.context.currentTime,0.05);this.enabled=false;}
  update(sim){if(this.voice)this.voice.port.postMessage({rpm:sim.rpm,throttle:sim.throttle,cylinders:sim.preset.cylinders,running:sim.running,exhaust:sim.tune.exhaust});}
  rms(){if(!this.analyser)return 0;const samples=new Float32Array(this.analyser.fftSize);this.analyser.getFloatTimeDomainData(samples);return Math.sqrt(samples.reduce((s,v)=>s+v*v,0)/samples.length);}
}
