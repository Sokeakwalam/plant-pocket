"use strict";
const path=require("node:path"),assert=require("node:assert/strict");
const {chromium}=require("../.build/firebase-tools/node_modules/playwright-core");
const config={apiKey:"demo-key",projectId:"demo-plant-pocket",databaseURL:"https://demo-plant-pocket-default-rtdb.firebaseio.com",appId:"demo"};
let browser;
(async()=>{
 browser=await chromium.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:true,args:["--disable-background-timer-throttling","--disable-renderer-backgrounding"]});
 const firstContext=await browser.newContext({viewport:{width:390,height:844}}),secondContext=await browser.newContext({viewport:{width:390,height:844}});
 for(const context of [firstContext,secondContext])await context.addInitScript(config=>globalThis.PLANT_SYNC_TEST_CONFIG=config,config);
 const first=await firstContext.newPage(),second=await secondContext.newPage();
 for(const page of [first,second]){
  page.on("pageerror",error=>console.error("Page error:",error.message));
  await page.goto("http://127.0.0.1:8087/");
  await page.waitForSelector(".plant-card");
 }
 await first.locator("#sync-create").click();
 await first.waitForFunction(()=>state.sync?.collectionId&&document.querySelector("#sync-status").textContent.startsWith("Synced"),{},{timeout:45000});
 console.log("First phone created shared collection anonymously");
 await first.locator("#sync-invite").click();
 await first.waitForFunction(()=>document.querySelector("#invite-dialog").open,{},{timeout:15000});
 const code=await first.locator("#invite-code").inputValue();
 await second.locator("#sync-join").click();await second.locator("#join-code").fill(code);
 await second.locator("#join-form [type=submit]").click();
 await second.waitForFunction(()=>state.sync?.collectionId&&!document.querySelector("#join-dialog").open&&document.querySelector("#sync-status").textContent.startsWith("Synced"),{},{timeout:30000});
 assert.equal(await first.evaluate(()=>state.sync.collectionId),await second.evaluate(()=>state.sync.collectionId));
 console.log("Second anonymous phone joined using one-time code, without a login");
 await first.locator("#invite-dialog [data-close]").last().click();
 await first.locator("[data-detail]").first().click();
 await first.locator("[data-log=watered]").click();
 await second.waitForFunction(()=>PlantCore.latest(findPlant("plant-7485"),"watered")===PlantCore.dayKey(),{},{timeout:15000});
 console.log("Watering saved on first phone automatically appeared on second");
 await second.evaluate(async()=>{await change(()=>findPlant("plant-7485").notes="A note from the second phone");});
 await first.waitForFunction(()=>findPlant("plant-7485").notes==="A note from the second phone",{},{timeout:15000});
 console.log("Notes sync back to the first phone");
 await firstContext.setOffline(true);
 await first.evaluate(async()=>{
  await change(()=>{const p=findPlant("plant-7486");p.history.push({id:"offline-water",type:"watered",date:today()});p.lastCheck=today();p.lastCheckKind="watered";});
  if(!(await readDB()).plants.find(p=>p.id==="plant-7486").history.some(e=>e.id==="offline-water"))throw Error("Offline record not stored");
 });
 await second.evaluate(async()=>{
  await change(()=>{const p=findPlant("plant-7487");p.history.push({id:"parallel-water",type:"watered",date:today()});p.lastCheck=today();p.lastCheckKind="watered";});
 });
 await second.waitForFunction(()=>document.querySelector("#sync-status").textContent.startsWith("Synced"));
 await firstContext.setOffline(false);
 await second.waitForFunction(()=>findPlant("plant-7486").history.some(e=>e.id==="offline-water"),{},{timeout:20000});
 await first.waitForFunction(()=>findPlant("plant-7487").history.some(e=>e.id==="parallel-water"),{},{timeout:20000});
 console.log("Offline change persisted, uploaded after reconnect, and kept the other phone's concurrent watering");
 console.log("Two-phone browser flow passed");
})().catch(async error=>{
 console.error(error);
 if(browser)for(const context of browser.contexts())for(const page of context.pages())console.error("Sync status:",await page.locator("#sync-status").textContent().catch(()=>"unavailable"));
 process.exitCode=1;
}).finally(async()=>{if(browser)await browser.close();});
