import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const joints = [
  {name:"J1 · BASE ROTATION",min:-180,max:180,value:0,axis:"y"},
  {name:"J2 · SHOULDER",min:-90,max:90,value:-20,axis:"z"},
  {name:"J3 · ELBOW",min:-135,max:135,value:55,axis:"z"},
  {name:"J4 · WRIST PITCH",min:-180,max:180,value:0,axis:"z"},
  {name:"J5 · WRIST ROLL",min:-120,max:120,value:0,axis:"y"},
  {name:"J6 · TOOL ROTATION",min:-180,max:180,value:0,axis:"z"}
];
let scene, camera, renderer, controls, arm, targetMarker, workpiece, gripperLeft, gripperRight;
let jointGroups=[], animationId, running=false, runStart=0, cycleElapsed=0, lastFrame=0;
let initialValues=joints.map(j=>j.value), toastTimer, sequenceTimer=null, sequenceIndex=0;
const linkLengths=[1.35,1.05,.72];

function notify(message){const t=$("toast");t.textContent=message;t.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove("show"),2600)}
function buildControls(){
  const host=$("jointList");
  host.innerHTML="";
  joints.forEach((j,i)=>{
    const row=document.createElement("div");row.className="joint-row";
    row.innerHTML=`<div class="joint-head"><label>${j.name}</label><output id="jointOut${i}">${j.value}°</output></div><input id="joint${i}" type="range" min="${j.min}" max="${j.max}" value="${j.value}" step="1">`;
    host.appendChild(row);
    const input=$(`joint${i}`);
    input.addEventListener("input",()=>{j.value=Number(input.value);$(`jointOut${i}`).textContent=`${j.value}°`;updateArm();updateMetrics();});
  });
}
function makeMaterial(color,metalness=.55,roughness=.35){return new THREE.MeshStandardMaterial({color,metalness,roughness})}
function box(w,h,d,mat,x=0,y=0,z=0){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;return m}
function cylinder(rt,rb,h,mat,x=0,y=0,z=0,segments=32){const m=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,segments),mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;return m}
function makeLink(parent,length,radius,material){
  const pivot=new THREE.Group();parent.add(pivot);
  const shaft=cylinder(radius*.72,radius,length,material,0,length/2,0);
  pivot.add(shaft);
  const collar=cylinder(radius*1.2,radius*1.2,.11,makeMaterial(0x29434d),0,.09,0);pivot.add(collar);
  const end=cylinder(radius*1.18,radius*1.18,.12,makeMaterial(0x29434d),0,length-.06,0);pivot.add(end);
  return pivot;
}
function initScene(){
  const mount=$("viewport");
  scene=new THREE.Scene();scene.background=new THREE.Color(0x0b151e);scene.fog=new THREE.Fog(0x0b151e,12,25);
  camera=new THREE.PerspectiveCamera(42,mount.clientWidth/mount.clientHeight,.1,100);camera.position.set(5.4,4.5,6.8);
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(mount.clientWidth,mount.clientHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;mount.prepend(renderer.domElement);
  controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,1.3,0);controls.enableDamping=true;controls.dampingFactor=.06;controls.maxPolarAngle=Math.PI*.48;controls.minDistance=3.2;controls.maxDistance=13;
  scene.add(new THREE.HemisphereLight(0x9ed8e4,0x18212a,2.0));
  const key=new THREE.DirectionalLight(0xffffff,3.2);key.position.set(4,8,5);key.castShadow=true;key.shadow.mapSize.set(1024,1024);scene.add(key);
  const rim=new THREE.PointLight(0x32d6c5,28,10);rim.position.set(-3,3,1);scene.add(rim);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(18,18),makeMaterial(0x101b24,.2,.8));floor.rotation.x=-Math.PI/2;floor.position.y=-.03;floor.receiveShadow=true;scene.add(floor);
  const grid=new THREE.GridHelper(18,36,0x2b6667,0x20313b);grid.position.y=-.015;scene.add(grid);
  const platform=new THREE.Mesh(new THREE.CylinderGeometry(1.0,1.12,.24,64),makeMaterial(0x263b46));platform.position.y=.12;platform.castShadow=true;scene.add(platform);
  const platformRing=new THREE.Mesh(new THREE.TorusGeometry(.91,.025,8,80),new THREE.MeshBasicMaterial({color:0x39d8c5}));platformRing.rotation.x=Math.PI/2;platformRing.position.y=.25;scene.add(platformRing);
  // Workcell boundary rails
  const railMat=makeMaterial(0x263c49,.7,.25);
  for(let x of [-2.6,2.6]){const rail=box(.06,.12,5.2,railMat,x,.06,-.3);scene.add(rail)}
  for(let z of [-2.9,2.3]){const rail=box(5.2,.12,.06,railMat,0,.06,z);scene.add(rail)}
  // Workpiece conveyor
  const conveyor=box(1.45,.28,2.8,makeMaterial(0x1b2a34),2.15,.32,-.25);scene.add(conveyor);
  for(let i=0;i<9;i++){const roller=cylinder(.09,.09,1.35,makeMaterial(0x40535d),2.15,.52,-1.45+i*.3,20);roller.rotation.z=Math.PI/2;scene.add(roller)}
  workpiece=new THREE.Group();workpiece.add(box(.38,.34,.38,makeMaterial(0xffa35e,.35,.28),0,.2,0));const top=box(.2,.035,.2,makeMaterial(0xffd2a8,.25,.3),0,.39,0);workpiece.add(top);workpiece.position.set(2.15,.58,-.85);scene.add(workpiece);
  targetMarker=new THREE.Group();const ring=new THREE.Mesh(new THREE.TorusGeometry(.38,.025,8,48),new THREE.MeshBasicMaterial({color:0xa78bfa}));ring.rotation.x=Math.PI/2;targetMarker.add(ring);const targetBeam=new THREE.Mesh(new THREE.CylinderGeometry(.012,.012,.65,8),new THREE.MeshBasicMaterial({color:0xa78bfa,transparent:true,opacity:.35}));targetBeam.position.y=.32;targetMarker.add(targetBeam);targetMarker.position.set(-1.8,.03,1.3);scene.add(targetMarker);
  buildArm();
  window.addEventListener("resize",resizeScene);
  $("loading").classList.add("hidden");
  animate();
}
function buildArm(){
  arm=new THREE.Group();scene.add(arm);
  const dark=makeMaterial(0x253c47,.8,.25),white=makeMaterial(0xb7cbd0,.65,.27),cyan=makeMaterial(0x39d6c3,.65,.22),black=makeMaterial(0x101a21,.5,.3);
  arm.position.set(0,.25,0);
  const base=cylinder(.55,.65,.38,dark,0,.18,0,48);arm.add(base);
  const baseTop=cylinder(.39,.42,.16,cyan,0,.42,0,48);arm.add(baseTop);
  const basePivot=new THREE.Group();basePivot.position.y=.5;arm.add(basePivot);jointGroups=[basePivot];
  basePivot.add(cylinder(.32,.32,.28,dark,0,.05,0));
  const shoulder=new THREE.Group();shoulder.position.y=.12;basePivot.add(shoulder);jointGroups.push(shoulder);
  shoulder.add(new THREE.Mesh(new THREE.SphereGeometry(.29,24,18),cyan));
  const l1=makeLink(shoulder,linkLengths[0],.2,white);l1.rotation.z=0;
  const elbow=new THREE.Group();elbow.position.y=linkLengths[0];shoulder.add(elbow);jointGroups.push(elbow);
  elbow.add(new THREE.Mesh(new THREE.SphereGeometry(.23,24,18),cyan));
  makeLink(elbow,linkLengths[1],.16,white);
  const wrist=new THREE.Group();wrist.position.y=linkLengths[1];elbow.add(wrist);jointGroups.push(wrist);
  wrist.add(new THREE.Mesh(new THREE.SphereGeometry(.18,20,16),cyan));
  makeLink(wrist,linkLengths[2],.12,white);
  const wristRoll=new THREE.Group();wristRoll.position.y=linkLengths[2];wrist.add(wristRoll);jointGroups.push(wristRoll);
  wristRoll.add(cylinder(.17,.17,.18,dark,0,.06,0));
  const tool=new THREE.Group();tool.position.y=.15;wristRoll.add(tool);jointGroups.push(tool);
  tool.add(cylinder(.12,.12,.16,cyan,0,.04,0));
  gripperLeft=box(.055,.32,.07,black,-.11,.22,0);gripperRight=box(.055,.32,.07,black,.11,.22,0);tool.add(gripperLeft,gripperRight);
  const tip=new THREE.Mesh(new THREE.SphereGeometry(.045,16,12),new THREE.MeshBasicMaterial({color:0x8ffff0}));tip.position.y=.43;tool.add(tip);
  arm.userData.tool=tool;
  updateArm();
}
function updateArm(){
  if(!jointGroups.length)return;
  jointGroups.forEach((g,i)=>{const v=THREE.MathUtils.degToRad(joints[i].value);if(joints[i].axis==="y")g.rotation.y=v;else g.rotation.z=v;});
  updateMetrics();
}
function getEndPosition(){const p=new THREE.Vector3();arm.userData.tool.getWorldPosition(p);return p}
function updateMetrics(){if(!arm)return;const p=getEndPosition();$("positionMetric").innerHTML=`${p.x.toFixed(2)} <small>/ ${p.y.toFixed(2)} / ${p.z.toFixed(2)} m</small>`;$("dofMetric").textContent="6"}
function resizeScene(){if(!renderer)return;const w=$("viewport").clientWidth,h=$("viewport").clientHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h)}
function animate(now=0){animationId=requestAnimationFrame(animate);const dt=Math.min((now-lastFrame)/1000,.05)||0;lastFrame=now;controls.update();if(workpiece&&running){}renderer.render(scene,camera);if(now%10<1){$("fps").textContent=`${Math.min(60,Math.round(1/Math.max(dt,.001)))} FPS`}}
function setJoints(values){values.forEach((v,i)=>{joints[i].value=clamp(Math.round(v),joints[i].min,joints[i].max);const input=$(`joint${i}`);if(input){input.value=joints[i].value;$(`jointOut${i}`).textContent=`${joints[i].value}°`}});updateArm()}
function resetJoints(){setJoints(initialValues);$("motionState").textContent="IDLE";notify("Joint configuration reset")}
function setView(view){if(view==="top"){camera.position.set(0,9,.001);controls.target.set(0,1,0)}else if(view==="front"){camera.position.set(0,3.2,9);controls.target.set(0,1.3,0)}else{camera.position.set(5.4,4.5,6.8);controls.target.set(0,1.3,0)}controls.update();document.querySelectorAll("[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===view))}
function solveIK(){
  const x=Number($("targetX").value),y=Number($("targetY").value),z=Number($("targetZ").value);
  if(![x,y,z].every(Number.isFinite)){ $("ikMessage").textContent="Enter valid XYZ coordinates.";return}
  const yaw=Math.atan2(x,z)*180/Math.PI;
  const radial=Math.sqrt(x*x+z*z)-.05;
  const vertical=y-.75;
  const d=Math.sqrt(radial*radial+vertical*vertical);
  const L1=linkLengths[0],L2=linkLengths[1]+linkLengths[2]*.65;
  if(d>L1+L2||d<Math.abs(L1-L2)){ $("ikMessage").textContent="Target is outside the simplified arm reach.";notify("Target outside reachable workspace");return}
  const cosEl=clamp((d*d-L1*L1-L2*L2)/(2*L1*L2),-1,1);
  const elbow=Math.acos(cosEl);
  const shoulder=Math.atan2(vertical,radial)-Math.atan2(L2*Math.sin(elbow),L1+L2*Math.cos(elbow));
  setJoints([yaw,-shoulder*180/Math.PI,elbow*180/Math.PI-90,0,0,0]);
  targetMarker.position.set(x,.03,z);
  $("ikMessage").textContent=`Approximate planar solution · reach ${d.toFixed(2)} m`;
  notify("Inverse kinematics solution applied");
}
function setStep(index){for(let i=1;i<=4;i++){$(`step${i}`).classList.toggle("active",i===index);$("step"+i).classList.toggle("done",i<index)}}
function interpolateJoints(target,duration,label,done){const start=joints.map(j=>j.value),startTime=performance.now();$("motionState").textContent="MOVING";function tick(now){if(!running)return;const t=clamp((now-startTime)/duration,0,1),e=t*t*(3-2*t);setJoints(target.map((v,i)=>start[i]+(v-start[i])*e));if(t<1)requestAnimationFrame(tick);else if(done)done()}requestAnimationFrame(tick)}
function runSequence(){
  if(running){notify("Sequence is already running");return}
  running=true;runStart=performance.now();cycleElapsed=0;$("runBtn").innerHTML="<span>Ⅱ</span> RUNNING";$("motionState").textContent="RUNNING";$("sequenceText").textContent="Executing pick-and-place routine…";
  const phases=[
    {step:1,text:"Approaching workpiece",j:[35,-25,60,-15,0,0],ms:1300},
    {step:2,text:"Gripper engaged",j:[35,-40,75,-20,0,0],ms:900,grip:true},
    {step:3,text:"Transferring to target zone",j:[-45,-15,40,-10,25,0],ms:1700},
    {step:4,text:"Releasing workpiece",j:[-45,-28,65,-25,25,0],ms:850,release:true}
  ];
  let idx=0;
  const next=()=>{if(!running)return;if(idx>=phases.length){finishSequence();return}const p=phases[idx++];setStep(p.step);$("sequenceText").textContent=p.text;if(p.grip){gripperLeft.position.x=-.045;gripperRight.position.x=.045;$("partState").textContent="GRIPPED"}if(p.release){gripperLeft.position.x=-.11;gripperRight.position.x=.11;workpiece.position.set(-1.8,.58,1.3);$("partState").textContent="PLACED"}interpolateJoints(p.j,p.ms,p.text,()=>setTimeout(next,180))};
  next();
}
function finishSequence(){running=false;$("runBtn").innerHTML="<span>▶</span> RUN SEQUENCE";$("motionState").textContent="COMPLETE";$("sequenceText").textContent="Pick-and-place cycle completed.";setStep(4);notify("Simulation sequence completed")}
function stopSequence(){if(!running)return;running=false;$("runBtn").innerHTML="<span>▶</span> RUN SEQUENCE";$("motionState").textContent="STOPPED";$("sequenceText").textContent="Sequence stopped by operator.";notify("Sequence stopped")}
function exportConfig(){const data={project:"ROBOFORGE X",robot:"RF-06 ARMATURE",created:new Date().toISOString(),units:"degrees",joints:joints.map(j=>({name:j.name,angle:j.value,min:j.min,max:j.max})),target:{x:Number($("targetX").value),y:Number($("targetY").value),z:Number($("targetZ").value)},note:"Kinematic demo configuration; not validated for physical hardware."};const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="roboforge-robot-config.json";a.click();URL.revokeObjectURL(a.href);notify("Robot configuration exported")}
function showCode(){const code=`// ROBOFORGE X · RF-06 example joint command\n// Demo output only. Verify limits and calibration before hardware use.\n#include <Servo.h>\nServo joint[6];\nconst int pins[6] = {3,5,6,9,10,11};\nint angles[6] = {${joints.map(j=>j.value).join(", ")}};\nvoid setup() {\n  for (int i=0; i<6; i++) { joint[i].attach(pins[i]); }\n  moveRobot();\n}\nvoid loop() {}\nvoid moveRobot() {\n  for (int i=0; i<6; i++) {\n    int safeAngle = constrain(angles[i] + 90, 0, 180);\n    joint[i].write(safeAngle);\n    delay(250);\n  }\n}`;const blob=new Blob([code],{type:"text/plain"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="roboforge_servo_sequence.ino";a.click();URL.revokeObjectURL(a.href);notify("Arduino starter code generated")}
function updateClock(){const d=new Date();$("clock").textContent=d.toLocaleTimeString("en-GB",{hour12:false});if(running){const s=Math.floor((performance.now()-runStart)/1000);$("cycleTimer").textContent=`${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`}}
function bindEvents(){
  $("resetJoints").onclick=resetJoints;$("applyIK").onclick=solveIK;$("runBtn").onclick=runSequence;$("stopBtn").onclick=stopSequence;$("resetCamera").onclick=()=>setView("perspective");
  document.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>setView(b.dataset.view));
  $("helpBtn").onclick=()=>$("helpModal").classList.add("open");$("closeHelp").onclick=$("closeHelp2").onclick=()=>$("helpModal").classList.remove("open");
  $("navCode").onclick=showCode;$("navTelemetry").onclick=()=>$("telemetryPanel").scrollIntoView({behavior:"smooth",block:"center"});
  document.addEventListener("keydown",e=>{if(e.key==="Escape")$("helpModal").classList.remove("open");if(e.code==="Space"&&e.target.tagName!=="INPUT"){e.preventDefault();running?stopSequence():runSequence()}});
}
buildControls();bindEvents();
try{initScene()}catch(err){console.error(err);$("loading").innerHTML=`<div style="color:#ffad66">3D ENGINE UNAVAILABLE</div><span>Enable WebGL and check CDN access to load Three.js.</span>`}
setInterval(updateClock,250);
