import {PRESETS,defaultTune,cleanTune} from './physics.mjs';
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const copy=x=>JSON.parse(JSON.stringify(x));
const number=(x,fallback)=>typeof x==='number'&&Number.isFinite(x)?x:fallback;
const bounded=(x,a,b,fallback)=>Math.min(b,Math.max(a,number(x,fallback)));
const text=(x,fallback='')=>typeof x==='string'?x.slice(0,180):fallback;
const engineFields=['name','cylinders','layout','bankAngleDeg','firingStyle','boreMm','strokeMm','rodRatio','compressionRatio','idleRpm','redlineRpm','volumetricEfficiency','induction','boostBar','turboCount','turboSize','turboResponse','intercoolerEfficiency','fuelOctane','fuelHeatingValueMjKg','lambda','ignitionBiasDeg','coolingEfficiency'];
const vehicleFields=['label','ratios','finalDrive','tireCircumferenceM','massKg','maxTorqueNm','dragArea','tractionCoeff','speedLimiterKph','topSpeedKph','efficiency'];
function pick(obj,fields){return Object.fromEntries(fields.filter(k=>Object.hasOwn(obj,k)).map(k=>[k,copy(obj[k])]));}
export function decodePhoneBackup(raw,label='手机备份'){
  if(!record(raw)||raw.format!=='noi-box-backup'||raw.version!==1||!record(raw.draft))throw new Error('不是支持的手机备份格式');
  const d=raw.draft,builds=d.engineBuildByEngine,vehicles=d.vehicleTuningByEngine;
  if(!record(builds)||!record(vehicles)||Object.keys(builds).length>512)throw new Error('发动机参数表不完整或超出范围');
  const engines=[];
  for(const [id,build] of Object.entries(builds)){
    if(!/^[a-zA-Z0-9_-]{1,140}$/.test(id)||!record(build))continue;
    const vehicle=vehicles[id];
    if(!record(vehicle)||!Array.isArray(vehicle.ratios))continue;
    engines.push({key:id,build:pick(build,engineFields),vehicle:pick(vehicle,vehicleFields),custom:d.engineBuildDirtyByEngine?.[id]===true});
  }
  if(!engines.length)throw new Error('备份里没有可读取的发动机');
  return {format:'engine-lab-phone-data',version:1,engines,snapshots:[{label:text(label,'手机备份'),engineType:text(d.engineType),values:record(d.values)?copy(d.values):{},automaticTransmission:record(d.automaticTransmission)?copy(d.automaticTransmission):{},acousticSettings:record(d.acousticSettings)?copy(d.acousticSettings):{},exhaustLayout:text(d.exhaustLayout),headerLayout:text(d.headerLayout),exportedAt:text(raw.exportedAt)}]};
}
export function phonePreset(item,snapshot={}){
  const b=item.build,v=item.vehicle;
  if(!record(b)||!record(v)||!Array.isArray(v.ratios))throw new Error('参数项结构无效');
  const cylinders=number(b.cylinders,0),redline=number(b.redlineRpm,0),idle=number(b.idleRpm,0);
  const ratios=v.ratios.map(x=>number(x,NaN));
  const geometryValid=number(b.boreMm,0)>=1&&number(b.boreMm,0)<=500&&number(b.strokeMm,0)>=1&&number(b.strokeMm,0)<=1000;
  const playable=Number.isInteger(cylinders)&&cylinders>=1&&cylinders<=16&&idle>=250&&redline>=idle*1.15&&redline<=25000&&geometryValid&&ratios.length>=2&&ratios.length<=25&&ratios[0]===0&&ratios.slice(1).every(x=>Number.isFinite(x)&&x>0&&x<100)&&['inline','v','boxer','w'].includes(b.layout);
  const litres=Math.PI/4*number(b.boreMm,0)**2*number(b.strokeMm,0)*cylinders/1e6;
  const rotary=/rotary|转子/i.test(item.key+' '+b.name);
  const ve=bounded(b.volumetricEfficiency,.1,1.5,.46),compression=bounded(b.compressionRatio,3,30,10.5);
  // Geometry-derived baseline is our estimate. vehicle.maxTorqueNm is retained,
  // never misrepresented as a measured engine torque curve.
  const torque=litres*95*(ve/.46)*Math.pow(compression/10.5,.16);
  const induction=['turbo','supercharger','na'].includes(b.induction)?b.induction:'na';
  const boost=induction==='na'?0:bounded(b.boostBar,0,4,0);
  const values=record(snapshot.values)?snapshot.values:{};
  const source={key:text(item.key),build:copy(b),vehicle:copy(v),custom:item.custom===true,values:copy(values),automaticTransmission:copy(snapshot.automaticTransmission||{}),acousticSettings:copy(snapshot.acousticSettings||{}),exhaustLayout:text(snapshot.exhaustLayout),headerLayout:text(snapshot.headerLayout)};
  return {id:'phone:'+item.key,sourceKey:item.key,phone:true,playable,blockedReason:playable?'':'自定义极限参数：原值已保留，超出当前互动展示范围',name:text(b.name,item.key),short:rotary?'ROT':b.layout==='inline'?'I'+cylinders:b.layout==='boxer'?'B'+cylinders:b.layout==='w'?'W'+cylinders:'V'+cylinders,cylinders,layout:rotary?'rotary':b.layout,sourceLayout:b.layout,isRotary:rotary,litres,torque,peak:Math.max(idle*1.5,redline*.62),redline,boost,mass:bounded(v.massKg,100,20000,1500),idleRpm:idle,boreMm:b.boreMm,strokeMm:b.strokeMm,rodRatio:bounded(b.rodRatio,1,3,1.7),bankAngleDeg:number(b.bankAngleDeg,b.layout==='boxer'?180:90),induction,ratios,finalDrive:bounded(v.finalDrive,.3,30,3.55),tireCircumferenceM:bounded(v.tireCircumferenceM,.5,10,2.105),dragArea:bounded(v.dragArea,.1,15,.686),tractionCoeff:bounded(v.tractionCoeff,.2,2,1.08),efficiency:bounded(v.efficiency,.5,1,.9),speedLimiterKph:number(v.speedLimiterKph,0),shiftDuration:bounded(snapshot.automaticTransmission?.shiftDurationMs,50,2000,320)/1000,launchRpm:bounded(snapshot.automaticTransmission?.launchRpm,idle,Math.max(idle,Math.min(redline,20000)),Math.max(idle,2400)),automatic:snapshot.automaticTransmission?.mode!=='manual',color:b.layout==='inline'?0x77d6c5:b.layout==='boxer'?0x9dacf4:0xffaa53,caption:rotary?'原文件采用等效几何参数；转子三维结构暂待实机画面补齐。':'几何、转速与传动参数来自手机备份。动力曲线仍为独立估算。',source};
}
export function phoneSelection(library,key,snapshotIndex=0){
  if(library?.format!=='engine-lab-phone-data'||library.version!==1||!Array.isArray(library.engines)||library.engines.length>512)throw new Error('手机参数库格式无效');
  const snapshot=library.snapshots?.[snapshotIndex]||{},selected=key||snapshot.engineType,item=library.engines.find(e=>e.key===selected);
  if(!item)throw new Error('找不到选中的手机发动机');
  const preset=phonePreset(item,snapshot);
  if(!preset.playable)throw new Error(preset.blockedReason);
  const tune=cleanTune({...defaultTune(preset),ignition:number(item.build.ignitionBiasDeg,0)},preset);
  return {preset,tune};
}
export function decodeLabSave(raw){
  if(raw?.version!==1||!record(raw.tune))throw new Error('调校文件无效');
  let preset=PRESETS.find(p=>p.id===raw.preset);
  if(!preset&&raw.phoneSource){preset=phonePreset({key:raw.phoneSource.key,build:raw.phoneSource.build,vehicle:raw.phoneSource.vehicle,custom:raw.phoneSource.custom},{values:raw.phoneSource.values,acousticSettings:raw.phoneSource.acousticSettings,exhaustLayout:raw.phoneSource.exhaustLayout,headerLayout:raw.phoneSource.headerLayout,automaticTransmission:raw.phoneSource.automaticTransmission});}
  if(!preset||preset.phone&&!preset.playable)throw new Error('该发动机不支持互动展示');
  return {preset,tune:cleanTune(raw.tune,preset)};
}
