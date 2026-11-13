/* Deterministic, append-only collection changes. No network or account logic. */
(function(root){
"use strict";
const FIELDS=["name","botanical","group","summer","winter","checkDays","light","water","care","notes","source","confidence","photo"];
const clone=v=>JSON.parse(JSON.stringify(v)),equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const keyOK=v=>typeof v==="string"&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,149}$/.test(v);
const logKey=(plantId,e)=>e.id||"legacy-"+plantId+"-"+e.type+"-"+e.date;
const newer=(a,b)=>!b||a.clock>b.clock||(a.clock===b.clock&&a.id>b.id);
function clean(op){
 if(!op||!keyOK(op.id)||!keyOK(op.plantId)||!Number.isSafeInteger(op.clock)||op.clock<0||!["create","delete","field","log","unlog"].includes(op.kind))throw Error("An invalid shared change was received.");
 const result={id:op.id,plantId:op.plantId,clock:op.clock,kind:op.kind};
 if(op.kind==="field"){
  if(!FIELDS.includes(op.field))throw Error("Unknown shared plant field.");
  result.field=op.field;result.value=op.value;
  if(op.field==="checkDays"){if(!Number.isInteger(op.value)||op.value<1||op.value>90)throw Error("Invalid shared check interval.");}
  else if(typeof op.value!=="string"||op.value.length>(op.field==="photo"?2400000:5000))throw Error("Invalid shared field value.");
  if(["summer","winter"].includes(op.field))PlantCore.interval(op.value);
 }
 if(op.kind==="log"){
  const e=op.value;
  if(!e||typeof e.id!=="string"||e.id.length>150||!["watered","moist"].includes(e.type)||PlantCore.dayNumber(e.date)>PlantCore.dayNumber(PlantCore.dayKey()))throw Error("Invalid shared care log.");
  result.value={id:e.id,type:e.type,date:e.date};
 }
 if(op.kind==="unlog"){if(typeof op.target!=="string"||op.target.length>150)throw Error("Invalid care-log removal.");result.target=op.target;}
 return result;
}
function add(meta,plantId,kind,extra={}){
 meta.clock=Math.max(Date.now(),(meta.clock||0)+1);
 const op=clean({id:crypto.randomUUID(),plantId,kind,clock:meta.clock,...extra});
 meta.ops[op.id]=op;return op;
}
function capture(before,after){
 const meta=after.sync;if(!meta)return;
 const old=new Map(before.plants.map(p=>[p.id,p])),now=new Map(after.plants.map(p=>[p.id,p]));
 for(const [id,p]of now){
  const previous=old.get(id);if(!previous)add(meta,id,"create");
  for(const field of FIELDS)if(!previous||!equal(previous[field]??"",p[field]??""))add(meta,id,"field",{field,value:p[field]??""});
  const oldLogs=new Map((previous?.history||[]).map(e=>[logKey(id,e),e])),newLogs=new Map((p.history||[]).map(e=>[logKey(id,e),e]));
  for(const [entryId,e]of newLogs)if(!oldLogs.has(entryId)||!equal(oldLogs.get(entryId),e))add(meta,id,"log",{value:{...e,id:entryId}});
  for(const entryId of oldLogs.keys())if(!newLogs.has(entryId))add(meta,id,"unlog",{target:entryId});
 }
 for(const id of old.keys())if(!now.has(id))add(meta,id,"delete");
}
function materialize(ops){
 const plants=new Map();
 for(const raw of Object.values(ops)){
  const op=clean(raw);let p=plants.get(op.plantId);if(!p){p={fields:new Map(),logs:new Map(),removals:new Map()};plants.set(op.plantId,p);}
  if(op.kind==="create"&&newer(op,p.created))p.created=op;
  if(op.kind==="delete"&&newer(op,p.deleted))p.deleted=op;
  if(op.kind==="field"&&newer(op,p.fields.get(op.field)))p.fields.set(op.field,op);
  if(op.kind==="log"&&newer(op,p.logs.get(op.value.id)))p.logs.set(op.value.id,op);
  if(op.kind==="unlog"&&newer(op,p.removals.get(op.target)))p.removals.set(op.target,op);
 }
 const result=[];
 for(const [id,p]of [...plants].sort(([a,av],[b,bv])=>(av.created?.clock??Number.MAX_SAFE_INTEGER)-(bv.created?.clock??Number.MAX_SAFE_INTEGER)||a.localeCompare(b))){
  if(!p.created||(p.deleted&&!newer(p.created,p.deleted)))continue;
  const fields=Object.fromEntries([...p.fields].map(([field,op])=>[field,op.value]));
  const history=[...p.logs.values()].filter(op=>!p.removals.has(op.value.id)||newer(op,p.removals.get(op.value.id))).sort((a,b)=>a.value.date.localeCompare(b.value.date)||a.clock-b.clock||a.id.localeCompare(b.id)).map(op=>clone(op.value));
  const last=history.at(-1);
  try{result.push(PlantCore.normalizePlant({id,...fields,history,lastCheck:last?.date||null,lastCheckKind:last?.type||"moist"}));}catch{ /* Wait for all fields of a new plant to arrive. */ }
 }
 return result;
}
function ensure(state,seeds){
 if(!state.sync||state.sync.schema!==1){
  const meta={schema:1,deviceId:crypto.randomUUID(),clock:0,ops:{},collectionId:""};
  for(const p of seeds){
   const create={id:"seed-"+p.id+"-create",plantId:p.id,clock:0,kind:"create"};meta.ops[create.id]=create;
   for(const field of FIELDS){const op=clean({id:"seed-"+p.id+"-"+field,plantId:p.id,clock:0,kind:"field",field,value:p[field]??""});meta.ops[op.id]=op;}
  }
  state.sync=meta;capture({plants:clone(seeds)},state);
 }else{
  // Pick up edits made by an older offline app that did not yet emit change records.
  const projected=materialize(state.sync.ops);
  capture({plants:projected},state);
 }
 return state.sync;
}
function merge(state,incoming){
 const meta=state.sync;if(!meta)throw Error("Sync is not initialized.");
 const validated=incoming.map(clean);
 for(const op of validated){const existing=meta.ops[op.id];if(existing&&!equal(existing,op))throw Error("A shared change conflicts with an existing operation ID.");}
 for(const op of validated){meta.ops[op.id]=op;meta.clock=Math.max(meta.clock,op.clock);}
 state.plants=materialize(meta.ops);
 return state;
}
root.PlantSyncCore={FIELDS,clean,capture,ensure,merge,materialize};
})(globalThis);
