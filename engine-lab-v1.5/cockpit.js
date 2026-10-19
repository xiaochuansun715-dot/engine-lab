/* Exact package profiles use their declared firing phase. Geometry, gas colors and
   ideal valve opening remain illustrations rather than manufacturer measurements. */
import {CYCLE,createFiringSchedule,cylinderPhase,strokeState,crankKinematics,cylinderBanks} from './firing.mjs';
const TAU=Math.PI*2;
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const finite=(n,f=0)=>Number.isFinite(n)?n:f;
const mod=(n,d)=>((n%d)+d)%d;
const COLORS=['#ef7357','#aa91d5','#74b7e8','#d2bf6c'];
const STROKES=['做功','排气','进气','压缩'];
const fmt=new Intl.NumberFormat('zh-CN');

export class Cockpit {
  constructor({host,onNeutral,onGear}={}){
    if(typeof host==='string')host=document.querySelector(host);
    if(!(host instanceof Element))throw new TypeError('Cockpit requires a host element');
    this.host=host;this.onNeutral=onNeutral;this.onGear=onGear;this.visible=true;this.sizes=new Map();
    this.root=document.createElement('section');this.root.className='el-cockpit';
    this.root.setAttribute('aria-label','驾驶仪表与四冲程剖面');
    this.root.innerHTML=`
      <div class="el-cockpit-heading"><span>驾驶与仪表</span><span class="el-cockpit-status"><i></i><b>等待点火</b></span></div>
      <div class="el-instruments">
        <div class="el-tachometer"><canvas data-canvas="rpm" role="img" aria-label="发动机转速表"></canvas><span class="el-meter-caption">ENGINE SPEED</span></div>
        <div class="el-readouts">
          <div class="el-speed"><span>车速 <small>KM/H</small></span><strong data-value="speed">0</strong></div>
          <button class="el-gear" type="button" aria-label="当前挡位"><span>挡位</span><strong data-value="gear">N</strong></button>
          <div class="el-readout-line"><span>行驶</span><b><span data-value="distance">0.00</span> <small>km</small></b></div>
          <div class="el-readout-line"><span>实际节气门</span><b><span data-value="throttle">0</span> <small>%</small></b></div>
          <div class="el-output-line"><span><b data-value="torque">0</b> N·m</span><span><b data-value="power">0</b> kW</span></div>
        </div>
      </div>
      <div class="el-aux-meters">
        <div class="el-mini-meter"><canvas data-canvas="boost" role="img" aria-label="增压与真空压力"></canvas><div><span>增压 / 真空 <small>bar</small></span><b data-value="boost">0.00</b></div></div>
        <div class="el-mini-meter el-oil-meter"><canvas data-canvas="oil" role="img" aria-label="机油压力"></canvas><div><span>机油压力 <small data-value="oilUnit">bar</small></span><b data-value="oil">0.0</b></div></div>
        <div class="el-mini-meter"><canvas data-canvas="oiltemp" role="img" aria-label="机油温度"></canvas><div><span>机油温度 <small>°C</small></span><b data-value="oiltemp">28</b></div></div>
        <div class="el-mini-meter"><canvas data-canvas="temp" role="img" aria-label="冷却液温度"></canvas><div><span>冷却液温度 <small>°C</small></span><b data-value="temp">28</b></div></div>
      </div>
      <details class="el-cycle-details" open>
        <summary><span>四冲程剖面</span><small>按曲轴角同步</small><i></i></summary>
        <div class="el-cycle-body">
          <div class="el-cycle-meta"><span data-value="geometry">V 型双缸剖面</span><span data-value="angle">0° / 720°</span></div>
          <div class="mechanics-summary"><div><span>进气质量流量</span><b data-value="intakeMass">0.000 kg/s</b></div><div><span>歧管绝压</span><b data-value="manifold">1.01 bar</b></div><div><span>进气体积流量</span><b data-value="intakeVolume">0 L/min</b></div><div><span>排气质量流量</span><b data-value="exhaustMass">0.000 kg/s</b></div><div><span>混合气 / 氧气</span><b data-value="mixture">λ 0.99 · O2 20.9%</b></div><div><span>节气门阀片 / 流通</span><b data-value="butterfly">0° · 0%</b></div></div>
          <canvas data-canvas="cycle" class="el-cycle-canvas" role="img" aria-label="活塞连杆四冲程循环示意"></canvas>
          <div class="el-cycle-legend"><span style="--stroke:#ef7357">做功</span><span style="--stroke:#aa91d5">排气</span><span style="--stroke:#74b7e8">进气</span><span style="--stroke:#d2bf6c">压缩</span></div>
          <p class="el-diagram-note">曲柄与连杆按几何运动。颜色、燃烧及各缸相位为等间隔示意；不表示原厂点火顺序。</p>
          <div class="el-timing-heading"><span>逐缸循环时序</span><small data-value="spacing">相位示意</small></div>
          <canvas data-canvas="timing" class="el-timing-canvas" role="img" aria-label="720度逐缸循环相位示意"></canvas>
          <div class="mechanics-summary"><div><span>头段温度</span><b data-value="headerTemp">28°C</b></div><div><span>尾段温度</span><b data-value="tailTemp">28°C</b></div><div><span>离合结合度</span><b data-value="engagement">0%</b></div><div><span>动力传递</span><b data-value="connection">N · 动力断开</b></div></div>
        </div>
      </details>
      <details class="el-wave-details">
        <summary><span>声音波形</span><small data-value="level">等待声音</small><i></i></summary>
        <div class="el-wave-body"><canvas data-canvas="wave" role="img" aria-label="当前合成输出的实测声音波形"></canvas><p class="el-diagram-note">当前电脑合成输出 · 实测时域波形</p></div>
      </details>`;
    host.append(this.root);
    this.canvases=Object.fromEntries([...this.root.querySelectorAll('[data-canvas]')].map(c=>[c.dataset.canvas,c]));
    this.values=Object.fromEntries([...this.root.querySelectorAll('[data-value]')].map(e=>[e.dataset.value,e]));
    const gearButton=this.root.querySelector('.el-gear');
    gearButton.disabled=!onNeutral&&!onGear;
    if(onGear||onNeutral){gearButton.setAttribute('aria-haspopup','dialog');gearButton.setAttribute('aria-label','选择挡位');}
    gearButton.addEventListener('click',()=>{if(this.onGear)this.onGear(this.sim?.gear);else this.onNeutral?.();});
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(this.root);
    this.root.querySelectorAll('details').forEach(d=>d.addEventListener('toggle',()=>{this.resize();this._drawAll();}));
    this.resize();
  }
  setVisible(visible){this.visible=!!visible;this.root.hidden=!this.visible;if(this.visible){this.resize();this._drawAll();}}
  resize(){
    const dpr=clamp(finite(globalThis.devicePixelRatio,1),1,3);
    for(const [key,canvas] of Object.entries(this.canvases)){
      const w=canvas.clientWidth,h=canvas.clientHeight;if(w<1||h<1)continue;
      const pw=Math.round(w*dpr),ph=Math.round(h*dpr);
      if(canvas.width!==pw||canvas.height!==ph){canvas.width=pw;canvas.height=ph;}
      this.sizes.set(key,{w,h,dpr});
    }
    this._drawAll();
  }
  update(sim,audio,mode='bench'){
    if(!sim)return;this.sim=sim;this.audio=audio;this.mode=mode;
    const p=sim.preset??{},b=p.source?.build??p.phoneSource?.build??p.phoneSource??p;
    const identity=[p.id,p.cylinders,p.layout,p.bankAngleDeg,p.rodRatio,p.boreMm,p.strokeMm,p.firingSource,p.firingOrder?.join(','),p.firingAngles?.join(',')].join('|');
    if(identity!==this.identity){
      this.identity=identity;
      this.geometry={layout:p.layout??b.layout??'inline',cylinders:clamp(Math.round(finite(p.cylinders,finite(b.cylinders,4))),1,16),bankAngle:clamp(finite(p.bankAngleDeg,finite(b.bankAngleDeg,90)),10,180),rodRatio:clamp(finite(p.rodRatio,finite(b.rodRatio,1.7)),1,3),bore:finite(p.boreMm,finite(b.boreMm,86)),stroke:finite(p.strokeMm,finite(b.strokeMm,86)),rotary:p.isRotary||p.layout==='rotary'};
      const g=this.geometry;
      this.firing=createFiringSchedule({...p,cylinders:g.cylinders});
      const banks=cylinderBanks({layout:g.layout},this.firing);
      this.sectionCylinders=g.layout==='inline'?banks[0].slice(0,2):banks.slice(0,2).map(bank=>bank[0]).filter(Boolean);
      this.values.geometry.textContent=g.rotary?'转子结构 · 活塞剖面不适用':`${{v:'V 型',inline:'直列',boxer:'水平对置',w:'W 型'}[g.layout]??'发动机'} · ${g.cylinders} 缸 · ${Math.round(g.bore*10)/10} × ${Math.round(g.stroke*10)/10} mm`;
      const gaps=this.firing.events.map((event,i,events)=>(events[i+1]?.deg??events[0].deg+720)-event.deg);
      const spacing=gaps.every(gap=>Math.abs(gap-gaps[0])<.00001)?`${Number(gaps[0].toFixed(1))}° 等间隔`:'非等间隔';
      this.values.spacing.textContent=this.firing.packaged?`包内时序 · ${spacing}`:`${spacing} · 示意`;
      this.root.querySelector('.el-cycle-body .el-diagram-note').textContent=this.firing.packaged?`点火缸序 ${p.firingOrder.join('–')} 来自 IPA 内置模型。缸列外形、燃烧颜色与理想气门开闭为独立示意。`:'曲柄与连杆按几何运动。颜色、燃烧及各缸相位为等间隔示意；不表示原厂点火顺序。';
      this.canvases.timing.style.height=`${Math.max(112,34+g.cylinders*19)}px`;
      this.resize();
    }
    this.values.speed.textContent=Math.round(Math.max(0,finite(sim.speed))*3.6);
    this.values.gear.textContent=sim.neutral||sim.gear===0?'N':Math.max(1,Math.round(finite(sim.gear,1)));
    this.values.distance.textContent=(Math.max(0,finite(sim.distance))/1000).toFixed(2);
    this.values.throttle.textContent=Math.round(clamp(finite(sim.operating?.actualThrottle,sim.throttle),0,1)*100);
    this.values.torque.textContent=Math.round(finite(sim.torque));this.values.power.textContent=Math.round(finite(sim.power));
    this.values.boost.textContent=finite(sim.operating?.boostVacuumBar,sim.boost).toFixed(2);this.values.temp.textContent=Math.round(finite(sim.temperature));
    this.values.oiltemp.textContent=Math.round(finite(sim.operating?.oilTemperatureC,28));
    const oil=Number.isFinite(sim.oilPressureBar)?sim.oilPressureBar:null;
    this.values.oil.textContent=oil===null?'—':oil.toFixed(1);this.values.oilUnit.textContent=oil===null?'未建模':'bar';
    const o=sim.operating;
    if(o){this.values.intakeMass.textContent=o.intakeMassKgS.toFixed(3)+' kg/s';this.values.manifold.textContent=o.manifoldAbsoluteBar.toFixed(2)+' bar';this.values.intakeVolume.textContent=Math.round(o.intakeVolumeLMin)+' L/min';this.values.exhaustMass.textContent=o.exhaustMassKgS.toFixed(3)+' kg/s';this.values.mixture.textContent='λ '+o.lambda.toFixed(2)+' · O2 '+o.oxygenPercent.toFixed(1)+'%';this.values.butterfly.textContent=Math.round(o.butterflyDeg)+'° · '+Math.round(o.throttleFlowPercent)+'%';this.values.headerTemp.textContent=Math.round(o.headerTemperatureC)+'°C';this.values.tailTemp.textContent=Math.round(o.tailTemperatureC)+'°C';this.values.engagement.textContent=Math.round(sim.clutchEngagement*100)+'%';this.values.connection.textContent=sim.neutral?'N · 动力断开':sim.shiftTimer>0?'换挡中':sim.clutchEngagement>0?'传动已接合':'离合分离';}
    this.root.classList.toggle('is-running',!!(sim.running||sim.cranking));
    this.root.querySelector('.el-cockpit-status b').textContent=sim.running?'运行中':sim.cranking?`启动中 ${Math.floor(sim.starterProgress*100)}%`:'等待点火';
    this.values.angle.textContent=`${Math.floor(mod(finite(sim.angle),CYCLE)/CYCLE*720)}° / 720°`;
    this.canvases.rpm.setAttribute('aria-label',`发动机转速 ${Math.round(finite(sim.rpm))} RPM，红线 ${Math.round(finite(sim.tune?.redline,p.redline??8000))} RPM`);
    if(this.visible)this._drawAll();
  }
  destroy(){this.resizeObserver?.disconnect();this.root.remove();}
  _ctx(key){
    const canvas=this.canvases[key],size=this.sizes.get(key);if(!size||!canvas||canvas.clientHeight===0)return null;
    const ctx=canvas.getContext('2d');ctx.setTransform(size.dpr,0,0,size.dpr,0,0);ctx.clearRect(0,0,size.w,size.h);return {c:ctx,...size};
  }
  _drawAll(){if(!this.visible||!this.canvases)return;this._rpm();this._mini('boost');this._mini('temp');this._mini('oil');this._mini('oiltemp');if(this.root.querySelector('.el-cycle-details').open){this._cycle();this._timing();}if(this.root.querySelector('.el-wave-details').open)this._wave();}
  _rpm(){
    const out=this._ctx('rpm');if(!out)return;const {c,w,h}=out,sim=this.sim??{},redline=Math.max(500,finite(sim.tune?.redline,finite(sim.preset?.redline,7200)));
    const max=[4000,6000,8000,10000,12000,16000,20000,25000,30000].find(v=>v>=redline*1.08)??Math.ceil(redline/5000)*5000;
    const cx=w/2,cy=h*.48,r=Math.min(w*.46,h*.46),start=Math.PI*.75,sweep=Math.PI*1.5;
    const radial=(radius,a)=>[cx+Math.cos(a)*radius,cy+Math.sin(a)*radius];
    let grad=c.createRadialGradient(cx,cy,r*.25,cx,cy,r);grad.addColorStop(0,'#121a20');grad.addColorStop(.79,'#0a1014');grad.addColorStop(.95,'#0b1115');grad.addColorStop(1,'#222b31');
    c.fillStyle=grad;c.beginPath();c.arc(cx,cy,r,0,TAU);c.fill();
    c.strokeStyle='#303b43';c.lineWidth=2;c.beginPath();c.arc(cx,cy,r*.985,0,TAU);c.stroke();
    c.strokeStyle='#1e292f';c.lineWidth=5;c.beginPath();c.arc(cx,cy,r*.78,start,start+sweep);c.stroke();
    const redAngle=start+clamp(redline/max,0,1)*sweep;
    c.strokeStyle='#bc3b4c';c.lineWidth=4;c.beginPath();c.arc(cx,cy,r*.785,redAngle,start+sweep);c.stroke();
    const major=max<=12000?1000:max<=20000?2000:5000,minor=major/5;
    for(let v=0;v<=max;v+=minor){const a=start+v/max*sweep,big=v%major===0,red=v>=redline;const p1=radial(r*.79,a),p2=radial(r*(big?.68:.735),a);c.strokeStyle=red?'#f55e72':big?'#c5cfd4':'#50606a';c.lineWidth=big?2:1;c.beginPath();c.moveTo(...p1);c.lineTo(...p2);c.stroke();if(big){const xy=radial(r*.89,a);c.textAlign='center';c.textBaseline='middle';c.fillStyle=red?'#ef6275':'#9baab3';c.font=`500 ${Math.max(10,r*.104)}px "Segoe UI",sans-serif`;c.fillText(String(v/1000),...xy);}}
    c.textAlign='center';c.textBaseline='middle';c.fillStyle='#65767f';c.font=`600 ${Math.max(8,r*.057)}px "Segoe UI",sans-serif`;c.fillText('×1000 RPM',cx,cy-r*.28);
    const a=start+clamp(finite(sim.rpm)/max,0,1.02)*sweep;
    c.save();c.translate(cx,cy);c.rotate(a);c.shadowColor='#ff9f4380';c.shadowBlur=9;c.fillStyle='#f99b40';c.beginPath();c.moveTo(-r*.145,-3);c.lineTo(r*.73,-1.1);c.lineTo(r*.77,0);c.lineTo(r*.73,1.1);c.lineTo(-r*.145,4);c.closePath();c.fill();c.restore();
    c.fillStyle='#303a41';c.beginPath();c.arc(cx,cy,r*.084,0,TAU);c.fill();c.fillStyle='#fa9a3d';c.beginPath();c.arc(cx,cy,r*.037,0,TAU);c.fill();
    c.fillStyle='#f1f4f5';c.font=`600 ${Math.max(24,r*.28)}px "Segoe UI",sans-serif`;c.fillText(fmt.format(Math.round(finite(sim.rpm))),cx,cy+r*.55);
    c.fillStyle='#788992';c.font=`600 ${Math.max(8,r*.064)}px "Segoe UI",sans-serif`;c.fillText('RPM',cx,cy+r*.75);
  }
  _mini(kind){
    const out=this._ctx(kind);if(!out)return;const {c,w,h}=out,sim=this.sim??{},cx=w/2,cy=h*.66,r=Math.min(w*.44,h*.57),start=Math.PI*.87,sweep=Math.PI*1.26;
    const available=kind!=='oil'||Number.isFinite(sim.oilPressureBar);
    const isTemp=kind==='temp'||kind==='oiltemp';
    const val=kind==='boost'?finite(sim.operating?.boostVacuumBar,sim.boost):kind==='temp'?finite(sim.temperature):kind==='oiltemp'?finite(sim.operating?.oilTemperatureC,28):finite(sim.oilPressureBar),min=isTemp?20:kind==='boost'?-1:0,max=kind==='boost'?Math.max(2,finite(sim.tune?.boost)*1.25):isTemp?140:8;
    c.lineCap='round';c.strokeStyle='#26333b';c.lineWidth=3;c.beginPath();c.arc(cx,cy,r,start,start+sweep);c.stroke();
    for(let i=0;i<=4;i++){const a=start+i/4*sweep;c.strokeStyle='#63717a';c.lineWidth=1;c.beginPath();c.moveTo(cx+Math.cos(a)*r*.82,cy+Math.sin(a)*r*.82);c.lineTo(cx+Math.cos(a)*r*.98,cy+Math.sin(a)*r*.98);c.stroke();}
    if(available){const a=start+clamp((val-min)/(max-min),0,1)*sweep;c.strokeStyle=kind==='temp'&&val>110?'#ff6877':'#ec913d';c.lineWidth=2;c.beginPath();c.moveTo(cx-Math.cos(a)*r*.1,cy-Math.sin(a)*r*.1);c.lineTo(cx+Math.cos(a)*r*.72,cy+Math.sin(a)*r*.72);c.stroke();c.fillStyle='#d6a06e';c.beginPath();c.arc(cx,cy,2.5,0,TAU);c.fill();}
    else{c.font='12px sans-serif';c.fillStyle='#53616b';c.textAlign='center';c.fillText('—',cx,cy-2);}
  }
  _cycle(){
    const out=this._ctx('cycle');if(!out)return;const {c,w,h}=out,g=this.geometry??{layout:'v',cylinders:8,bankAngle:90,rodRatio:1.7,bore:86,stroke:86},angle=mod(finite(this.sim?.angle),CYCLE);
    if(g.rotary){c.fillStyle='#71828d';c.font='13px "Microsoft YaHei",sans-serif';c.textAlign='center';c.fillText('当前为转子发动机',w/2,h*.46);c.font='11px "Microsoft YaHei",sans-serif';c.fillText('活塞与连杆剖面不适用于此结构',w/2,h*.56);return;}
    // rodRatio in the supplied backup is rod length / full stroke.
    const boxed=g.layout==='boxer',inline=g.layout==='inline',bankAngle=boxed?180:inline?0:g.bankAngle;
    const r=20,l=r*2*g.rodRatio,bore=clamp(g.bore/g.stroke*.88,.6,1.65)*r*2;
    const extent=l+r+28,half=bankAngle/2*Math.PI/180;
    const spread=inline?bore*1.45:0,upper=Math.cos(half)*(l+r+35)+Math.sin(half)*(bore/2+10),lower=r*2;
    const horizontal=2*(Math.sin(half)*(l+r+35)+Math.cos(half)*(bore/2+10))+spread;
    const scale=Math.min((w-32)/horizontal,(h-48)/(upper+lower));
    const s=clamp(scale,.3,2.6),originY=boxed?h*.51:24+upper*s,cx=w/2;
    c.save();c.translate(cx,originY);c.scale(s,s);
    c.fillStyle='#111a21';c.beginPath();c.arc(0,0,r*1.95,0,TAU);c.fill();c.strokeStyle='#26323b';c.lineWidth=1;c.stroke();
    const section=this.sectionCylinders??[1,2].slice(0,g.cylinders),cylinders=section.length;
    const schedule=this.firing??createFiringSchedule({cylinders:g.cylinders});
    const states=[];
    for(let i=0;i<cylinders;i++){
      const cylinder=section[i],alpha=inline?0:(i===0?-half:half),phase=cylinderPhase(angle,cylinder,schedule),state=strokeState(phase),stage=state.stage;
      const motion=crankKinematics(phase,r,g.rodRatio),pinX=motion.pinAcross,pinY=-motion.pinAlong,pistonY=-motion.pistonAlong,headY=-(l+r+25),pistonTop=pistonY-11;
      const baseX=inline?(i-(cylinders-1)/2)*spread:0;
      const stageColor=COLORS[stage],power=stage===0;
      c.save();c.translate(baseX,0);c.rotate(alpha);
      // Cylinder wall, static head and the changing gas chamber.
      c.fillStyle='#162129';c.fillRect(-bore/2-7,headY-8,bore+14,extent-8);
      c.fillStyle='#091116';c.fillRect(-bore/2,headY,bore,pistonTop-headY);
      const chamber=c.createLinearGradient(0,headY,0,pistonTop);chamber.addColorStop(0,stageColor+'85');chamber.addColorStop(1,stageColor+'17');c.fillStyle=chamber;c.fillRect(-bore/2+1,headY+1,bore-2,Math.max(0,pistonTop-headY-1));
      c.strokeStyle='#3d4a53';c.lineWidth=4;c.beginPath();c.moveTo(-bore/2-3,headY);c.lineTo(-bore/2-3,-l+r+4);c.moveTo(bore/2+3,headY);c.lineTo(bore/2+3,-l+r+4);c.stroke();
      c.fillStyle='#33414c';c.fillRect(-bore/2-8,headY-10,bore+16,9);
      // Two valves: opening follows the displayed stroke; overlap is deliberately not simulated.
      for(let v=0;v<2;v++){const intake=v===0,open=intake?state.intakeOpen:state.exhaustOpen,vx=(v?1:-1)*bore*.27,vy=headY+(open?10:1);c.strokeStyle=intake?'#74b7e8':'#aa91d5';c.lineWidth=3;c.beginPath();c.moveTo(vx,headY-24);c.lineTo(vx,vy);c.stroke();c.lineWidth=4;c.beginPath();c.moveTo(vx-bore*.13,vy);c.lineTo(vx+bore*.13,vy);c.stroke();}
      c.strokeStyle='#81919c';c.lineWidth=9;c.lineCap='round';c.beginPath();c.moveTo(pinX,pinY);c.lineTo(0,pistonY);c.stroke();c.strokeStyle='#b6c3ca';c.lineWidth=3;c.stroke();
      const metal=c.createLinearGradient(-bore/2,0,bore/2,0);metal.addColorStop(0,'#71828f');metal.addColorStop(.35,'#c9d1d7');metal.addColorStop(.75,'#aebcc6');metal.addColorStop(1,'#667b8a');c.fillStyle=metal;c.fillRect(-bore/2+1,pistonTop,bore-2,25);
      c.strokeStyle='#586a77';c.lineWidth=1.4;for(let q=0;q<3;q++){const y=pistonTop+3+q*3;c.beginPath();c.moveTo(-bore/2+1,y);c.lineTo(bore/2-1,y);c.stroke();}
      c.fillStyle='#5c6d79';c.beginPath();c.arc(0,pistonY,4,0,TAU);c.fill();
      if(power&&phase<Math.PI*.32&&this.sim?.running){c.shadowBlur=13;c.shadowColor='#ff9b51';c.fillStyle='#ffe3b1';c.beginPath();const y=headY+4;c.moveTo(-2,y);c.lineTo(3,y+7);c.lineTo(0,y+7);c.lineTo(3,y+16);c.lineTo(-4,y+6);c.lineTo(0,y+6);c.closePath();c.fill();c.shadowBlur=0;}
      c.fillStyle='#aab8c0';c.beginPath();c.arc(pinX,pinY,6.5,0,TAU);c.fill();c.fillStyle='#677b87';c.beginPath();c.arc(pinX,pinY,3,0,TAU);c.fill();
      c.restore();
      // Upright stage labels are separate from the rotated mechanical part.
      const ux=Math.sin(alpha),uy=-Math.cos(alpha);states.push({x:baseX+ux*(extent+4),y:uy*(extent+4),label:`${cylinder} 缸 · ${STROKES[stage]}`,color:stageColor});
    }
    c.fillStyle='#b6c1c8';c.beginPath();c.arc(0,0,10,0,TAU);c.fill();c.fillStyle='#6f8490';c.beginPath();c.arc(0,0,4,0,TAU);c.fill();
    c.textAlign='center';c.textBaseline='bottom';c.font='600 11px "Microsoft YaHei",sans-serif';for(const st of states){c.fillStyle=st.color;c.fillText(st.label,st.x,st.y-14);}
    c.restore();
    c.textAlign='left';c.font='9px "Segoe UI",sans-serif';c.fillStyle='#576c7a';c.fillText(`${g.layout==='w'?'W 结构 · 选取两缸示意':g.cylinders===1?'单缸剖面':'选取两缸示意'}   ·   连杆 / 冲程 ${g.rodRatio.toFixed(2)}`,12,h-8);
  }
  _timing(){
    const out=this._ctx('timing');if(!out)return;const {c,w,h}=out,n=this.geometry?.cylinders??8,left=31,right=9,top=21,row=(h-top-8)/n,plot=w-left-right,angle=mod(finite(this.sim?.angle),CYCLE);
    const schedule=this.firing??createFiringSchedule({cylinders:n});
    if(this.geometry?.rotary){c.fillStyle='#71828d';c.font='11px sans-serif';c.fillText('转子发动机不显示四冲程活塞时序',12,30);return;}
    c.font='9px "Segoe UI",sans-serif';c.textAlign='center';c.fillStyle='#687d89';
    for(let i=0;i<=4;i++){const x=left+i/4*plot;c.fillText(`${i*180}°`,x,10);c.strokeStyle='#28363e';c.lineWidth=.7;c.beginPath();c.moveTo(x,top);c.lineTo(x,h-7);c.stroke();}
    for(let i=0;i<n;i++){
      const y=top+i*row,offset=schedule.byCylinder[i+1].offset;
      c.fillStyle='#7d919d';c.textAlign='right';c.fillText(String(i+1),left-9,y+row*.62);
      // Rows are cylinder numbers, not firing-sequence positions.
      for(let k=-4;k<8;k++){
        const begin=offset+k*Math.PI,end=begin+Math.PI,a=Math.max(0,begin),b=Math.min(CYCLE,end);if(b<=a)continue;
        const stage=mod(k,4),active=strokeState(cylinderPhase(angle,i+1,schedule)).stage===stage;
        c.fillStyle=COLORS[stage]+(active&&this.sim?.running?'88':'42');c.fillRect(left+a/CYCLE*plot,y+2,(b-a)/CYCLE*plot,Math.max(3,row-5));
      }
      c.fillStyle='#c6d1d6';const fire=left+offset/CYCLE*plot;c.fillRect(fire,y+1,1.4,Math.max(4,row-3));
    }
    const x=left+angle/CYCLE*plot;c.strokeStyle='#f49a46';c.lineWidth=1.3;c.beginPath();c.moveTo(x,top-5);c.lineTo(x,h-7);c.stroke();c.fillStyle='#f5a259';c.beginPath();c.moveTo(x-3,top-7);c.lineTo(x+3,top-7);c.lineTo(x,top-2);c.fill();
  }
  _wave(){
    const out=this._ctx('wave');if(!out)return;const {c,w,h}=out,a=this.audio?.analyser,enabled=this.audio?.enabled;
    c.strokeStyle='#24333c';c.lineWidth=.7;c.beginPath();c.moveTo(0,h/2);c.lineTo(w,h/2);c.stroke();
    if(!a||!enabled){this.values.level.textContent=enabled?'等待输出':'声音关闭';c.fillStyle='#637681';c.font='10px "Microsoft YaHei",sans-serif';c.textAlign='center';c.fillText(enabled?'等待合成声音输出':'开启声音后显示当前输出波形',w/2,h/2-10);return;}
    if(!this.samples||this.samples.length!==a.fftSize)this.samples=new Float32Array(a.fftSize);
    a.getFloatTimeDomainData(this.samples);let sum=0;for(const v of this.samples)sum+=v*v;const rms=Math.sqrt(sum/this.samples.length);
    this.values.level.textContent=rms>0.000001?`${Math.max(-120,20*Math.log10(rms)).toFixed(1)} dBFS`:'−∞ dBFS';
    c.strokeStyle='#d5dce0';c.lineWidth=1.2;c.lineJoin='round';c.beginPath();const step=Math.max(1,Math.floor(this.samples.length/w));
    for(let i=0;i<this.samples.length;i+=step){const x=i/(this.samples.length-1)*w,y=h/2-clamp(this.samples[i],-1,1)*h*.43;i===0?c.moveTo(x,y):c.lineTo(x,y);}c.stroke();
  }
}
