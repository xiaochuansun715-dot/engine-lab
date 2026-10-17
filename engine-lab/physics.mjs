// An independent, deliberately simplified entertainment model. SI units internally.
export const PRESETS = [
  {id:'i4', name:'直列四缸 · 2.0T', short:'I4', cylinders:4, layout:'inline', litres:2, torque:260, peak:4200, redline:7200, boost:0.9, mass:1380, color:0xffaa53, caption:'轻巧、敏捷，一台适合拉高转速的涡轮引擎。'},
  {id:'i6', name:'直列六缸 · 3.0T', short:'I6', cylinders:6, layout:'inline', litres:3, torque:380, peak:4400, redline:7000, boost:1.0, mass:1550, color:0x77d6c5, caption:'平顺的六缸声线，宽广的中段扭矩。'},
  {id:'v8', name:'V 型八缸 · 6.2L', short:'V8', cylinders:8, layout:'v', litres:6.2, torque:590, peak:4700, redline:6800, boost:0, mass:1690, color:0xff845f, caption:'大排量自然吸气，低沉而饱满的机械脉搏。'},
  {id:'b4', name:'水平对置 · 2.4T', short:'B4', cylinders:4, layout:'boxer', litres:2.4, torque:300, peak:4100, redline:7400, boost:0.7, mass:1420, color:0x9dacf4, caption:'左右交替的活塞，紧凑而独特的对置结构。'},
  {id:'v12', name:'V 型十二缸 · 6.5L', short:'V12', cylinders:12, layout:'v', litres:6.5, torque:650, peak:6300, redline:9000, boost:0, mass:1650, color:0xf1d17d, caption:'细密的点火节奏，逐渐攀升的高转速声浪。'}
];
export const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
export function defaultTune(p) { return {boost:p.boost,redline:p.redline,ignition:0,mass:p.mass,exhaust:0.55}; }
export function cleanTune(raw,p) {
  const d=defaultTune(p), bounds=p.phone?{boost:[0,4],redline:[Math.ceil((p.idleRpm??600)*1.15),25000],ignition:[-20,30],mass:[100,20000],exhaust:[0,1]}:{boost:[0,2.2],redline:[5000,10000],ignition:[-8,15],mass:[850,2400],exhaust:[0,1]};
  return Object.fromEntries(Object.entries(d).map(([k,v])=>[k,clamp(Number.isFinite(Number(raw?.[k]))?Number(raw[k]):v,...bounds[k])]));
}
export function torqueAt(rpm,tune,p,throttle=1) {
  if(rpm<250||rpm>tune.redline+160) return 0;
  const low=0.51+0.49*Math.min(1,rpm/(p.peak*0.7));
  const high=Math.exp(-0.65*Math.pow(Math.max(0,rpm-p.peak)/Math.max(500,tune.redline-p.peak+900),2));
  const spool=p.induction==='supercharger'?1:0.2+0.8/(1+Math.exp(-(rpm-2400)/600));
  const boost=1+tune.boost*0.50*spool;
  const timing=1+tune.ignition*0.006-Math.max(0,tune.ignition-9)*0.012;
  const limiter=rpm>tune.redline?0.12:1;
  return Math.max(0,p.torque*low*high*boost*timing*clamp(throttle,0,1)*limiter);
}
export function dynoCurve(tune,p) {
  const floor=p.idleRpm??800;
  return Array.from({length:65},(_,i)=>{const rpm=floor+i*(tune.redline-floor)/64,torque=torqueAt(rpm,tune,p);return {rpm,torque,kw:torque*rpm/9549.3};});
}
export class Simulation {
  constructor(p=PRESETS[0],tune=defaultTune(p)){this.configure(p,tune);this.reset();}
  configure(p,tune){this.preset=p;this.tune=cleanTune(tune,p);}
  reset(){Object.assign(this,{running:false,rpm:0,speed:0,distance:0,time:0,gear:1,auto:true,shiftTimer:0,torque:0,power:0,boost:0,temperature:79,health:100,knock:0,angle:0,throttle:0,brake:0,steer:0,x:-2.15,heading:0,zeroTo100:null,runTime:0});}
  start(){if(this.health>0){this.running=true;this.rpm=this.preset.idleRpm??850;}}
  shift(direction){const g=clamp(this.gear+direction,1,(this.preset.ratios?.length??7)-1);if(g!==this.gear){this.gear=g;this.shiftTimer=this.preset.shiftDuration??0.32;}}
  repair(){this.health=100;this.temperature=79;this.knock=0;}
  step(delta,input={}){
    const dt=clamp(delta,0,0.05),p=this.preset,t=this.tune;
    this.time+=dt;this.shiftTimer=Math.max(0,this.shiftTimer-dt);
    this.throttle=clamp(input.throttle??0,0,1);this.brake=clamp(input.brake??0,0,1);
    const drive=!!input.drive,clutch=!!input.clutch;
    const ratios=p.ratios??[0,3.35,2.15,1.57,1.21,1,0.82],final=p.finalDrive??3.55,radius=p.tireCircumferenceM?p.tireCircumferenceM/(2*Math.PI):0.335;
    const wheelRPM=this.speed/radius*60/(2*Math.PI)*ratios[this.gear]*final;
    if(this.running){
      const idle=(p.idleRpm??850)+Math.sin(this.time*7)*18;
      const freeTarget=idle+Math.pow(this.throttle,0.7)*(t.redline+100-idle);
      const launch=p.launchRpm?idle+this.throttle*(p.launchRpm-idle):1800+this.throttle*1700;
      const loadTarget=Math.max(idle,wheelRPM,launch*(1-clamp(this.speed/13,0,1)));
      const target=drive&&!clutch?loadTarget:freeTarget;
      this.rpm+=(target-this.rpm)*(1-Math.exp(-dt*(target>this.rpm?6:3.7)));
      this.rpm=clamp(this.rpm,0,t.redline+200);
      if(this.auto&&drive&&!clutch&&this.shiftTimer===0){
        if(this.rpm>t.redline*0.88&&this.gear<ratios.length-1&&this.throttle>0.15)this.shift(1);
        else if(wheelRPM<t.redline*0.29&&this.gear>1)this.shift(-1);
      }
      this.torque=torqueAt(this.rpm,t,p,this.throttle)*(this.shiftTimer>(p.shiftDuration??.32)*.53?0.08:1);
      this.power=this.torque*this.rpm/9549.3;
      this.boost+=(t.boost*this.throttle*clamp((this.rpm-1200)/2400,0,1)-this.boost)*(1-Math.exp(-dt*3));
      this.temperature+=(79+this.throttle*24+this.boost*8+this.rpm/t.redline*6-this.temperature)*dt*0.028;
      this.knock=clamp((t.ignition-8)*0.08+(this.boost-1.5)*0.28,0,1)*this.throttle;
      this.health=clamp(this.health-this.knock*dt*0.08,0,100);
    }else{
      this.rpm*=Math.exp(-dt*3);if(this.rpm<5)this.rpm=0;
      this.torque=0;this.power=0;this.boost*=Math.exp(-dt*3);
      this.temperature+=(24-this.temperature)*dt*0.012;
    }
    this.angle=(this.angle+this.rpm/60*Math.PI*2*dt)%(Math.PI*4);
    if(drive){
      const mass=t.mass,offroad=Math.abs(this.x)>5.2;
      const limited=(p.speedLimiterKph??0)>0&&this.speed*3.6>=p.speedLimiterKph;
      const tractive=this.running&&!clutch&&!limited?Math.min(this.torque*ratios[this.gear]*final*(p.efficiency??.9)/radius,mass*9.81*(offroad?0.4:p.tractionCoeff??1.08)):0;
      const resistance=this.speed>0?((p.dragArea?0.5*1.225*p.dragArea:.42)*this.speed*this.speed+mass*9.81*(offroad?0.075:0.013)+(this.running&&!clutch?(1-this.throttle)*65*ratios[this.gear]:0)):0;
      const braking=this.brake*mass*9.81*1.12;
      this.speed=Math.max(0,this.speed+(tractive-resistance-braking)/mass*dt);
      this.steer+=(clamp(input.steer??0,-1,1)-this.steer)*Math.min(1,dt*7);
      this.heading+=this.steer*this.speed*dt*0.035;this.heading*=Math.exp(-dt*2.7);
      this.x=clamp(this.x+Math.sin(this.heading)*this.speed*dt,-11,11);
      this.distance+=this.speed*Math.cos(this.heading)*dt;
      if(this.speed>0.12)this.runTime+=dt;
      if(this.zeroTo100===null&&this.speed*3.6>=100)this.zeroTo100=this.runTime;
    }
    return this;
  }
  snapshot(){return Object.fromEntries(['running','rpm','speed','distance','gear','torque','power','boost','temperature','health','zeroTo100','runTime','x','heading','throttle'].map(k=>[k,this[k]]));}
}
