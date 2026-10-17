import {phonePreset} from './phone-adapter.mjs';
const $=id=>document.getElementById(id);
export class PhoneUI {
  constructor(library,{getPreset,onSelect,onDialog}){
    this.library=library;this.snapshot=0;this.getPreset=getPreset;this.onSelect=onSelect;this.onDialog=onDialog;
    $('phoneSearch').addEventListener('input',()=>this.render());$('phoneEngine').addEventListener('change',()=>{if($('phoneEngine').value)onSelect($('phoneEngine').value,this.snapshot);});
    for(let i=0;i<2;i++)$('phoneSnapshot'+i).addEventListener('click',()=>onSelect(undefined,i));
    $('phoneRawButton').addEventListener('click',()=>this.showSource());$('closeSource').addEventListener('click',()=>$('sourceDialog').close());
  }
  setLibrary(library){this.library=library;this.snapshot=0;$('phoneSearch').value='';}
  render(){
    const preset=this.getPreset(),select=$('phoneEngine'),query=$('phoneSearch').value.trim().toLocaleLowerCase();select.replaceChildren();
    const first=document.createElement('option');first.value='';first.textContent='选择手机发动机';select.append(first);
    if(!this.library){$('phoneSummary').textContent='可通过「导入调校」载入手机 JSON。';return;}
    let blocked=0;
    for(const item of this.library.engines){
      const p=phonePreset(item,this.library.snapshots?.[this.snapshot]);if(!p.playable)blocked++;
      if(query&&!String(item.build.name+' '+item.key).toLocaleLowerCase().includes(query))continue;
      const option=document.createElement('option');option.value=item.key;option.textContent=p.name+(p.playable?'':' · 只保留参数');option.disabled=!p.playable;select.append(option);
    }
    select.value=preset.phone?preset.sourceKey:'';$('phoneCount').textContent=this.library.engines.length;
    $('phoneSummary').textContent=`${this.library.engines.length} 条配置 · ${blocked} 条极限配置保留原值`;
    for(let i=0;i<2;i++){$('phoneSnapshot'+i).classList.toggle('hidden',!this.library.snapshots?.[i]);$('phoneSnapshot'+i).classList.toggle('active',preset.phone&&this.library.snapshots?.[i]?.engineType===preset.sourceKey&&this.snapshot===i);}
    $('phoneRawButton').disabled=!preset.phone;
  }
  showSource(){
    const preset=this.getPreset();if(!preset.source)return;this.onDialog();const s=preset.source,b=s.build,v=s.vehicle;$('sourceTitle').textContent=preset.name;$('sourceFacts').replaceChildren();
    const facts=[['缸数 / 布局',`${b.cylinders} / ${b.layout}`],['缸径 × 行程',`${b.boreMm} × ${b.strokeMm} mm`],['压缩比',b.compressionRatio],['怠速 / 红线',`${b.idleRpm} / ${b.redlineRpm} r/min`],['增压类型 / 目标',`${b.induction} / ${b.boostBar} bar`],['车重',`${v.massKg} kg`],['变速箱',v.label],['前进挡 / 终传',`${v.ratios.length-1} / ${v.finalDrive}`],['轮胎周长',`${v.tireCircumferenceM} m`],['声音与控制项',`${Object.keys(s.values||{}).length} 项，仅保留未全部应用`]];
    for(const [label,value]of facts){const el=document.createElement('div'),name=document.createElement('span'),val=document.createElement('b');name.textContent=label;val.textContent=String(value);el.append(name,val);$('sourceFacts').append(el);}
    $('sourceJson').textContent=JSON.stringify({engine:b,vehicle:v,exportTimeGlobalValues:s.values,acousticSettings:s.acousticSettings,automaticTransmission:s.automaticTransmission,exhaustLayout:s.exhaustLayout,headerLayout:s.headerLayout},null,2);$('sourceDialog').showModal();
  }
}
