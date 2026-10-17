import {EngineDSP} from './engine-dsp.mjs';
class RecordedEngineVoice extends AudioWorkletProcessor {
  constructor(options){super();this.dsp=new EngineDSP(sampleRate,options.processorOptions?.bank);this.port.onmessage=e=>this.dsp.setParams(e.data);this.port.postMessage({ready:true,banks:this.dsp.bank.banks.length});}
  process(inputs,outputs){this.dsp.render(outputs[0][0],outputs[0][1]);return true;}
}
registerProcessor('recorded-engine-voice',RecordedEngineVoice);
