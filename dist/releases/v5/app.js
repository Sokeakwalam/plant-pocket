/* All collection data stays in this device's IndexedDB. */
"use strict";
const C=PlantCore,$=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
let db,state,filter="all",activeId=null,pendingImport=null,busy=false;
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const humanDate=k=>k?new Date(k+"T12:00:00").toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"}):"Not recorded";
const today=()=>C.dayKey(),currentSeason=()=>C.season(state.season),findPlant=id=>state.plants.find(p=>p.id===id);
function toast(message){const t=$("#toast");t.textContent=message;t.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.hidden=true,5000);}
function openDialog(id){const d=$(id);if(!d.open)d.showModal();}
function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open("plant-pocket",1);r.onupgradeneeded=()=>r.result.createObjectStore("collection");r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error("Close other Plant Pocket tabs and try again."));});}
function readDB(){return new Promise((resolve,reject)=>{const tx=db.transaction("collection","readonly"),r=tx.objectStore("collection").get("state");r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function writeDB(value){return new Promise((resolve,reject)=>{const tx=db.transaction("collection","readwrite");tx.objectStore("collection").put(value,"state");tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error("Storage transaction stopped."));});}
async function change(fn,options={}){if(busy)return false;busy=true;const previous=JSON.parse(JSON.stringify(state));try{fn();if(state.sync&&options.capture!==false)PlantSyncCore.capture(previous,state);await writeDB(state);render();window.dispatchEvent(new CustomEvent("plant-pocket-change",{detail:{remote:options.capture===false}}));return true;}catch(e){state=previous;render();toast("Could not save. "+e.message+" Export a backup before clearing data.");return false;}finally{busy=false;}}
function photoHTML(p,cls=""){return p.photo?'<img '+(cls?'class="'+cls+'" ':"")+'src="'+esc(p.photo)+'" alt="'+esc(p.name)+'" loading="lazy">':'<span class="fallback" aria-hidden="true">❧</span>';}
function card(p){const due=C.isDue(p,state.season),last=C.latest(p,"watered");return '<article class="plant-card"><button class="photo-button" data-detail="'+esc(p.id)+'" aria-label="View '+esc(p.name)+'">'+photoHTML(p)+'<span class="badge '+(due?"due":"")+'">'+(due?"Soil check due":"Checked in")+'</span></button><div class="card-body"><button class="card-title" data-detail="'+esc(p.id)+'">'+esc(p.name)+'</button><p class="botanical">'+esc(p.botanical||"Your new plant")+'</p><div class="card-meta"><span>'+(p.group==="Succulent"?"☀":p.group==="Orchid"?"❀":"♧")+' '+esc(p.group)+'</span><span>·</span><span>'+esc(p[currentSeason()])+' days*</span></div><p class="card-hint">'+esc(p.water)+'</p><div class="card-bottom"><span class="last-water">Last watered<br>'+esc(humanDate(last))+'</span><button class="check-button" data-detail="'+esc(p.id)+'">Check soil ↗</button></div></div></article>';}
function render(){
 $("#plant-count").textContent=state.plants.length;const due=state.plants.filter(p=>C.isDue(p,state.season)).length;
 $("#due-count").textContent=due;$("#today-label").textContent=new Date().toLocaleDateString(undefined,{weekday:"long",day:"numeric",month:"long"}).toUpperCase();
 $("#greeting").textContent=due?"A good day to check in.":"A little care goes a long way.";
 $("#care-summary").textContent=due?due+" plant"+(due===1?" is":"s are")+" ready for a soil check. Water only if the compost is ready.":"You’re up to date with soil checks. Come back when your plants need another look.";
 $("#season").value=state.season;$("#season-label").textContent=(currentSeason()==="winter"?"◌ Autumn / winter":"☀ Spring / summer")+" · *watering estimates";
 const query=$("#search").value.toLowerCase().trim(),visible=state.plants.filter(p=>(filter!=="due"||C.isDue(p,state.season))&&(p.name+" "+p.botanical+" "+p.group).toLowerCase().includes(query));
 $("#plants").innerHTML=visible.length?visible.map(card).join(""):'<div class="empty"><h2>'+(query?"No plants found.":filter==="due"?"All checked in.":"Your next plant starts here.")+'</h2><p>'+(query?"Try another name.":filter==="due"?"Enjoy a little time with your jungle.":"Tap Add a plant to start your collection.")+'</p></div>';
 $$(".tab").forEach(b=>{const on=b.dataset.filter===filter;b.classList.toggle("active",on);b.setAttribute("aria-pressed",String(on));});
 if($("#detail-dialog").open&&findPlant(activeId))renderDetail();
}
function renderDetail(){
 const p=findPlant(activeId);if(!p)return;const next=C.nextCheck(p,state.season),last=C.latest(p,"watered");
 const history=[...p.history].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,12).map(e=>'<li>'+esc(humanDate(e.date))+' · '+(e.type==="watered"?"Watered":"Checked · still moist")+'</li>').join("");
 $("#detail-content").innerHTML='<div class="dialog-heading"><div><p class="eyebrow">'+esc(p.group.toUpperCase())+'</p><h2>'+esc(p.name)+'</h2><p><i>'+esc(p.botanical)+'</i></p></div><button class="icon-button" data-close aria-label="Close">×</button></div>'+(p.photo?photoHTML(p,"detail-photo"):"")+
 '<div class="care-block"><h3>When to water</h3><p>'+esc(p.water)+'</p><p class="small">Estimates: spring/summer '+esc(p.summer)+' days · autumn/winter '+esc(p.winter)+' days. Soil condition comes first.</p></div>'+
 '<div class="care-block"><h3>Light & placement</h3><p>'+esc(p.light)+'</p></div><div class="care-block"><h3>A little extra care</h3><p>'+esc(p.care||"No extra care notes yet.")+'</p></div>'+
 '<div class="care-block"><h3>Your notes</h3><p>'+esc(p.notes||"Add your observations with Edit plant.")+'</p></div>'+
 '<div class="care-block"><h3>Check-in rhythm</h3><p>Last watered: '+esc(humanDate(last))+'<br>Next soil check: '+esc(next?humanDate(next):"Check now · no history yet")+'<br>Soil-check spacing: '+p.checkDays+' days</p></div>'+
 '<div class="detail-actions"><button class="primary" data-log="watered">✓ I checked and watered</button><button data-log="moist">Still moist · check later</button></div><p class="small">Only log watering after you’ve watered. “Still moist” records a check without changing your watering history.</p>'+
 '<div class="sub-actions"><button data-edit>Edit plant</button><button data-calendar>Calendar reminder</button><button data-undo '+(!p.history.length?"disabled":"")+'>Undo last log</button></div>'+
 '<div class="sub-actions">'+(p.source?'<a href="'+esc(p.source)+'" target="_blank" rel="noopener noreferrer">Care source ↗</a>':"")+'<button data-research>Search care ↗</button><button class="danger" data-delete>Remove plant</button></div>'+
 '<p class="small">'+esc(p.confidence||"Identification entered by you.")+'</p><h3>Recent history</h3><ul class="history">'+(history||'<li>No care logged yet. Your history starts with your first check-in.</li>')+'</ul>';
}
function showDetail(id){activeId=id;renderDetail();openDialog("#detail-dialog");}
function research(name){if(!name.trim()){toast("Enter a plant name first.");return;}window.open("https://www.google.com/search?q="+encodeURIComponent(name+" plant care watering (site:rhs.org.uk OR site:extension.umn.edu OR site:aos.org)"),"_blank","noopener,noreferrer");}
function editor(id){const p=id?findPlant(id):null,form=$("#editor-form");form.reset();$("#editor-title").textContent=p?"Edit plant":"Add a plant";form.elements.id.value=p?p.id:"";if(p)["name","botanical","group","summer","winter","checkDays","light","water","care","notes","source"].forEach(k=>form.elements[k].value=p[k]??"");else{form.elements.summer.value="7–14";form.elements.winter.value="14–21";}$("#detail-dialog").close();openDialog("#editor-dialog");}
async function resizePhoto(file){if(!file)return "";if(file.size>20000000)throw Error("Choose a photo smaller than 20 MB.");const url=URL.createObjectURL(file);try{return await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{try{const scale=Math.min(1,1000/Math.max(img.width,img.height)),canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);resolve(canvas.toDataURL("image/jpeg",.78));}catch(e){reject(e);}};img.onerror=()=>reject(Error("This photo format could not be opened. Try JPEG or PNG."));img.src=url;});}finally{URL.revokeObjectURL(url);}}
function download(contents,name,type){const u=URL.createObjectURL(new Blob([contents],{type})),a=document.createElement("a");a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),30000);}
function blobToData(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(blob);});}
async function exportBackup(){const button=$("#export");button.disabled=true;try{const plants=JSON.parse(JSON.stringify(state.plants));for(const p of plants){if(p.photo&&p.photo.startsWith("./photos/")){const r=await fetch(p.photo);if(!r.ok)throw Error("Could not include "+p.name+"’s photo. Open online once and try again.");p.photo=await blobToData(await r.blob());}}download(JSON.stringify({format:"plant-pocket-backup",version:1,exportedAt:new Date().toISOString(),season:state.season,appliedUpdates:state.appliedUpdates||[],plants},null,2),"plant-pocket-backup-"+today()+".json","application/json");toast("Backup prepared. Save it somewhere you can find again.");}catch(e){toast(e.message);}finally{button.disabled=false;}}
function templateFile(){download(JSON.stringify({format:"plant-pocket-care",version:1,plants:[{name:"Replace with the plant’s common name",botanical:"Replace with its botanical name",group:"Foliage",summer:"7–14",winter:"14–21",checkDays:7,light:"Replace with researched light guidance.",water:"Replace with a researched compost-dryness check.",care:"Replace with a researched care summary. Adjust the example day ranges for this species.",source:"https://www.rhs.org.uk/",confidence:"Confirm the plant identification before applying this care."}]},null,2),"plant-pocket-care-template.json","application/json");}
async function setupOffline(){const label=$("#offline-status");if(!("serviceWorker" in navigator)||!window.isSecureContext){label.textContent="Offline install needs HTTPS hosting";return;}try{const registration=await navigator.serviceWorker.register("./sw.js",{scope:"./"});await navigator.serviceWorker.ready;const check=async()=>{const cache=await caches.open("plant-pocket-v5"),ready=await cache.match(new URL("./index.html",location.href).href);label.textContent=ready?"Ready offline · saved on this device":"Open online to finish offline setup";};await check();if(registration.installing)registration.installing.addEventListener("statechange",check);}catch(e){label.textContent="Offline setup incomplete · retry online";console.warn("Offline setup",e);}}
function bind(){
 $("#search").addEventListener("input",render);
 $$(".tab").forEach(b=>b.addEventListener("click",()=>{filter=b.dataset.filter;render();}));
 $("#season").addEventListener("change",async e=>{if(await change(()=>state.season=e.target.value))toast("Season updated.");});
 $("#plants").addEventListener("click",e=>{const b=e.target.closest("[data-detail]");if(b)showDetail(b.dataset.detail);});
 $("#add-plant").addEventListener("click",()=>editor(null));$$("dialog").forEach(d=>d.addEventListener("click",e=>{if(e.target.closest("[data-close]"))d.close();}));
 $("#detail-content").addEventListener("click",async e=>{
  const b=e.target.closest("button");if(!b)return;const p=findPlant(activeId);if(!p)return;
  if(b.dataset.log){const kind=b.dataset.log;if(await change(()=>{p.lastCheck=today();p.lastCheckKind=kind;p.history.push({type:kind,date:today(),id:crypto.randomUUID()});}))toast(kind==="watered"?"Watering saved.":"Soil check saved. Check again in "+p.checkDays+" days.");}
  if(b.hasAttribute("data-edit"))editor(p.id);
  if(b.hasAttribute("data-research"))research(p.botanical||p.name);
  if(b.hasAttribute("data-calendar")){download(C.calendar(p,state.season),p.name.replace(/[^a-z0-9]/gi,"-")+"-soil-check.ics","text/calendar");toast("Calendar file prepared. Your calendar controls alerts.");}
  if(b.hasAttribute("data-undo")){if(await change(()=>{p.history.pop();const last=p.history.at(-1);p.lastCheck=last?last.date:null;p.lastCheckKind=last?last.type:"moist";}))toast("Last care log undone.");}
  if(b.hasAttribute("data-delete")&&confirm("Remove "+p.name+" and its history? Export a backup first if you want to keep it.")){if(await change(()=>state.plants=state.plants.filter(q=>q.id!==p.id))){$("#detail-dialog").close();toast("Plant removed.");}}
 });
 $("#template").innerHTML+=PLANT_SEEDS.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join("");
 $("#template").addEventListener("change",e=>{const p=PLANT_SEEDS.find(p=>p.id===e.target.value);if(p)["group","summer","winter","checkDays","light","water","care","source"].forEach(k=>$("#editor-form").elements[k].value=p[k]);});
 $("#research-editor").addEventListener("click",()=>{const form=$("#editor-form");research(form.elements.botanical.value||form.elements.name.value);});
 $("#editor-form").addEventListener("submit",async e=>{e.preventDefault();const form=e.target,submit=form.querySelector("[type=submit]");submit.disabled=true;try{const values=Object.fromEntries(new FormData(form)),old=values.id?findPlant(values.id):null,photo=await resizePhoto(form.elements.photo.files[0]);delete values.photo;const plant=C.normalizePlant({...old,...values,photo:photo||old?.photo||"",history:old?.history||[],lastCheck:old?.lastCheck||null,lastCheckKind:old?.lastCheckKind||"moist",confidence:old?.confidence||"Identification entered by you."});if(await change(()=>{const index=state.plants.findIndex(p=>p.id===plant.id);if(index>=0)state.plants[index]=plant;else state.plants.push(plant);})){form.closest("dialog").close();toast(old?"Plant updated.":"Welcome to the jungle, "+plant.name+".");}}catch(e){toast(e.message);}finally{submit.disabled=false;}});
 $("#export").addEventListener("click",exportBackup);
 $("#import").addEventListener("click",()=>{$("#import-file").value="";$("#import-preview").replaceChildren();$("#confirm-import").disabled=true;pendingImport=null;openDialog("#import-dialog");});
 $("#import-file").addEventListener("change",async e=>{
 const file=e.target.files[0];pendingImport=null;$("#confirm-import").disabled=true;if(!file)return;
 try{
  if(file.size>40000000)throw Error("Choose a file smaller than 40 MB.");
  const parsed=C.parseImport(JSON.parse(await file.text()));
  const backup=parsed.format==="plant-pocket-backup",records=parsed.format==="plant-pocket-records",button=$("#confirm-import");
  if(records){
   const plan=C.mergeRecords(state.plants,parsed.records,false);
   $("#import-preview").innerHTML='<h3>'+plan.added+' new care records</h3><ul class="import-list">'+parsed.records.map(r=>'<li>'+esc(findPlant(r.plantId)?.name||"Plant not on this device: "+r.plantId)+' · '+esc(humanDate(r.date))+' · '+(r.type==="watered"?"Watered":"Checked · still moist")+'</li>').join("")+'</ul><p>Your plants, notes and existing history are kept. '+plan.duplicates+' already recorded; '+plan.missing+' unmatched records will be skipped.</p>';
   button.textContent="Add care records";button.disabled=plan.added===0;
  }else{
   $("#import-preview").innerHTML='<h3>'+parsed.plants.length+' plants ready</h3><ul class="import-list">'+parsed.plants.map(p=>'<li>'+esc(p.name)+'</li>').join("")+'</ul>'+(backup?'<div class="replace-option"><strong>Restore a full backup</strong><p>This replaces this device’s collection and history. Save a backup of this device first if needed. If this phone is linked, restored changes will also sync to the other phone.</p><label><input type="checkbox" id="replace-confirm">Replace this device’s collection</label></div>':'<p>Care profiles will be added as new plants. Existing plants and logs will stay as they are.</p>');
   button.textContent=backup?"Restore backup":"Add care profiles";button.disabled=backup;
   if(backup)$("#replace-confirm").addEventListener("change",e=>button.disabled=!e.target.checked);
  }
  pendingImport=parsed;
 }catch(error){pendingImport=null;$("#confirm-import").disabled=true;$("#import-preview").textContent=error.message;}
 });
 $("#confirm-import").addEventListener("click",async()=>{
  if(!pendingImport)return;
  const data=pendingImport,backup=data.format==="plant-pocket-backup",records=data.format==="plant-pocket-records";
  if(backup&&!$("#replace-confirm")?.checked)return;
  let summary;
  if(await change(()=>{
   if(records)summary=C.mergeRecords(state.plants,data.records);
   else if(backup){state.plants=data.plants;state.season=data.season;state.appliedUpdates=data.appliedUpdates||[];}
   else state.plants.push(...data.plants.map(p=>({...p,id:"plant-"+crypto.randomUUID(),history:[],lastCheck:null,lastCheckKind:"moist"})));
  })){pendingImport=null;$("#import-dialog").close();toast(records?summary.added+" care records saved.":backup?"Backup restored.":"Care profiles added.");}
 });
 $("#install").addEventListener("click",()=>openDialog("#help-dialog"));$("#download-template").addEventListener("click",templateFile);
 document.addEventListener("visibilitychange",()=>{if(!document.hidden&&state)render();});
}
(async()=>{try{db=await openDB();state=await readDB();if(!state){state={version:1,season:"auto",plants:PLANT_SEEDS.map(p=>C.normalizePlant(p))};await writeDB(state);}else{if(!Array.isArray(state.plants))throw Error("Stored collection is not valid.");state={...state,version:1,season:["auto","summer","winter"].includes(state.season)?state.season:"auto",plants:state.plants.map(p=>C.normalizePlant(p))};}const update=C.applyUpdates(state,PLANT_UPDATES);if(update.changed)await writeDB(state);bind();render();window.dispatchEvent(new Event("plant-pocket-ready"));setupOffline();if(navigator.storage?.persist)navigator.storage.persist().catch(()=>{});}catch(e){const box=$("#boot-error");box.hidden=false;box.textContent="Could not open device storage. Try a regular browser window with website storage enabled. Existing data has not been reset. "+e.message;$("#plants").replaceChildren();$("#offline-status").textContent="Storage unavailable";}})();
