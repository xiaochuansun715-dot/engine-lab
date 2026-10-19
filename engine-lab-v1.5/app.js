import {PRESETS,Simulation,defaultTune,cleanTune,dynoCurve,clamp} from './physics.mjs';
import {World} from './scene.js';
import {EngineAudio} from './recorded-audio.js';
import {Cockpit} from './cockpit.js';
import {decodePhoneBackup,phoneSelection,decodeLabSave} from './phone-adapter.mjs';
import {PhoneUI} from './phone-ui.js';
import {Dashboard} from './dashboard.js';
const $=id=>document.getElementById(id),STORAGE='engine-lab-tune-v2';
let preset={...PRESETS[0]},tune=defaultTune(preset),mode='bench',world=null,race=null,pointerGas=false,pointerBrake=false,lastUpdate=0,lastSound=0,toastTimer;
let phoneLibrary=null,phoneSnapshot=0,bundledLibrary=null,latestSnapshotIndex=0,savedExtra=null;
const keys=new Set(),starterInputs=new Set(),audio=new EngineAudio();
const cockpit=new Cockpit({host:$('cockpitHost'),onGear:openGearDialog});
cockpit.root.querySelector('.el-cycle-details').open=false;
try{const response=await fetch('./phone-data.json');if(response.ok){phoneLibrary=await response.json();({preset,tune}=phoneSelection(phoneLibrary));}}catch(e){console.warn('手机参数库未载入：'+e.message);}
try{const response=await fetch('./phone-current-data.json');if(response.ok){const current=await response.json(),legacy=phoneLibrary;for(const item of current.engines){const previous=legacy?.engines.find(e=>e.key===item.key);if(item.key==='v8')item.displayName='大奔绿魔 GT';else if(previous)item.displayName=previous.build.name;}current.snapshots=[...(legacy?.snapshots??[]).map(s=>({...s,engines:legacy.engines})),...current.snapshots];phoneLibrary=current;latestSnapshotIndex=current.snapshots.length-1;phoneSnapshot=latestSnapshotIndex;({preset,tune}=phoneSelection(phoneLibrary,undefined,phoneSnapshot));}}catch(e){console.warn('最新原机备份未载入：'+e.message);}
bundledLibrary=phoneLibrary;
try{const saved=JSON.parse(localStorage.getItem(STORAGE));if(saved){({preset,tune}=decodeLabSave(saved));savedExtra=saved;}}catch{}
if(new URLSearchParams(location.search).get('reference')==='hellcat'&&phoneLibrary?.engines.some(e=>e.key==='hellcat')){phoneSnapshot=Math.min(1,phoneLibrary.snapshots.length-1);({preset,tune}=phoneSelection(phoneLibrary,'hellcat',phoneSnapshot));audio.setSettings({profile:'package',listener:'outside'},false);}
if(new URLSearchParams(location.search).get('reference')==='hellcat')savedExtra=null;
if(new URLSearchParams(location.search).get('reference')==='v8'&&phoneLibrary?.engines.some(e=>e.key==='v8')){phoneSnapshot=latestSnapshotIndex;({preset,tune}=phoneSelection(phoneLibrary,'v8',phoneSnapshot));savedExtra=null;}
const sim=new Simulation(preset,tune);
sim.auto=preset.phone?preset.automatic:true;
sim.selectGear(0);
applyExtraSettings(savedExtra);
const phoneUI=new PhoneUI(phoneLibrary,{getPreset:()=>preset,onSelect:choosePhone,onDialog:clearControls});
phoneUI.snapshot=phoneSnapshot;
const dashboard=new Dashboard({host:$('dashboardHost'),cockpit,onPage:page=>{clearControls();$('stage').hidden=mode==='bench'&&page!=='driving';$('cockpitHost').hidden=mode!=='bench'||page!=='driving';cockpit.setVisible(mode==='bench'&&page==='driving');},onTune:(key,value)=>{tune[key]=value;syncTune();},onLatest:chooseLatest,canExportNative:()=>!!phoneLibrary?.nativeBackup,onRawExport:()=>{if(!phoneLibrary?.nativeBackup){toast('当前库没有完整原生备份，请重新载入最新原机配置');return;}downloadJson(phoneLibrary.nativeBackup,'引擎模拟器-原始备份-20261019.json');}});
dashboard.update(sim,performance.now());
function chooseLatest(){if(!bundledLibrary)return;phoneLibrary=bundledLibrary;phoneUI.setLibrary(phoneLibrary);choosePhone('v8',latestSnapshotIndex);}
function attachDisplayNames(library){for(const item of library.engines){if(item.key==='v8'&&!item.custom&&item.build.cylinders===8&&item.build.boreMm===83&&item.build.strokeMm===92){item.displayName='大奔绿魔 GT';continue;}if(!/\uFFFD/.test(item.build.name??''))continue;const previous=bundledLibrary?.engines.find(e=>e.key===item.key);item.displayName=previous?.displayName??previous?.build.name??item.key;}return library;}
function downloadJson(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
function applyExtraSettings(raw){
  const o=sim.operating,settings=raw?.operatingSettings;
  o.setRoad(preset.source?.acousticSettings?.roadSurface??'smooth');const roadLoad=preset.source?.values?.roadLoad;o.roadLoad=Number.isFinite(roadLoad)?clamp(roadLoad,0,100):50;
  if(settings&&typeof settings==='object'){for(const key of ['lifeEnabled','unlimitedFuel'])if(typeof settings[key]==='boolean')o[key]=settings[key];if(Number.isFinite(settings.tankCapacityL))o.setTankCapacity(settings.tankCapacityL);if(Number.isFinite(settings.roadLoad))o.roadLoad=clamp(settings.roadLoad,0,100);o.setRoad(settings.roadSurface);}
  const v=raw?.vehicleSettings;if(!v||typeof v!=='object')return;
  if(typeof v.automatic==='boolean')sim.auto=v.automatic;
  const bounds={finalDrive:[.3,30],tireCircumferenceM:[.5,10],efficiency:[.5,1],dragArea:[.1,15],tractionCoeff:[.2,2],shiftDuration:[.05,2],launchRpm:[preset.idleRpm??600,tune.redline],speedLimiterKph:[0,1000],upshiftRpm:[250,25000],downshiftRpm:[250,25000]};
  for(const [key,[low,high]] of Object.entries(bounds)){if(Number.isFinite(v[key]))preset[key]=clamp(v[key],low,high);else if(v[key]===null&&['upshiftRpm','downshiftRpm'].includes(key))preset[key]=null;}
  if(Array.isArray(v.ratios)&&v.ratios.length>=2&&v.ratios.length<=25&&v.ratios[0]===0&&v.ratios.slice(1).every(r=>Number.isFinite(r)&&r>=.01&&r<=99))preset.ratios=[...v.ratios];
}
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2700);}
function rangeFill(el){el.style.setProperty('--fill',`${(el.value-el.min)/(el.max-el.min)*100}%`);}
function soundUI(){$('soundButton').classList.toggle('active',audio.enabled);$('soundButton').querySelector('span').textContent=audio.enabled?'声音开':'声音关';$('soundButton').setAttribute('aria-label',audio.enabled?'关闭声音':'开启声音');}
async function enableSound(){if(!audio.enabled){if(!await audio.enable())toast('声音未能启动：'+audio.error);soundUI();syncAudioControls();}}
function clearThrottle(){$('throttle').value=0;rangeFill($('throttle'));}
function clearControls(){
  keys.clear();pointerGas=false;pointerBrake=false;
  const pointers=[...starterInputs].filter(source=>source.startsWith('pointer:')).map(source=>Number(source.slice(8)));
  starterInputs.clear();sim.endCranking();clearThrottle();
  for(const id of pointers)if($('ignitionButton').hasPointerCapture(id))$('ignitionButton').releasePointerCapture(id);
  syncStatus();
}
function beginIgnition(source){
  if(starterInputs.has(source))return;
  const held=starterInputs.size>0;starterInputs.add(source);if(held)return;
  if(sim.running){sim.stop();keys.clear();pointerGas=false;pointerBrake=false;clearThrottle();}
  else if(sim.beginCranking())void enableSound();
  syncStatus();
}
function endIgnition(source){if(!starterInputs.delete(source))return;if(!starterInputs.size)sim.endCranking();syncStatus();}
function renderPresets(){
  $('presetList').innerHTML=PRESETS.map(p=>`<button class="preset ${p.id===preset.id?'active':''}" data-preset="${p.id}" aria-pressed="${p.id===preset.id}"><span class="preset-code">${p.short}</span><span><strong>${p.name.split(' · ')[0]}</strong><small>${p.litres.toFixed(1)}${p.boost>0?'T':'L'} / ${p.cylinders} CYLINDERS</small></span><span class="preset-arrow">↗</span></button>`).join('');
  $('presetList').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>choosePreset(b.dataset.preset)));
}
function choosePreset(id){
  const original=PRESETS.find(p=>p.id===id);if(!original)return;const p={...original};const running=sim.running;clearControls();preset=p;tune=defaultTune(p);sim.configure(p,tune);sim.reset();sim.selectGear(0);if(running)sim.start();race=null;
  world?.buildEngine(p,tune);world?.setMode(mode);syncTune();renderPresets();phoneUI.render();syncStatus();updateRaceUI();toast(`已装入 ${p.name}`);
}
function choosePhone(key,index=phoneSnapshot){
  const selected=phoneSelection(phoneLibrary,key,index),running=sim.running;clearControls();phoneSnapshot=index;phoneUI.snapshot=index;preset=selected.preset;tune=selected.tune;sim.configure(preset,tune);sim.reset();sim.selectGear(0);sim.auto=preset.automatic;applyExtraSettings(null);dashboard.identity=null;if(running)sim.start();race=null;world?.buildEngine(preset,tune);world?.setMode(mode);syncTune();renderPresets();phoneUI.render();syncStatus();updateRaceUI();toast(`已载入手机参数：${preset.name}`);
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
  for(const [key,max,col] of [['torque',maxNm,'#86c7b7'],['kw',maxKw,'#f4a66a']]){c.beginPath();curve.forEach((v,i)=>{const x=3+(v.rpm-curve[0].rpm)/Math.max(1,curve.at(-1).rpm-curve[0].rpm)*(w-6),y=h-8-v[key]/max*(h-18);i?c.lineTo(x,y):c.moveTo(x,y);});c.strokeStyle=col;c.lineWidth=1.7;c.stroke();}
}
function syncStatus(){
  const label=sim.running?'关闭引擎':sim.cranking?`启动中 ${Math.floor(sim.starterProgress*100)}%`:'长按启动';
  $('ignitionButton').classList.toggle('running',sim.running);$('ignitionButton').classList.toggle('cranking',sim.cranking);$('ignitionLabel').textContent=label;$('ignitionButton').setAttribute('aria-label',label);$('ignitionButton').setAttribute('aria-pressed',String(starterInputs.size>0));$('ignitionButton').title=sim.running?'按下关闭引擎':`按住约 ${sim.starterDurationSeconds} 秒启动，松开可取消（${preset.starterSource==='ipa-packaged-profile'?'包内配置时长':'本版交互时长'}）`;$('liveDot').classList.toggle('on',sim.running||sim.cranking);$('engineStatus').textContent=sim.running?'引擎运转中':sim.cranking?'启动中 · 继续按住':'等待点火';
  $('autoButton').textContent=sim.auto?'自动挡':'手动挡';$('autoButton').classList.toggle('active',sim.auto);
  $('ignitionButton').style.setProperty('--starter-progress',sim.starterProgress);
  syncGearControls();
}
function gearLabel(gear=sim.gear){return gear===0?'N':String(gear);}
function syncGearControls(){
  const select=$('gearSelect'),signature=(preset.ratios??[0,3.35,2.15,1.57,1.21,1,.82]).join(',');
  if(select.dataset.ratios!==signature){select.dataset.ratios=signature;select.replaceChildren(...Array.from({length:sim.gearCount+1},(_,gear)=>new Option(gear===0?'N 空挡':gear+' 挡',String(gear))));}
  select.value=String(sim.gear);$('neutralButton').classList.toggle('active',sim.neutral);$('neutralButton').setAttribute('aria-pressed',String(sim.neutral));
  $('gearDown').disabled=sim.gear===0;$('gearUp').disabled=sim.gear===sim.gearCount;
  $('gearRatio').textContent=sim.neutral?'动力断开':`总传动比 ${sim.totalRatio.toFixed(2)} · ${sim.gearCount} 挡`;
}
function chooseGear(gear){sim.auto=false;sim.selectGear(gear);syncStatus();}
function openGearDialog(){
  clearControls();const host=$('gearChoiceList');host.replaceChildren();
  for(let gear=0;gear<=sim.gearCount;gear++){
    const button=document.createElement('button');button.type='button';button.dataset.gear=String(gear);button.className=gear===sim.gear?'selected':'';
    button.setAttribute('aria-pressed',String(gear===sim.gear));button.setAttribute('aria-label',gear===0?'N 空挡':gear+' 挡');
    const title=document.createElement('strong'),detail=document.createElement('small');title.textContent=gearLabel(gear);detail.textContent=gear===0?'动力断开':`齿比 ${(preset.ratios??[0,3.35,2.15,1.57,1.21,1,.82])[gear].toFixed(2)}`;
    button.append(title,detail);button.addEventListener('click',()=>{chooseGear(gear);$('gearDialog').close();});host.append(button);
  }
  $('gearDialog').showModal();host.querySelector(`[data-gear="${sim.gear}"]`)?.focus();
}
function setMode(next){
  if(next===mode)return;clearControls();mode=next;race=null;world?.setMode(mode);
  document.querySelector('.main-column').classList.toggle('is-drive',mode==='drive');
  dashboard.setMode(mode);cockpit.setVisible(mode==='bench'&&dashboard.page==='driving');$('cockpitHost').hidden=mode!=='bench'||dashboard.page!=='driving';
  document.querySelectorAll('[data-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.mode===mode);b.setAttribute('aria-pressed',b.dataset.mode===mode);});
  $('stageCaption').classList.toggle('hidden',mode==='drive');$('stageLabel').textContent=mode==='drive'?'PROVING GROUND':'ENGINE CUTAWAY';$('viewHint').textContent=mode==='drive'?'W 加速 · S 刹车 · A / D 转向 · R 重置':'鼠标拖动旋转 · 滚轮缩放';
  document.querySelector('.stage-tools').classList.toggle('hidden',mode==='drive');$('raceButton').classList.toggle('hidden',mode!=='drive');$('raceData').classList.toggle('hidden',mode!=='drive');$('stage').classList.toggle('drive',mode==='drive');
  updateRaceUI();toast(mode==='drive'?'试车场已就绪，挂挡后按住 W 加速':'实验室同样支持挂挡与加载试车');
}
async function startRace(){
  clearControls();if(mode!=='drive')setMode('drive');const auto=sim.auto;sim.reset();sim.selectGear(0);sim.auto=auto;sim.start();const rival=new Simulation(preset,defaultTune(preset));rival.start();
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
  syncStatus();
  $('audioSourceBadge').textContent=audio.settings.profile==='package'?(audio.bankLabel??'IPA 原包音源'):audio.settings.profile==='recorded'?'昨晚录音对照':'合成波形对照';
  $('rpmValue').textContent=Math.round(sim.rpm).toLocaleString();$('gearValue').textContent=gearLabel();$('speedValue').textContent=Math.round(sim.speed*3.6);$('torqueValue').textContent=Math.round(sim.torque);$('powerValue').textContent=Math.round(sim.power);$('boostValue').textContent=sim.boost.toFixed(2);$('tempValue').textContent=Math.round(sim.temperature)+'°C';$('healthValue').textContent=sim.health.toFixed(0)+'%';
  const bars=$('rpmBar').children,count=sim.rpm/tune.redline*32;for(let i=0;i<bars.length;i++)bars[i].classList.toggle('lit',i<count);
  const liveThrottle=sim.throttle*100;$('throttleOutput').textContent=Math.round(liveThrottle)+'%';$('gasPedal').classList.toggle('pressed',liveThrottle>85);$('brakePedal').classList.toggle('pressed',sim.brake>0);
  const risk=sim.knock>.05||tune.ignition>10||tune.boost>1.7;$('riskNote').textContent=risk?'激进调校：留意爆震与机械健康':'调校状态正常';$('riskNote').classList.toggle('warn',risk);
  $('statusNote').textContent=sim.cranking?'继续按住启动按钮或 I，松开会取消。':!sim.running?'按住 I 或启动按钮点火。':sim.neutral?'N 空挡 · 动力断开；按 E 或 + 挂入 1 挡':keys.has('KeyC')?'离合已分离 · 动力断开':sim.shiftTimer>0?'正在换挡 · 动力中断':sim.rpm>tune.redline*.96?'已接近红线，升挡可继续提速':mode==='bench'?`${gearLabel()} 挡加载 · 模拟车速 ${Math.round(sim.speed*3.6)} km/h`:'直线试车 · 400 米挑战随时开始';
  $('raceTime').textContent=(race?.state==='finished'?race.result.time:race?.elapsed??sim.runTime).toFixed(2);$('raceDistance').textContent=Math.floor(race?Math.min(400,sim.distance):sim.distance);$('zero100').textContent=sim.zeroTo100?.toFixed(2)??'—';
  if(race)updateRaceUI();
}
function shift(dir){sim.auto=false;sim.shift(dir);syncStatus();}
function data(){return {version:1,preset:preset.id,tune:{...tune},...(preset.source?{phoneSource:preset.source}:{}),operatingSettings:{tankCapacityL:sim.operating.tankCapacityL,lifeEnabled:sim.operating.lifeEnabled,unlimitedFuel:sim.operating.unlimitedFuel,roadSurface:sim.operating.roadSurface,roadLoad:sim.operating.roadLoad},vehicleSettings:{automatic:sim.auto,...Object.fromEntries(['ratios','finalDrive','tireCircumferenceM','efficiency','dragArea','tractionCoeff','shiftDuration','launchRpm','speedLimiterKph','upshiftRpm','downshiftRpm'].filter(k=>preset[k]!==undefined).map(k=>[k,preset[k]]))}};}
function save(){try{localStorage.setItem(STORAGE,JSON.stringify(data()));toast('调校已保存在这台电脑上');}catch{toast('浏览器无法保存，请使用导出 JSON');}}
function restoreData(raw){
  clearControls();
  if(raw?.format==='noi-box-backup'){const next=attachDisplayNames(decodePhoneBackup(raw,'导入的手机备份'));phoneSelection(next);phoneLibrary=next;phoneSnapshot=0;phoneUI.setLibrary(next);choosePhone();return;}
  const selected=decodeLabSave(raw),wasRunning=sim.running;preset={...selected.preset};tune=selected.tune;sim.configure(preset,tune);sim.reset();sim.selectGear(0);sim.auto=preset.phone?preset.automatic:true;applyExtraSettings(raw);dashboard.identity=null;if(wasRunning)sim.start();race=null;$('throttle').value=0;rangeFill($('throttle'));world?.buildEngine(preset,tune);renderPresets();phoneUI.render();syncTune();syncStatus();updateRaceUI();
}
for(const key of ['boost','redline','ignition','mass','exhaust'])$(key).addEventListener('input',()=>{const hadTurbo=tune.boost>0;tune[key]=Number($(key).value);syncTune();if(key==='boost'&&hadTurbo!==(tune.boost>0))world?.buildEngine(preset,tune);});
$('throttle').addEventListener('input',e=>rangeFill(e.target));
$('referenceButton').addEventListener('click',()=>{if(!phoneLibrary?.engines.some(e=>e.key==='hellcat')){toast('当前导入库没有 Hellcat，刷新页面可载入随附参数库');return;}choosePhone('hellcat',Math.min(1,phoneLibrary.snapshots.length-1));audio.setSettings({profile:'package',listener:'outside'});syncAudioControls();toast('录屏同款 Hellcat 已载入，长按启动后踩油门试听');});
document.getElementById('phoneCurrent')?.addEventListener('click',chooseLatest);
function syncAudioControls(){
  $('soundProfile').value=audio.settings.profile;$('listenerPosition').value=audio.settings.listener;
  for(const [id,key] of [['masterVolume','volume'],['popsVolume','popAmount'],['inductionVolume','inductionVolume'],['starterVolume','starterVolume']]){if(!$(id))continue;$(id).value=Math.round((audio.settings[key]??.55)*100);$(id+'Output').textContent=$(id).value+'%';rangeFill($(id));}
  $('audioSourceBadge').textContent=audio.settings.profile==='package'?(audio.bankLabel??'IPA 原包音源'):audio.settings.profile==='recorded'?'昨晚录音对照':'合成波形对照';
}
for(const [id,key] of [['masterVolume','volume'],['popsVolume','popAmount'],['inductionVolume','inductionVolume'],['starterVolume','starterVolume']])$(id)?.addEventListener('input',()=>{audio.setSettings({[key]:Number($(id).value)/100});syncAudioControls();});
$('soundProfile').addEventListener('change',()=>{audio.setSettings({profile:$('soundProfile').value});syncAudioControls();});
$('listenerPosition').addEventListener('change',()=>{audio.setSettings({listener:$('listenerPosition').value});syncAudioControls();});
$('phoneVolumeButton').addEventListener('click',()=>{
  const values=preset.source?.values;
  if(!values){$('phoneVolumeNote').textContent='先选择手机参数库中的发动机。';return;}
  const next={},finite=value=>typeof value==='number'&&Number.isFinite(value);
  if(finite(values.masterVolume))next.volume=clamp(values.masterVolume/100,0,1);
  if(finite(values.pops))next.popAmount=clamp(values.pops/100,0,1);
  const inductionKey=preset.induction==='supercharger'?'supercharger':'turbo';
  if(finite(values[inductionKey]))next.inductionVolume=clamp(values[inductionKey]/100,0,1);
  audio.setSettings(next);syncAudioControls();$('phoneVolumeNote').textContent='已按百分比应用总音量、爆音与增压音量。其余声学项保留。';
});
$('creditsButton').addEventListener('click',()=>{clearControls();$('creditsDialog').showModal();});$('closeCredits').addEventListener('click',()=>$('creditsDialog').close());
$('ignitionButton').addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();$('ignitionButton').focus({preventScroll:true});$('ignitionButton').setPointerCapture(event.pointerId);beginIgnition('pointer:'+event.pointerId);});
for(const type of ['pointerup','pointercancel','lostpointercapture'])$('ignitionButton').addEventListener(type,event=>endIgnition('pointer:'+event.pointerId));
for(const type of ['keydown','keyup'])$('ignitionButton').addEventListener(type,event=>{if(!['Space','Enter','NumpadEnter'].includes(event.code))return;event.preventDefault();event.stopPropagation();if(type==='keyup')endIgnition('button:'+event.code);else if(!event.repeat)beginIgnition('button:'+event.code);});
$('ignitionButton').addEventListener('blur',()=>{for(const code of ['Space','Enter','NumpadEnter'])endIgnition('button:'+code);});
$('soundButton').addEventListener('click',async()=>{if(audio.enabled)audio.disable();else await enableSound();soundUI();});
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
$('cutawayButton').addEventListener('click',()=>{if(!world)return;world.setCutaway(!world.cutaway);$('cutawayButton').textContent=world.cutaway?'半剖':'完整';$('cutawayButton').classList.toggle('active',world.cutaway);});
$('slowButton').addEventListener('click',()=>{if(!world)return;world.slow=!world.slow;world.slowAngle=sim.angle;$('slowButton').classList.toggle('active',world.slow);toast(world.slow?'机械展示放慢，声音与动力保持实时':'恢复实时机械展示');});
$('cameraButton').addEventListener('click',()=>world?.resetCamera());$('autoButton').addEventListener('click',()=>{sim.auto=!sim.auto;syncStatus();});$('gearUp').addEventListener('click',()=>shift(1));$('gearDown').addEventListener('click',()=>shift(-1));$('raceButton').addEventListener('click',startRace);
$('gearSelect').addEventListener('change',()=>chooseGear(Number($('gearSelect').value)));$('neutralButton').addEventListener('click',()=>chooseGear(0));$('closeGear').addEventListener('click',()=>$('gearDialog').close());
function pedal(id,on,off){const e=$(id);e.addEventListener('pointerdown',event=>{e.setPointerCapture(event.pointerId);on();});for(const type of ['pointerup','pointercancel','lostpointercapture'])e.addEventListener(type,off);}
pedal('gasPedal',()=>pointerGas=true,()=>pointerGas=false);pedal('brakePedal',()=>pointerBrake=true,()=>pointerBrake=false);
$('resetTune').addEventListener('click',()=>{tune=defaultTune(preset);syncTune();world?.buildEngine(preset,tune);toast('已恢复当前引擎的原厂调校');});$('repairButton').addEventListener('click',()=>{sim.repair();toast('维修完成，温度与机械健康已恢复');});$('saveButton').addEventListener('click',save);
$('exportButton').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(data(),null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`engine-lab-${preset.id.replace(/[^a-z0-9_-]/gi,'-')}-tune.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);toast('调校已导出为 JSON');});
$('importButton').addEventListener('click',()=>{clearControls();$('importFile').click();});$('importFile').addEventListener('change',async()=>{clearControls();const f=$('importFile').files[0];if(!f)return;try{if(f.size>8*1024*1024)throw new Error('文件超过 8 MB');restoreData(JSON.parse((await f.text()).replace(/^\uFEFF/,'')));toast('调校已导入，点击保存可保留');}catch(e){toast('导入失败：'+e.message);}$('importFile').value='';});
for(const id of ['helpButton'])$(id).addEventListener('click',()=>{clearControls();$('helpDialog').showModal();});for(const id of ['helpDone','closeHelp'])$(id).addEventListener('click',()=>$('helpDialog').close());
window.addEventListener('keydown',e=>{
  if(e.code==='Tab'){clearControls();return;}
  if($('helpDialog').open||$('sourceDialog').open||$('creditsDialog').open||$('gearDialog').open||e.target.tagName==='SELECT'||e.target.tagName==='TEXTAREA'||e.target.tagName==='INPUT'&&e.target.type!=='range')return;
  if(e.target.closest?.('button')&&['Space','Enter','NumpadEnter'].includes(e.code))return;
  if(e.target.tagName==='INPUT'&&e.target.type==='range'&&e.code.startsWith('Arrow'))return;
  if(['KeyW','KeyS','KeyA','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyC','Space'].includes(e.code))e.preventDefault();
  if(!e.repeat){if(e.code==='KeyI'){e.preventDefault();beginIgnition('key:KeyI');}if(e.code==='KeyE')shift(1);if(e.code==='KeyQ')shift(-1);if(e.code==='KeyN')chooseGear(0);if(e.code==='KeyR'&&mode==='drive'){const running=sim.running;clearControls();sim.reset();sim.selectGear(0);if(running)sim.start();race=null;world?.setMode('drive');updateRaceUI();toast('车辆已回到起点');}}
  keys.add(e.code);
});window.addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='KeyI')endIgnition('key:KeyI');if(['Space','Enter','NumpadEnter'].includes(e.code))endIgnition('button:'+e.code);});
window.addEventListener('blur',clearControls);
document.addEventListener('visibilitychange',()=>{audio.setPageVisible(!document.hidden);if(document.hidden){clearControls();audio.voice?.port.postMessage({running:false,cranking:false,rpm:0});}});
let previous=performance.now(),accumulator=0;
function frame(now){
  const dt=document.hidden?0:Math.min((now-previous)/1000,.06);previous=now;accumulator+=dt;
  const input={drive:true,throttle:Math.max(Number($('throttle').value)/100,(pointerGas||keys.has('KeyW')||keys.has('ArrowUp'))?1:0),brake:(pointerBrake||keys.has('KeyS')||keys.has('ArrowDown')||keys.has('Space'))?1:0,steer:mode==='drive'?(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0):0,clutch:keys.has('KeyC')};
  while(accumulator>=1/120){
    const step=1/120;
    if(race?.state==='countdown'){
      race.countdown-=step;sim.step(step,{...input,drive:false});if(race.countdown<=0){race.state='running';sim.selectGear(1);sim.rpm=preset.idleRpm??1000;race.elapsed=0;}
    }else{
      const before=sim.distance;sim.step(step,input);
      if(race?.state==='running'){
        race.elapsed+=step;if(race.elapsed>.18)race.rival.step(step,{drive:true,throttle:1});
        if(sim.distance>=400){const fraction=(400-before)/Math.max(.000001,sim.distance-before);race.state='finished';race.result={time:race.elapsed-step+step*clamp(fraction,0,1),speed:sim.speed*3.6,won:race.rival.distance<400};$('throttle').value=0;rangeFill($('throttle'));toast('400 米完成！点击起跑可以再挑战一次');}
      }
    }
    accumulator-=step;
  }
  if(now-lastSound>40){lastSound=now;audio.update(sim);}if(!$('stage').hidden)world?.update(sim,dt,race);cockpit.update(sim,audio,mode);dashboard.update(sim,now);updateUI(now);requestAnimationFrame(frame);
}
$('rpmBar').innerHTML=Array.from({length:32},(_,i)=>`<i class="${i>=27?'red':''}"></i>`).join('');
renderPresets();phoneUI.render();syncTune();syncStatus();syncAudioControls();rangeFill($('throttle'));
try{world=new World($('viewport'));world.buildEngine(preset,tune);$('loading').classList.add('hidden');}catch(e){$('loading').textContent='三维画面未能启动，请用 Edge 或 Chrome 打开并启用硬件加速。';console.error(e);}
new ResizeObserver(drawDyno).observe($('dynoChart'));
window.engineLab={sim,audio,cockpit,get world(){return world;},getState:()=>({...sim.snapshot(),starterHeld:starterInputs.size>0,starterDurationSeconds:sim.starterDurationSeconds,starterTimingSource:preset.starterSource??'independent-fallback',preset:preset.id,presetName:preset.name,cylinders:preset.cylinders,idleRpm:preset.idleRpm,gearCount:(preset.ratios?.length??7)-1,ratios:preset.ratios,finalDrive:preset.finalDrive,tireCircumferenceM:preset.tireCircumferenceM,sourceCount:phoneLibrary?.engines.length,tune:{...tune},mode,race:race?{state:race.state,elapsed:race.elapsed,result:race.result,rivalDistance:race.rival.distance}:null,sound:audio.enabled,audioReady:audio.ready,soundProfile:audio.settings.profile,audioBankLabel:audio.bankLabel,packageInfo:audio.packageInfo,audioState:audio.context?.state,audioRms:audio.rms()})};
requestAnimationFrame(frame);
