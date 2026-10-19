// Independent operating model, guided by reviewed off/idle observations.
// Temperatures, airflow and resource integration are approximations, not original code.
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const finite=(v,f)=>Number.isFinite(v)?v:f;
const approach=(v,target,dt,seconds)=>v+(target-v)*(1-Math.exp(-dt/seconds));
export const ROAD_SURFACES={
  smooth:{label:'平整柏油',grip:1,rolling:1},
  track:{label:'高抓地赛道',grip:1.12,rolling:.92},
  rough:{label:'粗糙路面',grip:.88,rolling:1.22},
  wet:{label:'湿滑路面',grip:.69,rolling:1.08}
};
export class OperatingState {
  constructor(){this.reset();}
  reset(){
    Object.assign(this,{ambientC:28,oilTemperatureC:28,coolantTemperatureC:28,gearboxOilTemperatureC:28,
      exhaustTemperatureC:28,headerTemperatureC:28,tailTemperatureC:28,intakeTemperatureC:27,
      tankCapacityL:60,fuelL:60,oilPercent:100,batteryPercent:85,voltage:12.6,
      oilPressureBar:0,boostVacuumBar:0,manifoldAbsoluteBar:1.01,intakeMassKgS:0,intakeVolumeLMin:0,
      exhaustMassKgS:0,fuelLph:0,lambda:.99,oxygenPercent:20.9,actualThrottle:0,butterflyDeg:0,throttleFlowPercent:0,
      ignitionAdvanceDeg:0,engineLoad:0,lifeEnabled:false,unlimitedFuel:false,roadSurface:'smooth',roadLoad:50,
      peakPowerPs:0,topSpeedKph:0,highLoadSeconds:0,zeroTo200:null,zeroTo300:null});
  }
  get road(){return ROAD_SURFACES[this.roadSurface]??ROAD_SURFACES.smooth;}
  get slopePercent(){return (this.roadLoad-50)*.4;}
  setTankCapacity(value){
    if(!Number.isFinite(value))return false;
    this.tankCapacityL=clamp(value,5,200);this.fuelL=Math.min(this.fuelL,this.tankCapacityL);return true;
  }
  setRoad(value){if(!Object.hasOwn(ROAD_SURFACES,value))return false;this.roadSurface=value;return true;}
  canStart(){return (this.unlimitedFuel||this.fuelL>0)&&this.batteryPercent>=5;}
  canRefill(sim){return !sim.running&&!sim.cranking&&sim.rpm<5;}
  refill(kind,sim){
    if(!['fuel','oil','battery','all'].includes(kind)||!this.canRefill(sim))return false;
    if(kind==='fuel'||kind==='all')this.fuelL=this.tankCapacityL;
    if(kind==='oil'||kind==='all')this.oilPercent=100;
    if(kind==='battery'||kind==='all')this.batteryPercent=100;
    // Replenishment deliberately preserves temperatures, wear, position and mileage.
    return true;
  }
  step(sim,dt){
    const p=sim.preset,throttle=sim.throttle,running=sim.running,rpm=sim.rpm;
    if(running&&!this.canStart()){sim.stop();}
    const firing=sim.running;
    this.actualThrottle=firing?Math.max(.01,throttle):0;
    this.butterflyDeg=firing?3+throttle*87:0;this.throttleFlowPercent=firing?2+throttle*98:0;
    this.boostVacuumBar=firing?sim.boost-.70*(1-throttle):0;
    this.manifoldAbsoluteBar=firing?Math.max(.1,1.01+this.boostVacuumBar):1.01;
    const litres=Math.max(.05,finite(p.litres,2)),ve=clamp(finite(p.source?.build?.volumetricEfficiency,.46),.1,1.5);
    this.intakeVolumeLMin=firing?litres*rpm*.5*ve:0;
    this.intakeMassKgS=this.intakeVolumeLMin/60*.00118*(this.manifoldAbsoluteBar/1.01);
    this.lambda=firing?.99+throttle*(finite(p.source?.build?.lambda,.88)-.99):.99;
    // Idle use is scaled to the reviewed 3.98L/900RPM example; full-load use is
    // a bounded independent estimate, never a recovered fuel map.
    this.fuelLph=firing?Math.max(.3,litres*.377)*(rpm/Math.max(250,p.idleRpm??850))*(1+throttle*8):0;
    this.exhaustMassKgS=firing?this.intakeMassKgS+this.fuelLph*.745/3600:0;
    this.oxygenPercent=firing?.5+Math.max(0,1-this.lambda)*1.5:20.9;
    this.ignitionAdvanceDeg=firing?7.4+throttle*18+sim.tune.ignition:0;
    this.engineLoad=firing?clamp(.02+throttle*.98,0,1):0;
    this.oilTemperatureC=approach(this.oilTemperatureC,firing?90+throttle*25:28,dt,firing?70:240);
    this.coolantTemperatureC=approach(this.coolantTemperatureC,firing?91+throttle*14:28,dt,firing?45:200);
    this.gearboxOilTemperatureC=approach(this.gearboxOilTemperatureC,firing?31+Math.min(35,sim.speed*.65):28,dt,80);
    this.headerTemperatureC=approach(this.headerTemperatureC,firing?411+throttle*400:28,dt,firing?14:70);
    this.exhaustTemperatureC=this.headerTemperatureC;
    this.tailTemperatureC=approach(this.tailTemperatureC,firing?227+throttle*260:28,dt,firing?24:100);
    this.intakeTemperatureC=approach(this.intakeTemperatureC,27+(firing?sim.boost*8:0),dt,25);
    this.oilPressureBar=firing?clamp((rpm/900)*(2.4-(this.oilTemperatureC-28)*.015)*(this.oilPercent/100),0,8):0;
    if(firing){
      if(!this.unlimitedFuel)this.fuelL=Math.max(0,this.fuelL-this.fuelLph*dt/3600);
      this.batteryPercent=clamp(this.batteryPercent+dt/30,0,100);
      if(this.lifeEnabled)this.oilPercent=clamp(this.oilPercent-dt*(.00015+throttle*.001),0,100);
    }else if(sim.cranking)this.batteryPercent=Math.max(0,this.batteryPercent-dt*.7);
    this.voltage=firing?14-this.engineLoad*.1:12.6+(this.batteryPercent-85)*.008;
    if(firing&&this.fuelL<=0&&!this.unlimitedFuel)sim.stop();
    this.peakPowerPs=Math.max(this.peakPowerPs,sim.power/.73549875);
    this.topSpeedKph=Math.max(this.topSpeedKph,sim.speed*3.6);
    if(firing&&this.engineLoad>.8)this.highLoadSeconds+=dt;
    if(this.zeroTo200===null&&sim.speed*3.6>=200)this.zeroTo200=sim.runTime;
    if(this.zeroTo300===null&&sim.speed*3.6>=300)this.zeroTo300=sim.runTime;
    sim.temperature=this.coolantTemperatureC;
    sim.oilPressureBar=this.oilPressureBar;
  }
  snapshot(){return Object.fromEntries(Object.entries(this).filter(([,v])=>typeof v!=='function'));}
}
