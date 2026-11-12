(function(){
let count=0;
function assert(ok,msg){if(!ok)throw Error(msg);count++;}
function rejects(fn,msg){let thrown=false;try{fn();}catch{thrown=true;}assert(thrown,msg);}
const C=PlantCore,p=C.normalizePlant(PLANT_SEEDS[0]);
assert(PLANT_SEEDS.length===16,"16 seed plants");
assert(new Set(PLANT_SEEDS.map(p=>p.id)).size===16,"Unique IDs");
PLANT_SEEDS.forEach(p=>{const clean=C.normalizePlant(p);assert(clean.source.startsWith("https://"),"HTTPS source");assert(clean.photo.startsWith("./photos/"),"Bundled photo");assert(!clean.lastCheck&&!clean.history.length,"No invented history");});
assert(C.season("auto",new Date(2026,3,1))==="summer","April summer");
assert(C.season("auto",new Date(2026,8,30))==="summer","September summer");
assert(C.season("auto",new Date(2026,9,1))==="winter","October winter");
assert(C.season("summer",new Date(2026,11,1))==="summer","Season override");
assert(C.addDays("2026-03-28",3)==="2026-03-31","DST-safe day math");
assert(C.addDays("2026-12-31",1)==="2027-01-01","Year boundary");
assert(C.addDays("2024-02-28",1)==="2024-02-29","Leap day");
assert(C.isDue(p,"winter","2026-11-12"),"No initial history means check");
p.lastCheck="2026-11-01";p.lastCheckKind="moist";p.checkDays=7;
assert(C.nextCheck(p,"winter")==="2026-11-08","Moist checks don't claim watering");
assert(!C.isDue(p,"winter","2026-11-07"),"Not due before check date");
assert(C.isDue(p,"winter","2026-11-08"),"Due on date");
assert(C.latest(p,"watered")===null,"Still moist never counts as water");
p.history.push({type:"watered",date:"2026-10-20",id:"water-1"},{type:"moist",date:"2026-11-01",id:"check-1"});
assert(C.latest(p,"watered")==="2026-10-20","Water history distinct");
const parsed=C.parseImport({format:"plant-pocket-backup",version:1,season:"winter",plants:[p]});
assert(parsed.plants[0].history.length===2,"Backup preserves history");
assert(parsed.season==="winter","Backup preserves season");
assert(C.parseImport({format:"plant-pocket-backup",version:1,plants:[]}).plants.length===0,"Empty backup can restore");
rejects(()=>C.parseImport({format:"plant-pocket-care",version:1,plants:[]}),"Empty care import rejected");
rejects(()=>C.parseImport({format:"wrong",version:1,plants:[p]}),"Unknown file rejected");
rejects(()=>C.parseImport({format:"plant-pocket-care",version:2,plants:[p]}),"Future format rejected");
rejects(()=>C.normalizePlant({...p,summer:"14–7"}),"Reversed range rejected");
rejects(()=>C.normalizePlant({...p,summer:"0–14"}),"Zero range rejected");
rejects(()=>C.normalizePlant({...p,checkDays:0}),"Zero check spacing rejected");
rejects(()=>C.normalizePlant({...p,water:""}),"Missing guidance rejected");
rejects(()=>C.parseImport({format:"plant-pocket-backup",version:1,plants:[p,p]}),"Duplicate IDs rejected");
assert(C.safeURL("javascript:alert(1)")==="","Script URL removed");
assert(C.normalizePlant({...p,photo:"https://tracker.invalid/photo.jpg"}).photo==="","Remote imported photos rejected");
assert(C.normalizePlant({...p,photo:"data:image/svg+xml;base64,PHN2Zz4="}).photo==="","SVG data import rejected");
const ics=C.calendar({...p,name:"Aloe, vera; plant",water:"Line 1\nLine 2"},"winter");
assert(ics.includes("RRULE:FREQ=DAILY;INTERVAL=7"),"Calendar check recurrence");
assert(ics.includes("SUMMARY:Check soil: Aloe\\, vera\\; plant"),"Calendar escape");
assert(ics.includes("\r\n"),"Calendar CRLF");
return count+" assertions passed";
})()