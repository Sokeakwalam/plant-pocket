/* Optional Firebase sync. Device identities are anonymous; no sign-in screen. */
"use strict";
(function(){
const testConfig=location.hostname==="127.0.0.1"?globalThis.PLANT_SYNC_TEST_CONFIG:null;
const S=PlantSyncCore,config=testConfig||globalThis.PLANT_FIREBASE_CONFIG;
let sdk,auth,cloud,user,known=new Set(),inflight=new Set(),unsub=[],incoming=[],incomingTimer,uploadTimer,receiveRetries=0,uploading=false,linking=false;
let initialized=false;
const label=message=>{document.querySelector("#sync-status").textContent=message;};
const say=message=>{label(message);toast(message);};
const hasConfig=()=>config&&typeof config.apiKey==="string"&&typeof config.projectId==="string"&&/^https:\/\/[a-z0-9.-]+\.(firebaseio\.com|firebasedatabase\.app)\/?$/i.test(config.databaseURL||"");
const connected=()=>!!state?.sync?.collectionId;
function controls(){
 const active=connected(),ready=hasConfig();
 document.querySelector("#sync-create").hidden=active;
 document.querySelector("#sync-join").hidden=active;
 document.querySelector("#sync-invite").hidden=!active;
 document.querySelector("#sync-now").hidden=!active;
 document.querySelector("#sync-disconnect").hidden=!active;
 for(const id of ["#sync-create","#sync-join","#sync-invite","#sync-now"])document.querySelector(id).disabled=!ready||linking;
 document.querySelector("#sync-setup-note").hidden=ready;
}
async function local(fn){
 for(let i=0;i<30&&busy;i++)await new Promise(r=>setTimeout(r,50));
 if(busy)throw Error("Finish saving your current change, then try again.");
 if(!await change(fn,{capture:false}))throw Error("Could not save sync information on this device.");
}
async function prepare(){
 if(!hasConfig())throw Error("Firebase needs its one-time project setup before phones can connect.");
 if(!navigator.onLine)throw Error("Connect to the internet to link phones. Your plant records are saved locally.");
 if(!sdk){
  const base="https://www.gstatic.com/firebasejs/13.3.0/";
  const modules=await Promise.all([import(base+"firebase-app.js"),import(base+"firebase-auth.js"),import(base+"firebase-database.js")]);
  sdk=Object.assign({},...modules);
  const app=sdk.initializeApp(config,"plant-pocket");
  auth=sdk.getAuth(app);cloud=sdk.getDatabase(app);
  if(testConfig){
   sdk.connectAuthEmulator(auth,"http://127.0.0.1:9099",{disableWarnings:true});
   sdk.connectDatabaseEmulator(cloud,"127.0.0.1",9000);
   globalThis.PlantSyncTest={offline:()=>sdk.goOffline(cloud),online:()=>sdk.goOnline(cloud)};
  }
 }
 await new Promise((resolve,reject)=>{let stop;stop=sdk.onAuthStateChanged(auth,()=>{if(stop)stop();resolve();},reject);});
 user=auth.currentUser||(await sdk.signInAnonymously(auth)).user;
 await local(()=>S.ensure(state,PLANT_SEEDS));
 return sdk;
}
function stopListeners(){unsub.forEach(fn=>fn());unsub=[];clearTimeout(incomingTimer);clearTimeout(uploadTimer);incoming=[];known=new Set();receiveRetries=0;}
function decode(id,value){
 if(!value||typeof value.payload!=="string"||value.payload.length>3000000)throw Error("A shared change could not be read.");
 const op=S.clean(JSON.parse(value.payload));if(op.id!==id)throw Error("A shared change has the wrong identifier.");return op;
}
async function receive(){
 if(!incoming.length)return;
 const batch=incoming;incoming=[];
 const id=state.sync.collectionId;
 try{await local(()=>{if(state.sync.collectionId===id)S.merge(state,batch);});receiveRetries=0;label(navigator.onLine?"Connected · changes received":"Offline · changes saved on this phone");}
 catch(error){if(state.sync.collectionId===id){incoming.unshift(...batch);if(++receiveRetries<=5)incomingTimer=setTimeout(receive,1000);}label(error.message);}
}
async function flush(){
 if(uploading||!connected()||!cloud)return;
 if(!navigator.onLine){label("Offline · changes saved on this phone");return;}
 uploading=true;
 try{
  const path="collections/"+state.sync.collectionId+"/ops";
  const pending=Object.values(state.sync.ops).filter(op=>!known.has(op.id));
  const batches=[];let group=[],size=0;
  for(const op of pending){
   const length=JSON.stringify(op).length;
   if(group.length&&(group.length>=25||size+length>4000000)){batches.push(group);group=[];size=0;}
   group.push(op);size+=length;
  }
  if(group.length)batches.push(group);
  for(const batch of batches){
   const updates={};
   for(const op of batch)updates[op.id]={writer:user.uid,payload:JSON.stringify(op)};
   try{batch.forEach(op=>inflight.add(op.id));await sdk.update(sdk.ref(cloud,path),updates);batch.forEach(op=>known.add(op.id));}
   catch(error){
    // A response may have been lost, or another device may have uploaded a common seed first.
    const snapshot=await sdk.get(sdk.ref(cloud,path));
    const remote=snapshot.val()||{};
    const ops=Object.entries(remote).map(([id,value])=>decode(id,value));
    await local(()=>S.merge(state,ops));Object.keys(remote).forEach(id=>known.add(id));
    const retry=batch.filter(op=>!known.has(op.id)),remaining={};
    for(const op of retry)remaining[op.id]={writer:user.uid,payload:JSON.stringify(op)};
    if(retry.length){await sdk.update(sdk.ref(cloud,path),remaining);retry.forEach(op=>known.add(op.id));}
   }
   finally{batch.forEach(op=>inflight.delete(op.id));}
  }
  label("Synced · "+new Date().toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit"}));
 }catch(error){label("Not synced · "+friendly(error));}
 finally{uploading=false;}
}
function queueUpload(){clearTimeout(uploadTimer);uploadTimer=setTimeout(flush,1000);}
function friendly(error){
 const message=error?.message||String(error);
 if(/permission|denied/i.test(message))return "Access was denied. Check the database rules or link this phone with a new invitation.";
 if(/quota|limit|resource.exhausted/i.test(message))return "The free usage limit was reached. Your changes remain on this phone; syncing can retry later.";
 if(/operation-not-allowed/i.test(message))return "Enable Anonymous authentication in the Firebase project.";
 if(/network|offline|fetch/i.test(message))return "Check your connection. Your records remain on this phone.";
 return message;
}
async function attach(){
 stopListeners();
 const id=state.sync.collectionId;
 const membership=await sdk.get(sdk.ref(cloud,"collections/"+id+"/members/"+user.uid));
 if(!membership.exists())throw Error("This browser no longer has its linked device identity. Use a new invitation from the other phone.");
 const snapshot=await sdk.get(sdk.ref(cloud,"collections/"+id+"/ops"));
 const values=snapshot.val()||{},ops=Object.entries(values).map(([key,value])=>decode(key,value));
 await local(()=>S.merge(state,ops));Object.keys(values).forEach(key=>known.add(key));
 unsub.push(sdk.onChildAdded(sdk.ref(cloud,"collections/"+id+"/ops"),snapshot=>{
  try{
   const op=decode(snapshot.key,snapshot.val());if(!inflight.has(op.id))known.add(op.id);
   if(!state.sync.ops[op.id]){incoming.push(op);clearTimeout(incomingTimer);incomingTimer=setTimeout(receive,150);}
  }catch(error){label(friendly(error));}
 },error=>label(friendly(error))));
 unsub.push(sdk.onValue(sdk.ref(cloud,".info/connected"),snapshot=>{
  if(snapshot.val()===true)queueUpload();
  else label("Offline · changes saved on this phone");
 }));
 await flush();controls();
}
async function create(){
 if(linking)return;linking=true;controls();label("Creating a shared collection…");
 try{
  await prepare();
  const id=crypto.randomUUID().replaceAll("-","");
  await sdk.set(sdk.ref(cloud,"collections/"+id),{version:1,owner:user.uid,createdAt:Date.now(),members:{[user.uid]:{joinedAt:Date.now(),inviteId:"owner"}}});
  await local(()=>state.sync.collectionId=id);
  await attach();say("Shared collection created. Use Invite phone to link your other device.");
 }catch(error){say(friendly(error));}
 finally{linking=false;controls();}
}
function joinDialog(){
 document.querySelector("#join-code").value="";
 document.querySelector("#join-dialog").showModal();
}
async function join(event){
 event.preventDefault();if(linking)return;
 const token=document.querySelector("#join-code").value.replace(/[\s-]/g,"").toLowerCase();
 if(!/^[a-f0-9]{48}$/.test(token)){toast("Paste the full invitation code.");return;}
 linking=true;controls();label("Linking this phone…");
 try{
  await prepare();const inviteRef=sdk.ref(cloud,"invites/"+token);
  const initial=(await sdk.get(inviteRef)).val();
  if(!initial)throw Error("Invitation not found. Ask the first phone for a new code.");
  if(initial.claimedBy&&initial.claimedBy!==user.uid)throw Error("This invitation has already been used. Ask for a new code.");
  if(!initial.claimedBy){
   const claim=await sdk.runTransaction(inviteRef,value=>{
    const candidate=value||initial;
    if(candidate.claimedBy||candidate.expiresAt<Date.now())return;
    return {...candidate,claimedBy:user.uid};
   });
   if(!claim.committed)throw Error("Invitation expired or already used. Ask for a new code.");
  }
  const memberRef=sdk.ref(cloud,"collections/"+initial.collectionId+"/members/"+user.uid);
  if(!(await sdk.get(memberRef)).exists())await sdk.set(memberRef,{joinedAt:Date.now(),inviteId:token});
  await local(()=>state.sync.collectionId=initial.collectionId);
  await attach();document.querySelector("#join-dialog").close();say("Phones linked. Changes will sync while the app is open online.");
 }catch(error){say(friendly(error));}
 finally{linking=false;controls();}
}
async function invite(){
 if(linking)return;linking=true;controls();
 try{
  await prepare();
  const owner=(await sdk.get(sdk.ref(cloud,"collections/"+state.sync.collectionId+"/owner"))).val();
  if(owner!==user.uid)throw Error("Create an invitation on the phone that started this shared collection.");
  const token=[...crypto.getRandomValues(new Uint8Array(24))].map(v=>v.toString(16).padStart(2,"0")).join("");
  const offset=await new Promise(resolve=>sdk.onValue(sdk.ref(cloud,".info/serverTimeOffset"),snapshot=>resolve(snapshot.val()||0),()=>resolve(0),{onlyOnce:true}));
  await sdk.set(sdk.ref(cloud,"invites/"+token),{collectionId:state.sync.collectionId,createdBy:user.uid,expiresAt:Date.now()+offset+12*60*60*1000});
  document.querySelector("#invite-code").value=token.match(/.{1,6}/g).join("-");
  document.querySelector("#invite-dialog").showModal();
 }catch(error){say(friendly(error));}
 finally{linking=false;controls();}
}
async function start(){
 if(initialized)return;initialized=true;controls();
 document.querySelector("#sync-create").addEventListener("click",create);
 document.querySelector("#sync-join").addEventListener("click",joinDialog);
 document.querySelector("#join-form").addEventListener("submit",join);
 document.querySelector("#sync-invite").addEventListener("click",invite);
 document.querySelector("#sync-now").addEventListener("click",async()=>{try{await prepare();await attach();}catch(error){say(friendly(error));}});
 document.querySelector("#copy-invite").addEventListener("click",async()=>{try{await navigator.clipboard.writeText(document.querySelector("#invite-code").value);toast("Invitation copied.");}catch{document.querySelector("#invite-code").select();toast("Copy the selected invitation code.");}});
 document.querySelector("#sync-disconnect").addEventListener("click",async()=>{
  if(!confirm("Disconnect this phone from syncing? Its local plants and history will be kept."))return;
  stopListeners();await local(()=>state.sync.collectionId="");controls();label("Not linked · records saved on this phone");
 });
 window.addEventListener("plant-pocket-change",event=>{if(!event.detail?.remote&&connected())queueUpload();});
 window.addEventListener("online",async()=>{if(connected()){try{await prepare();if(!unsub.length)await attach();else await flush();}catch(error){label(friendly(error));}}});
 window.addEventListener("offline",()=>{if(connected())label("Offline · changes saved on this phone");});
 if(connected()&&hasConfig()){
  try{label("Connecting your phones…");await prepare();await attach();}
  catch(error){label(friendly(error));}
 }else label(hasConfig()?"Not linked · no login needed":"Phone syncing needs the one-time Firebase setup");
}
if(typeof state!=="undefined"&&state)start();
else window.addEventListener("plant-pocket-ready",start,{once:true});
})();
