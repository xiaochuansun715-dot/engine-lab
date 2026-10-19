// Observed V8 full-throttle UI peaks constrain this interpolated display/model.
// Intermediate points and all tuning extrapolation are independently chosen.
const POWER_PS_TO_KW=.73549875;
export function hasObservedStockV8(p){
  const b=p.source?.build;
  return p.sourceKey==='v8'&&p.source?.custom!==true&&p.source?.engineSettings?.inductionMode==='stock'&&
    b?.cylinders===8&&b.layout==='v'&&b.boreMm===83&&b.strokeMm===92&&b.compressionRatio===10.5&&b.volumetricEfficiency===.46;
}
export const V8_DYNO_REFERENCE={powerPs:574,powerRpm:7200,torqueNm:700,torqueRpm:4079,wheelPowerPs:511,
  source:'outputs/iPad结构化快照-20261019/evidence/screenshots/workshop-off-07.png',kind:'reviewed-ui-prediction'};
export function observedV8Torque(rpm){
  const endTorque=V8_DYNO_REFERENCE.powerPs*POWER_PS_TO_KW*9549.3/7200;
  const points=[[0,0],[900,300],[1500,450],[2800,640],[4079,700],[5000,680],[6000,625],[7200,endTorque],[10000,0]];
  const i=points.findIndex(([x])=>x>=rpm);
  if(i<=0)return 0;
  const [x1,y1]=points[i-1],[x2,y2]=points[i];
  return y1+(y2-y1)*(rpm-x1)/(x2-x1);
}
