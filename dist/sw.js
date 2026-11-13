"use strict";
const CACHE="plant-pocket-v5";
const ASSETS=["./","./index.html","./update.html","./record-watering.html","./styles.css","./core.js","./data.js","./app.js","./manifest.webmanifest","./sync-core.js","./sync-ui.js","./firebase-config.js","./firebase-setup.html","./database.rules.json",...["core.js","data.js","app.js","sync-core.js","sync-ui.js","firebase-config.js","styles.css"].map(n=>"./releases/v5/"+n),"./icon.svg","./icon-192.png","./icon-512.png",...["7485","7486","7487","7488","7489","7490","7493","7494","7495","7496","7497","7498","7499","7500","7501","7502"].map(n=>"./photos/IMG_"+n+".jpg")];
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS.map(path=>new Request(new URL(path,self.registration.scope),{cache:"reload"})))).then(()=>self.skipWaiting())));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("plant-pocket-")&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=="GET"||url.origin!==self.location.origin||!url.href.startsWith(self.registration.scope))return;
 event.respondWith(caches.open(CACHE).then(async cache=>{
  if(event.request.mode==="navigate"){
   try{
    const response=await fetch(new Request(event.request,{cache:"no-store"}));
    if(response.ok)return response;
   }catch{}
  }
  const cached=await cache.match(event.request,{ignoreSearch:true});
  if(cached)return cached;
  try{return await fetch(event.request);}catch(error){if(event.request.mode==="navigate")return await cache.match("./index.html");throw error;}
 }));
});
