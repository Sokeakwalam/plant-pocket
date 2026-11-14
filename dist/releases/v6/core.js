/* Pure care, calendar and import helpers. No network dependencies. */
(function(root){
"use strict";
const DAY=86400000;
const text=(v,n=5000)=>typeof v==="string"?v.slice(0,n):"";
function dayKey(date=new Date()){return [date.getFullYear(),String(date.getMonth()+1).padStart(2,"0"),String(date.getDate()).padStart(2,"0")].join("-");}
function dayNumber(key){if(!/^\d{4}-\d{2}-\d{2}$/.test(key))throw Error("Invalid date");const [y,m,d]=key.split("-").map(Number),dt=new Date(Date.UTC(y,m-1,d));if(dt.toISOString().slice(0,10)!==key)throw Error("Invalid date");return dt.getTime()/DAY;}
function addDays(key,n){const d=new Date((dayNumber(key)+n)*DAY);return d.toISOString().slice(0,10);}
function season(setting="auto",date=new Date()){if(setting==="summer"||setting==="winter")return setting;const m=date.getMonth();return m>=3&&m<=8?"summer":"winter";}
function interval(value){const m=/^(\d{1,3})[-–](\d{1,3})$/.exec(String(value));if(!m||+m[1]<1||+m[2]<+m[1]||+m[2]>365)throw Error("Use a day range such as 7–14, between 1 and 365 days.");return [+m[1],+m[2]];}
function safeURL(value){try{const u=new URL(value);return u.protocol==="https:"?u.href:"";}catch{return "";}}
function validDate(v){try{return typeof v==="string"&&dayNumber(v)<=dayNumber(dayKey())?v:null;}catch{return null;}}
function latest(p,type){return (p.history||[]).filter(e=>e.type===type).map(e=>e.date).sort().at(-1)||null;}
function nextCheck(p,setting="auto"){if(!p.lastCheck)return null;const s=season(setting);let n=p.checkDays;if(p.lastCheckKind==="watered")n=Math.min(n,interval(p[s])[0]);return addDays(p.lastCheck,n);}
function isDue(p,setting="auto",today=dayKey()){const next=nextCheck(p,setting);return !next||next<=today;}
function cleanPhoto(v){if(typeof v!=="string")return "";if(v.length>2400000)throw Error("A photo is too large. Resize it first.");if(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=\s]+$/.test(v))return v;if(/^\.\/photos\/IMG_\d{4}\.jpg$/.test(v))return v;return "";}
function normalizePlant(raw,requireCare=true){
 if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error("Each plant must be an object.");
 const name=text(raw.name,100).trim();if(!name)throw Error("Every plant needs a name.");
 const summer=text(raw.summer,20),winter=text(raw.winter,20);interval(summer);interval(winter);
 const light=text(raw.light,2000).trim(),water=text(raw.water,2000).trim();if(requireCare&&(!light||!water))throw Error("Every plant needs light and watering guidance.");
 const checkDays=Number(raw.checkDays);if(!Number.isInteger(checkDays)||checkDays<1||checkDays>90)throw Error("Soil-check spacing must be 1–90 days.");
 const history=Array.isArray(raw.history)?raw.history.slice(-1000).filter(e=>e&&["watered","moist","undo"].includes(e.type)&&validDate(e.date)).map(e=>({type:e.type,date:e.date,id:text(e.id,100)})):[];
 return {id:text(raw.id,100)||("plant-"+Date.now()+"-"+Math.random().toString(36).slice(2)),name,botanical:text(raw.botanical,150),group:["Foliage","Succulent","Orchid"].includes(raw.group)?raw.group:"Foliage",summer,winter,checkDays,light,water,care:text(raw.care),notes:text(raw.notes),source:safeURL(raw.source),confidence:text(raw.confidence,200),photo:cleanPhoto(raw.photo),lastCheck:validDate(raw.lastCheck),lastCheckKind:raw.lastCheckKind==="watered"?"watered":"moist",history};
}
function parseImport(raw){
 if(raw&&raw.format==="plant-pocket-records")return parseRecords(raw);
 if(!raw||raw.version!==1||!["plant-pocket-care","plant-pocket-backup"].includes(raw.format)||!Array.isArray(raw.plants))throw Error("This is not a version 1 Plant Pocket care or backup file.");
 if((raw.format==="plant-pocket-care"&&!raw.plants.length)||raw.plants.length>250)throw Error("Import between 1 and 250 plants at once.");
 const plants=raw.plants.map(p=>normalizePlant(p));if(new Set(plants.map(p=>p.id)).size!==plants.length)throw Error("The file contains duplicate plant IDs.");
 return {format:raw.format,plants,appliedUpdates:Array.isArray(raw.appliedUpdates)?raw.appliedUpdates.filter(v=>typeof v==="string").slice(0,100):[],season:["auto","summer","winter"].includes(raw.season)?raw.season:"auto"};
}

function parseRecords(raw){
 if(raw.version!==1||!Array.isArray(raw.records)||!raw.records.length||raw.records.length>10000)throw Error("Import between 1 and 10,000 care records in a version 1 file.");
 const records=raw.records.map(r=>{
  if(!r||!["watered","moist"].includes(r.type)||!validDate(r.date)||typeof r.plantId!=="string"||!r.plantId.trim()||r.plantId.length>100)throw Error("Each care record needs an existing plant ID, a valid past or present date, and a watered or moist type.");
  return {plantId:r.plantId,type:r.type,date:r.date,id:text(r.id,100)||"record-"+r.plantId+"-"+r.type+"-"+r.date};
 });
 return {format:"plant-pocket-records",records};
}
function mergeRecords(plants,records,apply=true){
 const byId=new Map(plants.map(p=>[p.id,p])),seen=new Set();
 let added=0,duplicates=0,missing=0;
 for(const event of records){
  const p=byId.get(event.plantId);
  if(!p){missing++;continue;}
  const key=event.plantId+"|"+event.type+"|"+event.date;
  if(seen.has(key)||p.history.some(e=>(e.type===event.type&&e.date===event.date)||(e.id&&e.id===event.id))){duplicates++;continue;}
  seen.add(key);added++;
  if(apply){
   p.history.push({id:event.id,type:event.type,date:event.date});
   if(!p.lastCheck||event.date>p.lastCheck){p.lastCheck=event.date;p.lastCheckKind=event.type;}
  }
 }
 return {added,duplicates,missing};
}


function applyUpdates(state,updates){
 const applied=new Set(Array.isArray(state.appliedUpdates)?state.appliedUpdates:[]);
 let changed=false,added=0;
 for(const update of updates){
  if(applied.has(update.id))continue;
  const valid=parseRecords({format:"plant-pocket-records",version:1,records:update.records});
  added+=mergeRecords(state.plants,valid.records).added;
  applied.add(update.id);changed=true;
 }
 if(changed)state.appliedUpdates=[...applied];
 return {changed,added};
}

function escapeICS(v){return String(v).replace(/\\/g,"\\\\").replace(/\n/g,"\\n").replace(/,/g,"\\,").replace(/;/g,"\\;");}
function calendar(p,setting="auto"){
 const date=nextCheck(p,setting)||dayKey(),stamp=new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d{3}/,"");
 return ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Plant Pocket//Care Checks//EN","CALSCALE:GREGORIAN","BEGIN:VEVENT","UID:"+encodeURIComponent(p.id)+"-"+Date.now()+"@plant-pocket.local","DTSTAMP:"+stamp,"DTSTART;VALUE=DATE:"+date.replace(/-/g,""),"DTEND;VALUE=DATE:"+addDays(date,1).replace(/-/g,""),"RRULE:FREQ=DAILY;INTERVAL="+p.checkDays,"SUMMARY:"+escapeICS("Check soil: "+p.name),"DESCRIPTION:"+escapeICS(p.water+"\nCheck only; water if the compost is ready. "+p.source),"END:VEVENT","END:VCALENDAR",""].join("\r\n");
}
root.PlantCore={dayKey,dayNumber,addDays,season,interval,safeURL,latest,nextCheck,isDue,normalizePlant,parseImport,mergeRecords,applyUpdates,calendar};
})(globalThis);
