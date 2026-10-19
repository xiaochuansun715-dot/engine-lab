import {ROAD_SURFACES} from './operating-state.mjs';
import {dynoCurve} from './physics.mjs';
import {hasObservedStockV8} from './reference-model.mjs';
const $=(root,q)=>root.querySelector(q);
const f=(v,d=0)=>Number.isFinite(v)?v.toFixed(d):'—';
const esc=v=>String(v??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const GAUGES=[
 ['动力','speed','车速','km/h',360,0,s=>s.speed*3.6],['动力','torque','实时扭矩','N·m',1000,0,s=>s.torque],
 ['动力','power','发动机功率','kW',800,0,s=>s.power],['动力','wheelPower','轮上功率','kW',700,0,s=>s.wheelPower],
 ['动力','load','发动机负荷','%',100,0,s=>s.operating.engineLoad*100],['动力','acceleration','纵向加速度','m/s²',15,1,s=>s.acceleration],
 ['动力','slip','离合转速差','RPM',8000,0,s=>s.clutchSlipRpm],
 ['温度与寿命','exhaust','排气温度','°C',1000,0,s=>s.operating.exhaustTemperatureC],['温度与寿命','intake','进气温度','°C',120,0,s=>s.operating.intakeTemperatureC],
 ['温度与寿命','gearOil','变速箱油温','°C',140,0,s=>s.operating.gearboxOilTemperatureC],['温度与寿命','oil','机油余量','%',100,0,s=>s.operating.oilPercent],
 ['温度与寿命','health','发动机健康','%',100,0,s=>s.health],['温度与寿命','knock','爆震强度','%',100,0,s=>s.knock*100],
 ['燃油与电气','lambda','混合气','λ',1.5,2,s=>s.operating.lambda],['燃油与电气','air','空气流量','g/s',300,0,s=>s.operating.intakeMassKgS*1000],
 ['燃油与电气','fuelRate','燃油消耗','L/h',150,1,s=>s.operating.fuelLph],['燃油与电气','fuel','燃油余量','L',60,1,s=>s.operating.fuelL],
 ['燃油与电气','voltage','电瓶 / 充电','V',16,1,s=>s.operating.voltage],['燃油与电气','advance','点火提前角','°BTDC',45,1,s=>s.operating.ignitionAdvanceDeg]
];
const BUILD_LABELS={cylinders:'缸数',layout:'排列',bankAngleDeg:'缸列夹角 °',firingStyle:'点火风格',boreMm:'缸径 mm',strokeMm:'行程 mm',rodRatio:'连杆行程比',idleRpm:'怠速 RPM',redlineRpm:'红线 RPM',volumetricEfficiency:'容积效率',induction:'进气形式',boostBar:'目标增压 bar',turboCount:'增压器数量',turboSize:'涡轮尺寸',turboResponse:'涡轮响应',intercoolerEfficiency:'中冷效率',compressionRatio:'压缩比',fuelOctane:'燃油 RON',fuelHeatingValueMjKg:'低位热值 MJ/kg',lambda:'目标 λ',ignitionBiasDeg:'点火倾向 °',coolingEfficiency:'冷却效率'};
export class Dashboard {
  constructor({host,cockpit,onPage,onTune,onLatest,onRawExport,canExportNative=()=>true}){
    Object.assign(this,{host,cockpit,onPage,onTune,onLatest,onRawExport,canExportNative,page:'driving'});
    this.tabs=document.createElement('nav');this.tabs.className='workspace-tabs';this.tabs.setAttribute('aria-label','原机工作区');
    this.tabs.innerHTML=['driving','workshop','vehicle'].map((id,i)=>`<button type="button" data-page="${id}" aria-pressed="${!i}">${['驾驶与仪表','发动机工坊','变速箱 · 车辆'][i]}</button>`).join('');
    host.closest('.main-column').prepend(this.tabs);
    this.maintenance=document.createElement('section');this.maintenance.className='operation-card';this.maintenance.setAttribute('aria-label','运行设置与维护');
    this.maintenance.innerHTML=`<div class="data-heading"><h3>运行设置与维护</h3><span data-maint="state">发动机已停止</span></div>
      <div class="maintenance-settings"><label><input type="checkbox" data-setting="lifeEnabled"> 寿命与损坏</label><label><input type="checkbox" data-setting="unlimitedFuel"> 无限燃油</label><label>油箱容量 <input type="number" data-setting="tankCapacityL" min="5" max="200" value="60"> L</label></div>
      <div class="resource-grid">${[['fuel','燃油','L'],['oil','机油','%'],['battery','电量','%'],['voltage','电压','V']].map(([id,label,unit])=>`<div><span>${label}</span><b data-maint="${id}">—</b><small>${unit}</small></div>`).join('')}</div>
      <div class="refill-buttons">${[['fuel','补充燃油'],['oil','补充机油'],['battery','电池充电'],['all','全部补给']].map(([id,label])=>`<button type="button" data-refill="${id}">${label}</button>`).join('')}</div><p class="data-note">完全熄火后可补给；保留温度、机械健康和行驶里程。</p>`;
    // Keep the original page order: four core gauges, driving controls,
    // maintenance, mechanical panel, waveform, then the nineteen small gauges.
    const cycle=cockpit.root.querySelector('.el-cycle-details');this.sharedControls=[];
    for(const selector of ['.controls','.drivetrain-note','.keyboard-note']){
      const el=document.querySelector(selector);if(el){this.sharedControls.push(el);cockpit.root.insertBefore(el,cycle);}
    }
    cockpit.root.insertBefore(this.maintenance,cycle);
    host.innerHTML=`<section data-panel="driving" class="data-page">
      <div class="data-heading"><h2>实时小表</h2><span>19 项 · 与主仪表共用状态</span></div>
      ${['动力','温度与寿命','燃油与电气'].map(group=>`<section class="gauge-group"><h3>${group}</h3><div class="data-gauges">${GAUGES.filter(g=>g[0]===group).map(([,id,label,unit,max])=>`<article class="data-gauge" data-gauge="${id}" aria-label="${label}"><div class="gauge-label">${label}</div><svg viewBox="0 0 120 108" aria-hidden="true"><path class="dial-track" d="M25 93 A50 50 0 1 1 95 93"/><path class="dial-ticks" d="M28 88l5-5 M13 59h7 M28 23l5 5 M60 8v8 M92 23l-5 5 M107 59h-7 M92 88l-5-5"/><line class="dial-needle" x1="60" y1="58" x2="60" y2="20"/><circle cx="60" cy="58" r="4"/><text x="19" y="103">0</text><text x="103" y="103">${max}</text></svg><strong>—</strong><small>${unit}</small></article>`).join('')}</div></section>`).join('')}
      <section class="operation-card"><div class="data-heading"><h2>速度为什么上不去？</h2><span data-live="reason">发动机尚未运行</span></div><dl class="diagnostic-grid">${[['rpm','当前转速','RPM'],['redlineSpeed','当前挡红线车速','km/h'],['driveForce','驱动力','N'],['tractionLimit','抓地上限','N'],['dragForce','风阻','N'],['rollingForce','滚阻','N'],['engineBrakeForce','发动机制动','N'],['slopeForce','坡度阻力','N'],['totalResistance','总阻力','N'],['clutchEngagement','离合结合度','%'],['clutchSlipRpm','离合转速差','RPM'],['brake','刹车','']].map(([id,label,unit])=>`<div><dt>${label}</dt><dd><b data-live="${id}">—</b><small>${unit}</small></dd></div>`).join('')}</dl></section>
      <section class="operation-card"><div class="data-heading"><h2>成绩记录</h2><span>当前试车</span></div><div class="performance-grid">${[['zero100','0–100','s'],['zero200','0–200','s'],['zero300','0–300','s'],['topSpeed','最高车速','km/h'],['peakPower','峰值功率','PS'],['highLoad','高负荷时间','s']].map(([id,label,unit])=>`<div><span>${label}</span><b data-live="${id}">—</b><small>${unit}</small></div>`).join('')}</div></section>
      <p class="data-note model-note">仪表与车辆共用本版近似模型。原机配置已接入，动态响应仍在迭代。</p></section>
      <section data-panel="workshop" class="data-page" hidden><div class="workspace-intro"><span>ENGINE WORKSHOP</span><h2>发动机工坊</h2><p>查看当前发动机的原始结构、原厂进气和材质记录。右侧开放调校可即时试车。</p><button type="button" data-action="latest">载入最新原机 V8</button></div><div data-workshop="content"></div><section class="operation-card"><div class="data-heading"><h3>备份与迁移</h3><span data-workshop="time"></span></div><p class="data-note">仓库内置处理后的参数，不含原始手机备份。本地导入备份后可在此导出；本版调校请用右侧“导出 JSON”。</p><button type="button" data-action="native-export">导出原始手机备份</button></section></section>
      <section data-panel="vehicle" class="data-page" hidden><div class="workspace-intro"><span>TRANSMISSION & VEHICLE</span><h2>变速箱 · 车辆</h2><p>调整后即时用于试车，切换界面会保留挡位与车速。</p></div><section class="operation-card"><div data-vehicle="fields" class="vehicle-fields"></div></section><section class="operation-card"><div class="data-heading"><h3>逐挡齿比</h3><span>车速为传动对应值</span></div><div class="gear-table" data-vehicle="ratios"></div><p class="data-note">红线车速由齿比、终传与轮胎周长计算；实际极速还取决于动力和道路阻力。</p></section><section class="operation-card"><div class="data-heading"><h3>路面与道路负载</h3><span data-road="slope">坡度 0.0%</span></div><div class="road-options">${Object.entries(ROAD_SURFACES).map(([id,r])=>`<button type="button" data-road-choice="${id}"><b>${r.label}</b><small>抓地 ${r.grip.toFixed(2)}× · 滚阻 ${r.rolling.toFixed(2)}×</small></button>`).join('')}</div><label class="road-load">道路负载 <input type="range" data-road="load" min="0" max="100" value="50"><output data-road="output">50%</output></label></section><p class="data-note model-note">自动换挡为空值时使用本版自动策略；当前 V8 对应 6984 / 3960 RPM。比例外推未取得原作全车型公式。</p></section>`;
    this.gaugeElements=Object.fromEntries([...host.querySelectorAll('[data-gauge]')].map(e=>[e.dataset.gauge,{root:e,value:$ (e,'strong'),needle:$(e,'.dial-needle')}]));
    this.autoButton=document.createElement('button');this.autoButton.type='button';this.autoButton.dataset.action='automatic';
    this.autoThresholds=document.createElement('p');this.autoThresholds.className='data-note';
    $(host,'[data-vehicle="fields"]').parentElement.append(this.autoButton,this.autoThresholds);
    this.dynoSummary=document.createElement('section');this.dynoSummary.className='operation-card';
    $(host,'[data-workshop="content"]').after(this.dynoSummary);
    this.live=Object.fromEntries([...host.querySelectorAll('[data-live]')].map(e=>[e.dataset.live,e]));
    this.tabs.addEventListener('click',event=>{const b=event.target.closest('[data-page]');if(b)this.selectPage(b.dataset.page);});
    host.addEventListener('click',e=>{
      const road=e.target.closest('[data-road-choice]');if(road&&this.sim)this.sim.operating.setRoad(road.dataset.roadChoice);
      if(e.target.closest('[data-action="latest"]'))this.onLatest();
      if(e.target.closest('[data-action="native-export"]'))this.onRawExport();
      if(e.target.closest('[data-action="automatic"]')&&this.sim)this.sim.auto=!this.sim.auto;
    });
    this.maintenance.addEventListener('click',e=>{const b=e.target.closest('[data-refill]');if(b&&this.sim)this.sim.operating.refill(b.dataset.refill,this.sim);});
    this.maintenance.addEventListener('change',e=>{const k=e.target.dataset.setting;if(!k||!this.sim)return;if(k==='tankCapacityL')this.sim.operating.setTankCapacity(Number(e.target.value));else this.sim.operating[k]=e.target.checked;});
    host.addEventListener('change',e=>this.changeVehicle(e.target));
    $(host,'[data-road="load"]').addEventListener('input',e=>{if(this.sim)this.sim.operating.roadLoad=Number(e.target.value);});
  }
  selectPage(page){
    if(!['driving','workshop','vehicle'].includes(page))return;
    this.page=page;
    for(const b of this.tabs.querySelectorAll('[data-page]'))b.setAttribute('aria-pressed',String(b.dataset.page===page));
    for(const el of this.host.querySelectorAll('[data-panel]'))el.hidden=el.dataset.panel!==page;
    this.onPage(page);
  }
  setMode(mode){
    this.tabs.hidden=mode==='drive';this.host.hidden=mode==='drive';
    if(mode==='drive'){this.selectPage('driving');for(const el of this.sharedControls)this.host.closest('.main-column').insertBefore(el,this.cockpit.host);}
    else for(const el of this.sharedControls)this.cockpit.root.insertBefore(el,this.maintenance);
  }
  renderConfig(sim){
    const p=sim.preset,source=p.source??{},b=source.build,settings=source.engineSettings??{},summary=p.effectiveInductionSummary;
    const grid=(entries)=>`<dl class="config-grid">${entries.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
    const summaryText=summary?`原厂 · ${summary.count} × 涡轮 · 原作摘要最高 ${summary.displayedMaxBar} bar`:(settings.inductionMode==='stock'?'原厂模式；该车型的生效进气细节尚待核对':`开放调校 · ${p.induction} · 目标 ${f(sim.tune.boost,2)} bar`);
    const reinforcementLabels={piston:'活塞强化',connectingRod:'连杆强化',crankshaft:'曲轴强化',block:'缸体强化',valvetrain:'气门机构',coolingSystem:'冷却强化',fuelSystem:'供油强化',inductionSystem:'增压强化',invinciblePackage:'无敌强化'};
    const material=(value,type)=>value==='oem'?({piston:'原厂铝合金',seal:'原厂密封',bearing:'双金属轴瓦'}[type]):value??'—';
    const display={v:'V型',inline:'直列',boxer:'水平对置',w:'W型',even:'均匀点火',turbo:'涡轮',supercharger:'机械增压',na:'自然吸气'};
    $(this.host,'[data-workshop="content"]').innerHTML=`<section class="operation-card"><div class="data-heading"><h3>${esc(p.name)}</h3><span>${f(p.litres,2)} L · ${p.short}</span></div><div class="intake-summary"><b>当前生效进气记录</b><p>${esc(summaryText)}</p>${summary?'<small>原作摘要的压力定义尚待核验。</small>':''}</div></section><section class="operation-card"><div class="data-heading"><h3>开放调校原始表单</h3><span>备份记录</span></div>${b?grid(Object.entries(BUILD_LABELS).filter(([k])=>k in b).map(([k,label])=>[label,display[b[k]]??b[k]])):'<p class="data-note">当前为本版基础引擎，未选择手机备份。</p>'}<p class="data-note">表单记录与原厂生效摘要分别保留；右侧参数用于本版试车。</p></section><section class="operation-card"><div class="data-heading"><h3>部件材质与强化</h3><span>备份记录</span></div>${grid([['活塞材质',material(settings.componentMaterials?.piston,'piston')],['密封材质',material(settings.componentMaterials?.seal,'seal')],['轴瓦材质',material(settings.componentMaterials?.bearing,'bearing')],['寿命档位',settings.durabilityMode==='demo'?'正常':settings.durabilityMode??'—'],...Object.entries(settings.reinforcement??{}).map(([k,v])=>[reinforcementLabels[k]??k,typeof v==='boolean'?(v?'开启':'关闭'):v+'×'])])}</section>`;
    $(this.host,'[data-workshop="time"]').textContent=source.exportedAt?new Date(source.exportedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}):'未关联原生导出';
    const specs=[['finalDrive','终传',p.finalDrive??3.55,.3,30,.01],['tireCircumferenceM','轮胎周长 m',p.tireCircumferenceM??2.105,.5,10,.01],['efficiency','传动效率',p.efficiency??.9,.5,1,.01],['mass','整车质量 kg',sim.tune.mass,100,20000,1],['dragArea','风阻面积 m²',p.dragArea??.686,.1,15,.01],['tractionCoeff','抓地系数 μ',p.tractionCoeff??1.08,.2,2,.01],['shiftDuration','换挡时长 ms',(p.shiftDuration??.32)*1000,50,2000,1],['launchRpm','弹射转速 RPM',p.launchRpm??2400,p.idleRpm??600,sim.tune.redline,1],['speedLimiterKph','电子限速 km/h',p.speedLimiterKph||'',0,1000,1],['upshiftRpm','自动升挡 RPM',p.upshiftRpm??'',0,25000,1],['downshiftRpm','自动降挡 RPM',p.downshiftRpm??'',0,25000,1]];
    $(this.host,'[data-vehicle="fields"]').innerHTML=specs.map(([id,label,value,min,max,step])=>`<label>${label}<input type="number" data-vehicle-key="${id}" value="${value}" min="${min}" max="${max}" step="${step}" ${['upshiftRpm','downshiftRpm'].includes(id)?'placeholder="自动计算"':''}></label>`).join('');
    $(this.host,'[data-vehicle="ratios"]').innerHTML='<div class="gear-row heading"><span>挡位</span><span>齿比</span><span>总比</span><span>红线车速</span></div>'+Array.from({length:sim.gearCount},(_,i)=>`<div class="gear-row"><b>${i+1}</b><input type="number" aria-label="${i+1}挡齿比" data-ratio="${i+1}" min=".01" max="99" step=".01" value="${(p.ratios??[0,3.35,2.15,1.57,1.21,1,.82])[i+1]}"><span data-total="${i+1}">—</span><span data-gearspeed="${i+1}">—</span></div>`).join('');
  }
  changeVehicle(input){
    const s=this.sim;if(!s)return;const p=s.preset,k=input.dataset.vehicleKey,value=Number(input.value);
    if(input.dataset.ratio){
      if(!input.checkValidity()||value<=0)return;
      p.ratios??=[0,3.35,2.15,1.57,1.21,1,.82];p.ratios[Number(input.dataset.ratio)]=value;
      return;
    }
    if(!k||!input.checkValidity())return;
    if(input.value===''&&!['speedLimiterKph','upshiftRpm','downshiftRpm'].includes(k))return;
    if(k==='mass'){this.onTune('mass',value);return;}
    const optional=['upshiftRpm','downshiftRpm'].includes(k),next=input.value===''?(optional?null:0):value;
    p[k]=k==='shiftDuration'?value/1000:next;
  }
  update(sim,now){
    this.sim=sim;const exportButton=this.host.querySelector('[data-action="native-export"]');exportButton.disabled=!this.canExportNative();exportButton.title=exportButton.disabled?'本地导入原始手机备份后可导出':'导出本地导入的原始手机备份';if(now-(this.last??-1000)<100)return;this.last=now;
    const p=sim.preset,o=sim.operating,identity=p.id+'|'+(p.source?.exportedAt??'')+'|'+sim.gearCount;
    if(identity!==this.identity){this.identity=identity;this.renderConfig(sim);}
    const curveId=identity+'|'+JSON.stringify(sim.tune);
    if(curveId!==this.curveId){this.curveId=curveId;const curve=dynoCurve(sim.tune,p),power=curve.reduce((a,b)=>a.kw>b.kw?a:b),torque=curve.reduce((a,b)=>a.torque>b.torque?a:b);this.dynoSummary.innerHTML=`<div class="data-heading"><h3>预测测功</h3><span>当前调校</span></div><div class="performance-grid"><div><span>峰值功率</span><b>${f(power.kw/.73549875)}</b><small>PS</small><span>@ ${f(power.rpm)} RPM</span></div><div><span>峰值扭矩</span><b>${f(torque.torque)}</b><small>N·m</small><span>@ ${f(torque.rpm)} RPM</span></div><div><span>轮上峰值</span><b>${f(power.kw*(p.efficiency??.9)/.73549875)}</b><small>PS</small></div></div><p class="data-note">${hasObservedStockV8(p)?'V8 峰值以原机界面为约束构造；中间曲线和改装响应仍为近似。':'本版估算曲线，尚待该车型原机实测校准。'}</p>`;}
    for(const [,id,label,unit,max,digits,get] of GAUGES){const el=this.gaugeElements[id],value=get(sim);el.value.textContent=f(value,digits);el.root.setAttribute('aria-label',`${label} ${f(value,digits)} ${unit}`);el.needle.style.transform=`rotate(${-135+Math.max(0,Math.min(1,value/(id==='fuel'?o.tankCapacityL:max)))*270}deg)`;}
    for(const [id,value]of Object.entries({fuel:f(o.fuelL,1),oil:f(o.oilPercent),battery:f(o.batteryPercent),voltage:f(o.voltage,1),state:sim.running?'运行中 · 补给暂不可用':sim.cranking?'启动中 · 补给暂不可用':sim.rpm>=5?'等待完全停转':'发动机已停止'}))$(this.maintenance,`[data-maint="${id}"]`).textContent=value;
    for(const b of this.maintenance.querySelectorAll('[data-refill]'))b.disabled=!o.canRefill(sim);
    for(const input of this.maintenance.querySelectorAll('[data-setting]')){const k=input.dataset.setting;if(input.type==='checkbox')input.checked=o[k];else if(document.activeElement!==input)input.value=o[k];}
    const reason=!sim.running?'发动机未运行，请长按启动':sim.neutral?'当前空挡，动力未传到车轮':sim.shiftTimer>0?'正在换挡，动力暂时中断':sim.clutchEngagement===0?'离合未结合':sim.brake>0?'刹车已按下':p.speedLimiterKph>0&&sim.speed*3.6>=p.speedLimiterKph?'达到电子限速':'动力已接通，留意转速与道路阻力';
    const currentRedline=sim.neutral?null:sim.tune.redline*(p.tireCircumferenceM??2.105)*60/(sim.totalRatio*1000);
    const values={reason,rpm:f(sim.rpm),redlineSpeed:f(currentRedline,1),driveForce:f(sim.driveForce),tractionLimit:f(sim.tractionLimit),dragForce:f(sim.dragForce),rollingForce:f(sim.rollingForce),engineBrakeForce:f(sim.engineBrakeForce),slopeForce:f(sim.slopeForce),totalResistance:f(sim.totalResistance),clutchEngagement:f(sim.clutchEngagement*100),clutchSlipRpm:f(sim.clutchSlipRpm),brake:sim.brake>0?'已按下':'未按下',zero100:f(sim.zeroTo100,2),zero200:f(o.zeroTo200,2),zero300:f(o.zeroTo300,2),topSpeed:f(o.topSpeedKph),peakPower:f(o.peakPowerPs),highLoad:f(o.highLoadSeconds,1)};
    for(const [k,v]of Object.entries(values))this.live[k].textContent=v;
    for(const e of this.host.querySelectorAll('[data-total]')){const g=Number(e.dataset.total),total=(p.ratios??[0,3.35,2.15,1.57,1.21,1,.82])[g]*(p.finalDrive??3.55);e.textContent=f(total,2);$(this.host,`[data-gearspeed="${g}"]`).textContent=f(sim.tune.redline*(p.tireCircumferenceM??2.105)*60/total/1000)+' km/h';}
    for(const b of this.host.querySelectorAll('[data-road-choice]'))b.setAttribute('aria-pressed',String(b.dataset.roadChoice===o.roadSurface));
    this.autoButton.textContent=sim.auto?'自动换挡 · 开启':'自动换挡 · 关闭';this.autoButton.setAttribute('aria-pressed',String(sim.auto));
    this.autoThresholds.textContent=`当前升挡 ${f(sim.upshiftRpm)} RPM / 降挡 ${f(sim.downshiftRpm)} RPM · 留空使用自动策略`;
    $(this.host,'[data-road="slope"]').textContent='坡度 '+f(o.slopePercent,1)+'%';$(this.host,'[data-road="output"]').textContent=f(o.roadLoad)+'%';
    if(document.activeElement!==$(this.host,'[data-road="load"]'))$(this.host,'[data-road="load"]').value=o.roadLoad;
  }
}
