import {PRESETS,Simulation,defaultTune,cleanTune,dynoCurve,clamp} from './physics.mjs';
import {World} from './scene.js';
import {EngineAudio} from './recorded-audio.js';
import {Cockpit} from './cockpit.js';
import {decodePhoneBackup,phoneSelection,decodeLabSave} from './phone-adapter.mjs';
import {PhoneUI} from './phone-ui.js';
const $=id=>document.getElementById(id),STORAGE='engine-lab-tune-v2';
let preset=PRESETS[0],tune=defaultTune(preset),mode='bench',world=null,race=null,pointerGas=false,pointerBrake=false,lastUpdate=0,lastSound=0,toastTimer;
let phoneLibrary=null,phoneSnapshot=0;
const keys=new Set(),audio=new EngineAudio();
const cockpit=new Cockpit({host:$('cockpitHost')});
cockpit.root.querySelector('.el-cycle-details').open=false;
try{const response=await fetch('./phone-data.json');if(response.ok){phoneLibrary=await response.json();({preset,tune}=phoneSelection(phoneLibrary));}}catch(e){console.warn('手机参数库未载入：'+e.message);}
try{const saved=JSON.parse(localStorage.getItem(STORAGE));if(saved)({preset,tune}=decodeLabSave(saved));}catch{}
if(new URLSearchParams(location.search).get('reference')==='hellcat'&&phoneLibrary?.engines.some(e=>e.key==='hellcat')){phoneSnapshot=Math.min(1,phoneLibrary.snapshots.length-1);({preset,tune}=phoneSelection(phoneLibrary,'hellcat',phoneSnapshot));audio.setSettings({profile:'recorded',listener:'outside'},false);}
const sim=new Simulation(preset,tune);
sim.auto=preset.phone?preset.automatic:true;
const phoneUI=new PhoneUI(phoneLibrary,{getPreset:()=>preset,onSelect:choosePhone,onDialog:()=>keys.clear()});
phoneUI.snapshot=phoneSnapshot;
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2700);}
function rangeFill(el){el.style.setProperty('--fill',`${(el.value-el.min)/(el.max-el.min)*100}%`);}
function soundUI(){$('soundButton').classList.toggle('active',audio.enabled);$('soundButton').querySelector('span').textContent=audio.enabled?'声音开':'声音关';$('soundButton').setAttribute('aria-label',audio.enabled?'关闭声音':'开启声音');}
async function enableSound(){if(!audio.enabled){if(!await audio.enable())toast('声音未能启动：'+audio.error);soundUI();}}
function renderPresets(){
  $('presetList').innerHTML=PRESETS.map(p=>`<button class="preset ${p.id===preset.id?'active':''}" data-preset="${p.id}" aria-pressed="${p.id===preset.id}"><span class="preset-code">${p.short}</span><span><strong>${p.name.split(' · ')[0]}</strong><small>${p.litres.toFixed(1)}${p.boost>0?'T':'L'} / ${p.cylinders} CYLINDERS</small></span><span class="preset-arrow">↗</span></button>`).join('');
  $('presetList').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>choosePreset(b.dataset.preset)));
}
function choosePreset(id){
  const p=PRESETS.find(p=>p.id===id);if(!p)return;const running=sim.running;keys.clear();pointerGas=false;pointerBrake=false;preset=p;tune=defaultTune(p);sim.configure(p,tune);sim.reset();if(running)sim.start();race=null;$('throttle').value=0;rangeFill($('throttle'));
  world?.buildEngine(p,tune);world?.setMode(mode);syncTune();renderPresets();phoneUI.render();syncStatus();updateRaceUI();toast(`已装入 ${p.name}`);
}
function choosePhone(key,index=phoneSnapshot){
  const selected=phoneSelection(phoneLibrary,key,index),running=sim.running;phoneSnapshot=index;phoneUI.snapshot=index;preset=selected.preset;tune=selected.tune;keys.clear();pointerGas=false;pointerBrake=false;sim.configure(preset,tune);sim.reset();sim.auto=preset.automatic;if(running)sim.start();race=null;$('throttle').value=0;rangeFill($('throttle'));world?.buildEngine(preset,tune);world?.setMode(mode);syncTune();renderPresets();phoneUI.render();syncStatus();updateRaceUI();toast(`已载入手机参数：${preset.name}`);
}
function syncTune(){
  sim.configure(preset,tune);tune=sim.tune;
  const limits=preset.phone?{boost:[0,4,.01],redline:[Math.ceil((preset.idleRpm??600)*1.15),25000,1],ignition:[-20,30,.5],mass:[100,20000,1]}:{boost:[0,2.2,.1],redline:[5000,10000,100],ignition:[-8,15,1],mass:[850,2400,10]};
  for(const [key,[min,max,step]]of Object.entries(limits)){$(key).min=min;$(key).max=max;$(key).step=step;const captions=$(key).closest('.tune-field').querySelectorAll('.range-caption span');if(key==='boost')captions[1].textContent=max+' bar';if(key==='redline'||key==='mass'){captions[0].textContent=min.toLocaleString();captions[1].textContent=max.toLocaleString()+(key==='mass'?' kg':' r/min');}}
  for(const key of ['boost','redline','ignition','mass','exhaust']){$(key).value=tune[key];rangeFill($(key));}
  $('boostOutput').textContent=tune.boost.toFixed(preset.phone?2:1)+' bar';$('redlineOutput').textContent=Math.round(tune.redline).toLocaleString();$('ignitionOutput').textContent=(tune.ignition>0?'+':'')+tune.ignition+'°';$('massOutput').textContent=Math.round(tune.mass)+' kg';$('exhaustOutput').textContent=Math.round(tune.exhaust*100)+'%';
  document.querySelectorAll('.rpm-scale span').forEach((el,i)=>el.textContent=i===0?'0':(tune.redline*i/4000).toFixed(1).replace(/\.0$/,'')+'k');$('dynoMaxRpm').textContent=tune.redline.toLocaleString()+' r/min';document.querySelector('.dyno-foot span').textContent=(preset.idleRpm??800)+' r/min';
  $('specLitres').innerHTML=preset.litres.toFixed(1)+' <small>L</small>';$('engineCaption').textContent=preset.caption;
  $('viewCode').textContent=`${preset.short} · ${preset.litres.toFixed(1)}${preset.induction==='supercharger'?' SC':tune.boost>0?'T':'L'}`;
  $('stageCaption').querySelector('h2').textContent=preset.isRotary?'转子结构待补':preset.name;
  $('stageCaption').querySelector('span').textContent=`机械结构 / ${preset.cylinders} 缸`;
  $('phoneRawButton').disabled=!preset.phone;
  const peak=Math.max(...dynoCurve(tune,preset).map(p=>p.kw));$('specPower').innerHTML=Math.round(peak)+' <small>kW</small>';drawDyno();
}
function drawDyno(){
  const canvas=$('dynoChart'),w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;
  const dpr=Math.min(devicePixelRatio,2);canvas.width=w*dpr;canvas.height=h*dpr;const c=canvas.getContext('2d');c.scale(dpr,dpr);c.clearRect(0,0,w,h);
  c.strokeStyle='#324638';c.lineWidth=.6;
  for(let i=0;i<5;i++){const y=8+i*(h-16)/4;c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke();}
  for(let i=0;i<6;i++){const x=i*w/5;c.beginPath();c.moveTo(x,4);c.lineTo(x,h-8);c.stroke();}
  const curve=dynoCurve(tune,preset),maxNm=Math.max(...curve.map(v=>v.torque))*1.15,maxKw=Math.max(...curve.map(v=>v.kw))*1.15;
  for(const [key,max,col] of [['torque',maxNm,'#86c7b7'],['kw',maxKw,'#f4a66a']]){c.beginPath();curve.forEach((v,i)=>{const x=3+i*(w-6)/(curve.length-1),y=h-8-v[key]/max*(h-18);i?c.lineTo(x,y):c.moveTo(x,y);});c.strokeStyle=col;c.lineWidth=1.7;c.stroke();}
}
function syncStatus(){
  $('ignitionButton').classList.toggle('running',sim.running);$('ignitionLabel').textContent=sim.running?'关闭引擎':'启动引擎';$('liveDot').classList.toggle('on',sim.running);$('engineStatus').textContent=sim.running?'引擎运转中':'等待点火';
  $('autoButton').textContent=sim.auto?'自动挡':'手动挡';$('autoButton').classList.toggle('active',sim.auto);
}
async function ignition(){if(sim.running){sim.running=false;$('throttle').value=0;rangeFill($('throttle'));}else{sim.start();await enableSound();}syncStatus();}
function setMode(next){
  if(next===mode)return;mode=next;keys.clear();pointerGas=false;pointerBrake=false;Object.assign(sim,{speed:0,distance:0,runTime:0,zeroTo100:null,x:-2.15,heading:0,gear:1});race=null;world?.setMode(mode);
  $('throttle').value=0;rangeFill($('throttle'));
  document.querySelectorAll('[data-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.mode===mode);b.setAttribute('aria-pressed',b.dataset.mode===mode);});
  $('stageCaption').classList.toggle('hidden',mode==='drive');$('stageLabel').textContent=mode==='drive'?'PROVING GROUND':'ENGINE CUTAWAY';$('viewHint').textContent=mode==='drive'?'W 加速 · S 刹车 · A / D 转向 · R 重置':'鼠标拖动旋转 · 滚轮缩放';
  document.querySelector('.stage-tools').classList.toggle('hidden',mode==='drive');$('raceButton').classList.toggle('hidden',mode!=='drive');$('raceData').classList.toggle('hidden',mode!=='drive');$('stage').classList.toggle('drive',mode==='drive');
  updateRaceUI();toast(mode==='drive'?'试车场已就绪，按住 W 加速':'回到引擎实验室');
}
async function startRace(){
  if(mode!=='drive')setMode('drive');const auto=sim.auto;sim.reset();sim.auto=auto;sim.start();const rival=new Simulation(preset,defaultTune(preset));rival.start();
  race={state:'countdown',countdown:3,elapsed:0,rival,result:null};$('throttle').value=0;rangeFill($('throttle'));world?.setMode('drive');await enableSound();syncStatus();updateRaceUI();
}
function updateRaceUI(){
  const show=mode==='drive'&&race&&race.state!=='idle';$('raceOverlay').classList.toggle('hidden',!show||race.state==='running'&&race.elapsed>1.1);
  if(race?.state==='countdown'){$('raceCountdown').textContent=Math.ceil(race.countdown);$('raceLabel').textContent='400 米加速挑战';$('raceHint').textContent='倒计时结束后，按住 W 或油门';}
  else if(race?.state==='running'){$('raceCountdown').textContent='GO';$('raceHint').textContent='按住 W，把动力释放出来';}
  else if(race?.state==='finished'){$('raceLabel').textContent='400 米 · 完成';$('raceCountdown').textContent=race.result.time.toFixed(2)+'s';$('raceHint').textContent=`冲线 ${Math.round(race.result.speed)} km/h · ${race.result.won?'领先原厂对手':'原厂对手领先'} · 点击起跑再来一次`;}
  $('raceButton').textContent=race?.state==='running'?'重新起跑 ↺':'400 米起跑 ↗';
}
function updateUI(now){
  if(now-lastUpdate<55)return;lastUpdate=now;
  $('rpmValue').textContent=Math.round(sim.rpm).toLocaleString();$('gearValue').textContent=mode==='bench'?'N':sim.gear;$('speedValue').textContent=Math.round(sim.speed*3.6);$('torqueValue').textContent=Math.round(sim.torque);$('powerValue').textContent=Math.round(sim.power);$('boostValue').textContent=sim.boost.toFixed(2);$('tempValue').textContent=Math.round(sim.temperature)+'°C';$('healthValue').textContent=sim.health.toFixed(0)+'%';
  const bars=$('rpmBar').children,count=sim.rpm/tune.redline*32;for(let i=0;i<bars.length;i++)bars[i].classList.toggle('lit',i<count);
  const liveThrottle=sim.throttle*100;$('throttleOutput').textContent=Math.round(liveThrottle)+'%';$('gasPedal').classList.toggle('pressed',liveThrottle>85);$('brakePedal').classList.toggle('pressed',sim.brake>0);
  const risk=sim.knock>.05||tune.ignition>10||tune.boost>1.7;$('riskNote').textContent=risk?'激进调校：留意爆震与机械健康':'调校状态正常';$('riskNote').classList.toggle('warn',risk);
  $('statusNote').textContent=!sim.running?'按 I 点火，感受第一声轰鸣。':keys.has('KeyC')?'离合已分离':sim.rpm>tune.redline*.96?'已接近转速红线':mode==='bench'?'空挡试音 · 切到试车场释放动力':'直线试车 · 400 米挑战随时开始';
  $('raceTime').textContent=(race?.state==='finished'?race.result.time:race?.elapsed??sim.runTime).toFixed(2);$('raceDistance').textContent=Math.floor(race?Math.min(400,sim.distance):sim.distance);$('zero100').textContent=sim.zeroTo100?.toFixed(2)??'—';
  if(race)updateRaceUI();
}
function shift(dir){sim.auto=false;sim.shift(dir);syncStatus();}
function data(){return {version:1,preset:preset.id,tune:{...tune},...(preset.source?{phoneSource:preset.source}:{})};}
function save(){try{localStorage.setItem(STORAGE,JSON.stringify(data()));toast('调校已保存在这台电脑上');}catch{toast('浏览器无法保存，请使用导出 JSON');}}
function restoreData(raw){
  if(raw?.format==='noi-box-backup'){const next=decodePhoneBackup(raw,'导入的手机备份');phoneSelection(next);phoneLibrary=next;phoneSnapshot=0;phoneUI.setLibrary(next);choosePhone();return;}
  const selected=decodeLabSave(raw),wasRunning=sim.running;preset=selected.preset;tune=selected.tune;sim.configure(preset,tune);sim.reset();sim.auto=preset.phone?preset.automatic:true;if(wasRunning)sim.start();race=null;$('throttle').value=0;rangeFill($('throttle'));world?.buildEngine(preset,tune);renderPresets();phoneUI.render();syncTune();syncStatus();updateRaceUI();
}
for(const key of ['boost','redline','ignition','mass','exhaust'])$(key).addEventListener('input',()=>{const hadTurbo=tune.boost>0;tune[key]=Number($(key).value);syncTune();if(key==='boost'&&hadTurbo!==(tune.boost>0))world?.buildEngine(preset,tune);});
$('throttle').addEventListener('input',e=>rangeFill(e.target));
$('referenceButton').addEventListener('click',()=>{if(!phoneLibrary?.engines.some(e=>e.key==='hellcat')){toast('当前导入库没有 Hellcat，刷新页面可载入随附参数库');return;}choosePhone('hellcat',Math.min(1,phoneLibrary.snapshots.length-1));audio.setSettings({profile:'recorded',listener:'outside'});syncAudioControls();toast('录屏同款 Hellcat 已载入，点击启动后踩油门试听');});
function syncAudioControls(){
  $('soundProfile').value=audio.settings.profile;$('listenerPosition').value=audio.settings.listener;
  for(const [id,key] of [['masterVolume','volume'],['popsVolume','popAmount'],['inductionVolume','inductionVolume']]){$(id).value=Math.round(audio.settings[key]*100);$(id+'Output').textContent=$(id).value+'%';rangeFill($(id));}
  $('audioSourceBadge').textContent=audio.settings.profile==='recorded'?'真实录音颗粒':'合成波形对照';
}
for(const [id,key] of [['masterVolume','volume'],['popsVolume','popAmount'],['inductionVolume','inductionVolume']])$(id).addEventListener('input',()=>{audio.setSettings({[key]:Number($(id).value)/100});syncAudioControls();});
$('soundProfile').addEventListener('change',()=>{audio.setSettings({profile:$('soundProfile').value});syncAudioControls();});
$('listenerPosition').addEventListener('change',()=>{audio.setSettings({listener:$('listenerPosition').value});syncAudioControls();});
$('creditsButton').addEventListener('click',()=>{$('creditsDialog').showModal();keys.clear();});$('closeCredits').addEventListener('click',()=>$('creditsDialog').close());
$('ignitionButton').addEventListener('click',ignition);$('soundButton').addEventListener('click',async()=>{if(audio.enabled)audio.disable();else await enableSound();soundUI();});
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
$('cutawayButton').addEventListener('click',()=>{if(!world)return;world.setCutaway(!world.cutaway);$('cutawayButton').textContent=world.cutaway?'半剖':'完整';$('cutawayButton').classList.toggle('active',world.cutaway);});
$('slowButton').addEventListener('click',()=>{if(!world)return;world.slow=!world.slow;world.slowAngle=sim.angle;$('slowButton').classList.toggle('active',world.slow);toast(world.slow?'机械展示放慢，声音与动力保持实时':'恢复实时机械展示');});
$('cameraButton').addEventListener('click',()=>world?.resetCamera());$('autoButton').addEventListener('click',()=>{sim.auto=!sim.auto;syncStatus();});$('gearUp').addEventListener('click',()=>shift(1));$('gearDown').addEventListener('click',()=>shift(-1));$('raceButton').addEventListener('click',startRace);
function pedal(id,on,off){const e=$(id);e.addEventListener('pointerdown',event=>{e.setPointerCapture(event.pointerId);on();});for(const type of ['pointerup','pointercancel','lostpointercapture'])e.addEventListener(type,off);}
pedal('gasPedal',()=>pointerGas=true,()=>pointerGas=false);pedal('brakePedal',()=>pointerBrake=true,()=>pointerBrake=false);
$('resetTune').addEventListener('click',()=>{tune=defaultTune(preset);syncTune();world?.buildEngine(preset,tune);toast('已恢复当前引擎的原厂调校');});$('repairButton').addEventListener('click',()=>{sim.repair();toast('维修完成，温度与机械健康已恢复');});$('saveButton').addEventListener('click',save);
$('exportButton').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(data(),null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`engine-lab-${preset.id.replace(/[^a-z0-9_-]/gi,'-')}-tune.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);toast('调校已导出为 JSON');});
$('importButton').addEventListener('click',()=>$('importFile').click());$('importFile').addEventListener('change',async()=>{const f=$('importFile').files[0];if(!f)return;try{if(f.size>8*1024*1024)throw new Error('文件超过 8 MB');restoreData(JSON.parse((await f.text()).replace(/^\uFEFF/,'')));toast('调校已导入，点击保存可保留');}catch(e){toast('导入失败：'+e.message);}$('importFile').value='';});
for(const id of ['helpButton'])$(id).addEventListener('click',()=>{$('helpDialog').showModal();keys.clear();});for(const id of ['helpDone','closeHelp'])$(id).addEventListener('click',()=>$('helpDialog').close());
window.addEventListener('keydown',e=>{
  if($('helpDialog').open||$('sourceDialog').open||$('creditsDialog').open||e.target.tagName==='SELECT'||e.target.tagName==='TEXTAREA'||e.target.tagName==='INPUT'&&e.target.type!=='range')return;
  if(e.target.tagName==='INPUT'&&e.target.type==='range'&&e.code.startsWith('Arrow'))return;
  if(['KeyW','KeyS','KeyA','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyC','Space'].includes(e.code))e.preventDefault();
  if(!e.repeat){if(e.code==='KeyI')ignition();if(e.code==='KeyE')shift(1);if(e.code==='KeyQ')shift(-1);if(e.code==='KeyR'&&mode==='drive'){const running=sim.running;sim.reset();if(running)sim.start();race=null;world?.setMode('drive');updateRaceUI();toast('车辆已回到起点');}}
  keys.add(e.code);
});window.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>{keys.clear();pointerGas=false;pointerBrake=false;});
document.addEventListener('visibilitychange',()=>{audio.setPageVisible(!document.hidden);if(document.hidden){keys.clear();pointerGas=false;pointerBrake=false;audio.voice?.port.postMessage({running:false,rpm:0});}});
let previous=performance.now(),accumulator=0;
function frame(now){
  const dt=document.hidden?0:Math.min((now-previous)/1000,.06);previous=now;accumulator+=dt;
  const input={drive:mode==='drive',throttle:Math.max(Number($('throttle').value)/100,(pointerGas||keys.has('KeyW')||keys.has('ArrowUp'))?1:0),brake:(pointerBrake||keys.has('KeyS')||keys.has('ArrowDown')||keys.has('Space'))?1:0,steer:(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0),clutch:keys.has('KeyC')};
  while(accumulator>=1/120){
    const step=1/120;
    if(race?.state==='countdown'){
      race.countdown-=step;sim.step(step,{...input,drive:false});if(race.countdown<=0){race.state='running';sim.rpm=preset.idleRpm??1000;race.elapsed=0;}
    }else{
      const before=sim.distance;sim.step(step,input);
      if(race?.state==='running'){
        race.elapsed+=step;if(race.elapsed>.18)race.rival.step(step,{drive:true,throttle:1});
        if(sim.distance>=400){const fraction=(400-before)/Math.max(.000001,sim.distance-before);race.state='finished';race.result={time:race.elapsed-step+step*clamp(fraction,0,1),speed:sim.speed*3.6,won:race.rival.distance<400};$('throttle').value=0;rangeFill($('throttle'));toast('400 米完成！点击起跑可以再挑战一次');}
      }
    }
    accumulator-=step;
  }
  if(now-lastSound>40){lastSound=now;audio.update(sim);}world?.update(sim,dt,race);cockpit.update(sim,audio,mode);updateUI(now);requestAnimationFrame(frame);
}
$('rpmBar').innerHTML=Array.from({length:32},(_,i)=>`<i class="${i>=27?'red':''}"></i>`).join('');
renderPresets();phoneUI.render();syncTune();syncStatus();syncAudioControls();rangeFill($('throttle'));
try{world=new World($('viewport'));world.buildEngine(preset,tune);$('loading').classList.add('hidden');}catch(e){$('loading').textContent='三维画面未能启动，请用 Edge 或 Chrome 打开并启用硬件加速。';console.error(e);}
new ResizeObserver(drawDyno).observe($('dynoChart'));
window.engineLab={sim,audio,cockpit,get world(){return world;},getState:()=>({...sim.snapshot(),preset:preset.id,presetName:preset.name,cylinders:preset.cylinders,idleRpm:preset.idleRpm,gearCount:(preset.ratios?.length??7)-1,ratios:preset.ratios,finalDrive:preset.finalDrive,tireCircumferenceM:preset.tireCircumferenceM,sourceCount:phoneLibrary?.engines.length,tune:{...tune},mode,race:race?{state:race.state,elapsed:race.elapsed,result:race.result,rivalDistance:race.rival.distance}:null,sound:audio.enabled,audioReady:audio.ready,soundProfile:audio.settings.profile,audioState:audio.context?.state,audioRms:audio.rms()})};
requestAnimationFrame(frame);
