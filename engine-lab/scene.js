import * as THREE from 'three';
import {OrbitControls} from 'three/addons/OrbitControls.js';
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const metal=(color,roughness=.35,metalness=.7)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
const Y=V(0,1,0),TAU=Math.PI*2;
function put(geo,mat,parent,x=0,y=0,z=0){const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function box(w,h,d,mat,parent,x=0,y=0,z=0){return put(new THREE.BoxGeometry(w,h,d),mat,parent,x,y,z);}
function cyl(r,h,mat,parent,x=0,y=0,z=0,segments=24){return put(new THREE.CylinderGeometry(r,r,h,segments),mat,parent,x,y,z);}
function pipe(points,r,mat,parent){return put(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>V(...p))),24,r,8,false),mat,parent);}
function rodBetween(mesh,a,b,radius=1){mesh.position.copy(a).add(b).multiplyScalar(.5);const d=V().subVectors(b,a);mesh.scale.set(radius,d.length(),radius);mesh.quaternion.setFromUnitVectors(Y,d.normalize());}
export class World {
  constructor(container){
    this.container=container;this.mode='bench';this.cutaway=true;this.slow=false;
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.8));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.3;
    container.append(this.renderer.domElement);
    this.camera=new THREE.PerspectiveCamera(39,1,.1,3500);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=true;this.controls.dampingFactor=.065;this.controls.minDistance=4.5;this.controls.maxDistance=19;this.controls.maxPolarAngle=Math.PI*.49;this.controls.minPolarAngle=.1;this.controls.enablePan=false;
    this.bench=new THREE.Scene();this.bench.background=new THREE.Color(0x0b1116);this.bench.fog=new THREE.Fog(0x0b1116,16,35);
    this.bench.add(new THREE.HemisphereLight(0xe1e8ee,0x10151b,2.3));
    // Local studio reflection panels make the alloy readable without external assets.
    const faces=Array.from({length:6},(_,i)=>{const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d'),g=ctx.createLinearGradient(0,0,128,128);g.addColorStop(0,'#c9d2de');g.addColorStop(.2,'#25323e');g.addColorStop(.43,i===2?'#eaf1fa':'#708293');g.addColorStop(.52,'#f4f6fb');g.addColorStop(.62,'#25323c');g.addColorStop(1,'#141e28');ctx.fillStyle=g;ctx.fillRect(0,0,128,128);return c;});
    const environment=new THREE.CubeTexture(faces);environment.needsUpdate=true;environment.colorSpace=THREE.SRGBColorSpace;this.bench.environment=environment;
    const light=new THREE.DirectionalLight(0xffe2b6,5);light.position.set(3,8,5);light.castShadow=true;light.shadow.mapSize.set(1024,1024);light.shadow.camera.left=-7;light.shadow.camera.right=7;light.shadow.camera.top=7;light.shadow.camera.bottom=-7;light.shadow.bias=-.0005;this.bench.add(light);
    const rim=new THREE.DirectionalLight(0xa8c0e0,3);rim.position.set(-5,3,-6);this.bench.add(rim);
    const front=new THREE.DirectionalLight(0xcfd9eb,1.4);front.position.set(5,1,7);this.bench.add(front);
    const floor=put(new THREE.PlaneGeometry(80,80),new THREE.ShadowMaterial({opacity:.2}),this.bench,0,-.12,0);floor.rotation.x=-Math.PI/2;
    const grid=new THREE.GridHelper(35,35,0x34434b,0x26323a);grid.position.y=-.105;grid.material.transparent=true;grid.material.opacity=.08;this.bench.add(grid);
    const base=cyl(3.65,.18,metal(0x111820,.8,.25),this.bench,0,-.015,0,96);base.material.envMapIntensity=.2;
    const ring=put(new THREE.TorusGeometry(3.55,.019,6,96),new THREE.MeshBasicMaterial({color:0x97774e}),this.bench,0,.085,0);ring.rotation.x=Math.PI/2;
    for(let i=0;i<24;i++){const a=i/24*TAU;const mark=box(.02,.005,.11,metal(0xb1ae84,.4,.5),this.bench,3.34*Math.sin(a),.082,3.34*Math.cos(a));mark.rotation.y=a;}
    this.makeRoad();this.resetCamera();
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(container);this.resize();
  }
  resize(){const w=this.container.clientWidth,h=this.container.clientHeight;if(w&&h){this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}}
  buildEngine(p,tune){
    if(this.engine){this.bench.remove(this.engine);const gs=new Set(),ms=new Set();this.engine.traverse(o=>{if(o.geometry)gs.add(o.geometry);if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>ms.add(m));});gs.forEach(g=>g.dispose());ms.forEach(m=>{m.map?.dispose();m.dispose();});}
    this.engine=new THREE.Group();this.engine.position.set(.32,.2,0);this.engine.rotation.y=-.2;this.bench.add(this.engine);this.pistons=[];this.rotators=[];this.liners=[];this.shells=[];this.engineLayout=p.layout;
    if(p.isRotary){const sign=new THREE.Sprite(new THREE.SpriteMaterial({map:this.labelTexture('转子结构暂未复现','#edc58d','#243e31')}));sign.position.set(0,1.4,0);sign.scale.set(4.8,.8,1);this.engine.add(sign);return;}
    const alloy=metal(0xbfc8d1,.23,.88),steel=metal(0x52616c,.25,.83),dark=metal(0x2a353d,.45,.72),bronze=metal(p.color,.42,.32),rubber=metal(0x151b20,.86,.03),bolts=metal(0xd7e0e7,.18,.9);
    const boreScale=p.boreMm?THREE.MathUtils.clamp(p.boreMm/86,.65,1.4):1;
    const n=p.cylinders,bankCount=p.layout==='inline'?1:p.layout==='w'?4:2,per=n/bankCount,spacing=.79*boreScale,length=per*spacing+.68;
    const bankAngle=p.bankAngleDeg!==undefined?p.bankAngleDeg*Math.PI/360:p.layout==='v'?Math.PI*.24:p.layout==='boxer'?Math.PI*.48:0;
    const sump=box(p.layout==='inline'?1.05:1.65,.3,length+.3,dark,this.engine,0,.22,0);this.shells.push(sump);
    box(.9,.11,length+.55,alloy,this.engine,0,.045,0);
    const shaft=cyl(.12,length+.95,steel,this.engine,0,.67,0);shaft.rotation.x=Math.PI/2;
    for(let b=0;b<bankCount;b++){
      const bank=new THREE.Group();bank.rotation.z=bankCount===4?[-bankAngle,-bankAngle/3,bankAngle/3,bankAngle][b]:b===0?bankAngle:-bankAngle;this.engine.add(bank);
      if(p.layout==='boxer')bank.position.y=.5;
      const side=b===0?1:-1;
      const cover=box(.78,.15,length,bronze,bank,0,2.58,0);cover.userData.bank=b;this.shells.push(cover);
      for(const x of [-.31,.31]){const wall=box(.1,1.2,length,alloy,bank,x,1.82,0);wall.userData.bank=b;this.shells.push(wall);}
      for(let i=0;i<per;i++){
        const z=(i-(per-1)/2)*spacing,index=i*bankCount+b;
        const phase=(p.cylinders===4&&p.layout==='inline'?[0,2,3,1][i]:index)*Math.PI*4/n;
        const linerMat=new THREE.MeshPhysicalMaterial({color:0x80b6a4,metalness:.23,roughness:.2,transparent:true,opacity:.2,side:THREE.DoubleSide,depthWrite:false});
        const liner=put(new THREE.CylinderGeometry(.355,.355,1.2,32,1,true),linerMat,bank,0,1.82,z);liner.scale.set(boreScale,1,boreScale);this.liners.push(liner);
        for(const y of [1.22,2.42]){const cuff=put(new THREE.TorusGeometry(.36,.04,7,32),steel,bank,0,y,z);cuff.rotation.x=Math.PI/2;}
        const pistonGroup=new THREE.Group();pistonGroup.position.set(0,1.8,z);pistonGroup.scale.set(boreScale,1,boreScale);bank.add(pistonGroup);
        cyl(.293,.28,alloy,pistonGroup);
        const crown=cyl(.285,.028,bronze,pistonGroup,0,.15,0);
        for(const y of [.067,.109]){const band=put(new THREE.TorusGeometry(.295,.012,5,24),steel,pistonGroup,0,y,0);band.rotation.x=Math.PI/2;}
        const pin=cyl(.07,.61,bolts,pistonGroup);pin.rotation.z=Math.PI/2;
        const rod=cyl(.065,1,alloy,bank);const eye=cyl(.115,.13,bronze,bank);eye.rotation.x=Math.PI/2;
        const web=new THREE.Group();web.position.set(0,.67,z);bank.add(web);this.rotators.push({mesh:web,phase});
        const weight=put(new THREE.CylinderGeometry(.32,.32,.07,24,1,false,0,Math.PI*1.4),steel,web,0,0,0);weight.rotation.x=Math.PI/2;
        const crankPin=cyl(.11,.32,bronze,web,.27,0,0);crankPin.rotation.x=Math.PI/2;
        const fire=put(new THREE.SphereGeometry(.26,12,8),new THREE.MeshBasicMaterial({color:0xffb33c,transparent:true,opacity:0,depthWrite:false}),bank,0,2.29,z);fire.scale.y=.4;
        const valves=[];
        for(const x of [-.16,.16]){const stem=cyl(.022,.32,bolts,bank,x,2.48,z);const head=cyl(.105,.035,x<0?steel:bronze,bank,x,2.32,z);valves.push({stem,head,x});}
        for(const x of [-.28,.28])for(const dz of [-.27,.27])cyl(.035,.055,bolts,bank,x,2.7,z+dz,8);
        pipe([[.27,2.38,z],[.65,2.3,z],[.83,1.8,z],[1.0,1.4,z+side*.15]],.065,bronze,bank);
        pipe([[-.26,2.4,z],[-.59,2.34,z],[-.67,1.99,z],[-.7,1.95,z+.1]],.085,steel,bank);
        this.pistons.push({group:pistonGroup,rod,eye,fire,valves,z,phase});
      }
      for(const x of [-.17,.17]){const cam=cyl(.04,length+.2,steel,bank,x,2.76,0);cam.rotation.x=Math.PI/2;this.rotators.push({mesh:cam,axis:'z',phase:0,cam:true});}
      const rail=cyl(.11,length+.2,steel,bank,-.77,1.95,0);rail.rotation.x=Math.PI/2;
    }
    const frontZ=length/2+.33;
    const wheel=new THREE.Group();wheel.position.set(0,.67,frontZ);this.engine.add(wheel);this.rotators.push({mesh:wheel,phase:0});
    const fly=cyl(.61,.1,steel,wheel);fly.rotation.x=Math.PI/2;
    for(const r of [.17,.49,.62]){const edge=put(new THREE.TorusGeometry(r,.025,8,48),bronze,wheel,0,0,.055);}
    for(let i=0;i<12;i++){const a=i/12*TAU;cyl(.035,.025,bolts,wheel,Math.sin(a)*.41,Math.cos(a)*.41,.07).rotation.x=Math.PI/2;}
    for(let i=0;i<8;i++){const a=i/8*TAU;box(.13,.13,.13,dark,wheel,Math.sin(a)*.28,Math.cos(a)*.28,.07);}
    const pulley=cyl(.23,.11,bronze,this.engine,0,2.48,frontZ);pulley.rotation.x=Math.PI/2;this.rotators.push({mesh:pulley,phase:0,axis:'y'});
    pipe([[-.59,.67,frontZ],[-.46,1.4,frontZ],[-.23,2.48,frontZ],[0,2.7,frontZ],[.23,2.48,frontZ],[.46,1.4,frontZ],[.59,.67,frontZ]],.028,rubber,this.engine);
    if(tune.boost>0&&p.induction==='supercharger'){
      box(.8,.37,length*.73,alloy,this.engine,0,2.45,-.05);
      for(let i=0;i<8;i++)box(.84,.025,.035,steel,this.engine,0,2.65,-length*.3+i*length*.6/7);
      const blowerPulley=cyl(.2,.12,steel,this.engine,0,2.45,frontZ+.12);blowerPulley.rotation.x=Math.PI/2;this.rotators.push({mesh:blowerPulley,phase:0});
      pipe([[-.21,2.45,frontZ+.18],[-.25,.67,frontZ+.18],[.25,.67,frontZ+.18],[.21,2.45,frontZ+.18]],.024,rubber,this.engine);
    }else if(tune.boost>0){
      const turbo=put(new THREE.TorusGeometry(.3,.12,12,32,Math.PI*1.85),alloy,this.engine,1.45,1.15,-length*.25);turbo.rotation.y=Math.PI/2;
      const turbine=cyl(.23,.15,bronze,this.engine,1.46,1.15,-length*.25);turbine.rotation.z=Math.PI/2;
      pipe([[1.45,1.4,-length*.25],[1.5,1.8,-length*.25],[1.4,2.1,-length*.1],[.8,2.5,0]],.11,alloy,this.engine);
    }
    for(const x of [-.64,.64])for(const z of [-length*.35,length*.35]){box(.17,.19,.3,dark,this.engine,x,.02,z);box(.27,.06,.4,alloy,this.engine,x,-.07,z);}
    const scale=Math.min(p.layout==='boxer'?.88:p.cylinders>=12?.89:1,5.5/(length+1));this.engine.scale.setScalar(scale);
    this.setCutaway(this.cutaway);
  }
  setCutaway(on){this.cutaway=on;this.liners?.forEach(m=>{m.material.opacity=on?.13:.83;});this.shells?.forEach(m=>{m.visible=!on||(this.engineLayout!=='inline'&&m.userData.bank===0);});}
  resetCamera(){this.camera.position.set(7.5,5.6,8.8);this.controls.target.set(.25,1.2,0);this.controls.update();}
  setMode(mode){this.mode=mode;this.controls.enabled=mode==='bench';if(mode==='bench')this.resetCamera();else {this.camera.position.set(-2.15,3.5,8);this.camera.lookAt(-2.15,1,-15);}}
  labelTexture(text,color='#e7d6a8',bg='#20352b',w=768,h=128){const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);ctx.fillStyle=color;ctx.font='bold 55px Segoe UI';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,w/2,h/2);const tx=new THREE.CanvasTexture(c);tx.colorSpace=THREE.SRGBColorSpace;return tx;}
  car(color){
    const group=new THREE.Group(),body=metal(color,.25,.6),rubber=metal(0x141d1b,.85,.06),rim=metal(0xa9b0a1,.27,.9),glass=metal(0x172f30,.12,.48),dark=metal(0x24312b,.65,.3);
    const shape=new THREE.Shape();shape.moveTo(-.75,-1.88);shape.lineTo(.75,-1.88);shape.lineTo(.86,-1.57);shape.lineTo(.86,1.6);shape.lineTo(.66,1.94);shape.lineTo(-.66,1.94);shape.lineTo(-.86,1.6);shape.lineTo(-.86,-1.57);shape.closePath();
    const bodyMesh=put(new THREE.ExtrudeGeometry(shape,{depth:.32,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.09,bevelThickness:.08}),body,group,0,.46,0);bodyMesh.rotation.x=-Math.PI/2;
    box(1.47,.45,1.6,glass,group,0,1,.22);box(1.3,.09,1.35,body,group,0,1.26,.25);
    const wind=box(1.4,.45,.05,glass,group,0,1,-.65);wind.rotation.x=-.42;
    const rear=box(1.35,.36,.05,glass,group,0,1,.99);rear.rotation.x=.45;
    for(const x of [-.73,.73]){box(.07,.47,1.63,body,group,x,1,.18);box(.24,.09,.23,body,group,x*1.27,.98,-.55);}
    for(const z of [-1.21,1.25])for(const x of [-.89,.89]){
      const wheel=new THREE.Group();wheel.position.set(x,.38,z);group.add(wheel);group.userData.wheels??=[];group.userData.wheels.push(wheel);
      cyl(.365,.24,rubber,wheel,0,0,0).rotation.z=Math.PI/2;cyl(.265,.25,rim,wheel,0,0,0).rotation.z=Math.PI/2;cyl(.19,.26,dark,wheel,0,0,0).rotation.z=Math.PI/2;
      for(let i=0;i<6;i++){const a=i/6*TAU;const spoke=box(.27,.032,.37,rim,wheel);spoke.rotation.x=a;}
    }
    const white=new THREE.MeshStandardMaterial({color:0xfff4cb,emissive:0xffe3a0,emissiveIntensity:2}),red=new THREE.MeshStandardMaterial({color:0xff6846,emissive:0xc92d18,emissiveIntensity:2});
    for(const x of [-.57,.57]){box(.39,.07,.055,white,group,x,.65,-2.02);box(.46,.065,.045,red,group,x,.7,1.98);}
    box(1.3,.09,.12,dark,group,0,.38,-2.02);box(1.37,.12,.13,dark,group,0,.36,2);
    const plate=put(new THREE.PlaneGeometry(.5,.14),new THREE.MeshBasicMaterial({map:this.labelTexture('LAB','#162b22','#c6cbb4',256,64)}),group,0,.57,2.045);
    return group;
  }
  makeRoad(){
    this.road=new THREE.Scene();this.road.background=new THREE.Color(0x82958a);this.road.fog=new THREE.FogExp2(0x82958a,.0016);
    this.road.add(new THREE.HemisphereLight(0xffe8bf,0x324a35,3));
    const sun=new THREE.DirectionalLight(0xffdb9d,4);sun.position.set(-40,80,25);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-22;sun.shadow.camera.right=22;sun.shadow.camera.top=22;sun.shadow.camera.bottom=-22;this.road.add(sun);this.sun=sun;this.road.add(sun.target);
    const ground=put(new THREE.PlaneGeometry(5000,7000),metal(0x697657,1,0),this.road,0,-.11,-2800);ground.rotation.x=-Math.PI/2;
    const road=box(12,.12,5600,metal(0x4e5751,.98,.03),this.road,0,-.06,-2600);
    const white=metal(0xd9d7bd,.88,0),orange=metal(0xb9754d,.9,0);
    for(const x of [-5.8,5.8])box(.12,.015,5600,white,this.road,x,.01,-2600);
    const marks=new THREE.InstancedMesh(new THREE.BoxGeometry(.11,.018,4.5),white,460),dummy=new THREE.Object3D();
    for(let i=0;i<460;i++){dummy.position.set(0,.015,100-i*12);dummy.updateMatrix();marks.setMatrixAt(i,dummy.matrix);}this.road.add(marks);
    const curbs=new THREE.InstancedMesh(new THREE.BoxGeometry(.65,.07,3),orange,2*900);
    for(let side=0;side<2;side++)for(let i=0;i<900;i++){dummy.position.set(side===0?-6.15:6.15,.02,100-i*6);dummy.updateMatrix();curbs.setMatrixAt(side*900+i,dummy.matrix);}this.road.add(curbs);
    const grass=metal(0x455f47,1,0),trunk=metal(0x665941,1,0),treeTops=new THREE.InstancedMesh(new THREE.ConeGeometry(2,7,6),grass,180),treeTrunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.22,.36,4,5),trunk,180);
    for(let i=0;i<180;i++){const side=i%2===0?-1:1,spread=(Math.sin(i*73.3)+1)*11;dummy.position.set(side*(16+spread),5,-i*27+35);dummy.scale.setScalar(.7+(Math.sin(i*21)+1)*.35);dummy.updateMatrix();treeTops.setMatrixAt(i,dummy.matrix);dummy.position.y=2;dummy.updateMatrix();treeTrunks.setMatrixAt(i,dummy.matrix);}this.road.add(treeTops,treeTrunks);
    for(let i=0;i<24;i++){const hill=put(new THREE.ConeGeometry(60+(i%5)*20,45+(i%7)*12,6),metal(i%2?0x627863:0x546e5b,1,0),this.road,(i%2?-1:1)*(130+i%4*45),12,-i*180-150);hill.rotation.y=i;}
    const barrier=metal(0x9ca79a,.6,.4);for(const x of [-8,8])box(.12,.25,5600,barrier,this.road,x,.72,-2600);
    for(const z of [0,-400]){
      for(const x of [-7.5,7.5])box(.28,5.5,.4,metal(0x334d3d,.65,.5),this.road,x,2.7,z);
      box(15.4,.65,.5,metal(0x243b30,.5,.6),this.road,0,5.3,z);
      const sign=put(new THREE.PlaneGeometry(11,.65),new THREE.MeshBasicMaterial({map:this.labelTexture(z===0?'ENGINE LAB   //   START':'400 M   //   FINISH')}),this.road,0,5.32,z+.27);
      for(let x=0;x<20;x++){const tile=box(.6,.018,.5,x%2===0?white:metal(0x242d27,.9,0),this.road,-5.7+x*.6,.025,z);}
    }
    this.carMesh=this.car(0xd3b376);this.opponent=this.car(0x8cb6af);this.carMesh.position.x=-2.15;this.opponent.position.x=2.15;this.road.add(this.carMesh,this.opponent);this.opponent.visible=false;
    this.raceLights=[];for(let i=0;i<3;i++){const lamp=put(new THREE.SphereGeometry(.16,12,8),new THREE.MeshStandardMaterial({color:0x362e22,emissive:0x000000}),this.road,-.65+i*.65,4.65,.3);this.raceLights.push(lamp);}
  }
  update(sim,dt,race){
    if(this.mode==='bench'){
      this.controls.update();if(this.engine){
        const displayAngle=this.slow?(this.slowAngle=(this.slowAngle??sim.angle)+(sim.running?dt*2:0)):sim.angle;
        for(const part of this.pistons){
          const theta=displayAngle-part.phase,r=.27,l=sim.preset.rodRatio?r*2*sim.preset.rodRatio:.94,pin=V(r*Math.sin(theta),.67+r*Math.cos(theta),part.z),py=.67+r*Math.cos(theta)+Math.sqrt(l*l-(r*Math.sin(theta))**2);
          part.group.position.y=py;rodBetween(part.rod,pin,V(0,py-.05,part.z));part.eye.position.copy(pin);
          const cycle=((theta%(Math.PI*4))+Math.PI*4)%(Math.PI*4);
          part.fire.material.opacity=sim.running&&cycle<.8?.32*(1-cycle/.8)*(0.2+sim.throttle):0;
          for(let j=0;j<part.valves.length;j++){const v=part.valves[j],open=j===0?(cycle>Math.PI*2&&cycle<Math.PI*3):(cycle>Math.PI*3);v.head.position.y=2.32-(open?.09:0);v.stem.position.y=2.48-(open?.09:0);}
        }
        for(const r of this.rotators){const angle=displayAngle*(r.cam?.5:1)-r.phase;if(r.axis==='z')r.mesh.rotation.y=angle;else if(r.axis==='y')r.mesh.rotation.y=angle;else r.mesh.rotation.z=angle;}
        this.engine.position.y=.2+(sim.running?Math.sin(sim.time*37)*.003*(.2+sim.throttle):0);
      }
      this.renderer.render(this.bench,this.camera);
    }else{
      this.carMesh.position.set(sim.x,Math.sin(sim.time*15)*sim.speed*.0002,-sim.distance);this.carMesh.rotation.y=-sim.heading;
      this.carMesh.userData.wheels.forEach(w=>w.rotation.x=-sim.distance/.365);
      const target=V(sim.x*.7,3.35+sim.speed*.006,-sim.distance+8.2+sim.speed*.025);
      this.camera.position.lerp(target,1-Math.exp(-dt*5));this.camera.lookAt(sim.x*.5,1.2,-sim.distance-17);
      this.sun.position.set(sim.x-40,80,-sim.distance+25);this.sun.target.position.set(sim.x,0,-sim.distance-15);
      this.opponent.visible=!!race&&race.state!=='idle';if(this.opponent.visible){this.opponent.position.z=-race.rival.distance;this.opponent.userData.wheels.forEach(w=>w.rotation.x=-race.rival.distance/.365);}
      for(let i=0;i<3;i++){const mat=this.raceLights[i].material,lit=race?.state==='countdown'&&race.countdown<3-i;const green=race?.state==='running'||race?.state==='finished';mat.color.setHex(green?0x96c88b:lit?0xdf753f:0x362e22);mat.emissive.setHex(green?0x3f9e46:lit?0xab3e0d:0);}
      this.renderer.render(this.road,this.camera);
    }
  }
}
