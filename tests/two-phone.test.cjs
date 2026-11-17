"use strict";
const path=require("node:path"),assert=require("node:assert/strict");
const {chromium}=require("../.build/firebase-tools/node_modules/playwright-core");
const config={apiKey:"demo-key",projectId:"demo-plant-pocket",databaseURL:"https://demo-plant-pocket-default-rtdb.firebaseio.com",appId:"demo"};
let browser;
(async()=>{
 browser=await chromium.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:true,args:["--disable-background-timer-throttling","--disable-renderer-backgrounding","--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights"]});
 const firstContext=await browser.newContext({viewport:{width:390,height:844}}),secondContext=await browser.newContext({viewport:{width:390,height:844}});
 for(const context of [firstContext,secondContext]){
  await context.addInitScript(config=>globalThis.PLANT_SYNC_TEST_CONFIG=config,config);
  await context.route("http://127.0.0.1:8087/",async route=>{
   const response=await route.fetch();const body=(await response.text()).replace("connect-src 'self'", "connect-src 'self' http://127.0.0.1:9000 http://127.0.0.1:9099 ws://127.0.0.1:9000");
   await route.fulfill({response,body});
  });
 }
 const first=await firstContext.newPage(),second=await secondContext.newPage();
 for(const page of [first,second]){
  page.on("pageerror",error=>console.error("Page error:",error.message));
  page.on("console",message=>{if(message.type()==="error")console.error("Browser:",message.text());});
  await page.goto("http://127.0.0.1:8087/");
  await page.waitForSelector(".plant-card",{timeout:60000});
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
 const backdate=await first.evaluate(()=>C.addDays(today(),-1));
 await first.locator("[data-water-date]").click();await first.locator("#watering-date").fill(backdate);
 await first.locator("#watering-form [type=submit]").click();
 await first.waitForFunction(()=>!document.querySelector("#watering-dialog").open);
 await second.waitForFunction(date=>findPlant("plant-7485").history.some(e=>e.type==="watered"&&e.date===date),backdate,{timeout:15000});
 assert.equal(await second.evaluate(()=>C.latest(findPlant("plant-7485"),"watered")),await first.evaluate(()=>today()));
 assert.equal(await first.evaluate(()=>findPlant("plant-7485").lastCheck),await first.evaluate(()=>today()));
 await first.locator("[data-water-date]").click();await first.locator("#watering-date").fill(backdate);
 await first.locator("#watering-form [type=submit]").click();
 await first.waitForFunction(()=>document.querySelector("#toast").textContent.includes("already recorded"));
 assert.equal(await first.evaluate(date=>findPlant("plant-7485").history.filter(e=>e.type==="watered"&&e.date===date).length,backdate),1);
 const future=await first.evaluate(()=>C.addDays(today(),1));
 await first.locator("#watering-date").fill(future);
 assert.equal(await first.locator("#watering-date").evaluate(input=>input.validity.rangeOverflow),true);
 await first.locator("#watering-form [type=submit]").click();
 assert.equal(await first.locator("#watering-dialog").evaluate(dialog=>dialog.open),true);
 assert.equal(await first.evaluate(date=>findPlant("plant-7485").history.some(e=>e.date===date),future),false);
 await first.locator("#watering-dialog [data-close]").first().click();
 console.log("Manual watering date synced; newer dates preserved; duplicate and future dates rejected");
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
 // A corrupt pre-upgrade record must not prevent reconnecting or receiving valid changes.
 const collection=await first.evaluate(()=>state.sync.collectionId);
 const corrupt=await fetch("http://127.0.0.1:9000/collections/"+collection+"/ops/legacy-invalid.json?ns=demo-plant-pocket-default-rtdb",{method:"PUT",headers:{Authorization:"Bearer owner","Content-Type":"application/json"},body:JSON.stringify({writer:"legacy",payload:"{"})});
 assert.equal(corrupt.status,200);

 await second.locator("#sync-now").click();
 await second.waitForFunction(()=>document.querySelector("#sync-status").textContent.startsWith("Synced"));
 // Confirm CSP blocks inline event handlers while regular UI and Firebase continue working.
 await first.evaluate(()=>{globalThis.cspViolation=false;document.addEventListener("securitypolicyviolation",()=>globalThis.cspViolation=true,{once:true});const img=document.createElement("img");img.setAttribute("onerror","globalThis.injected=true");img.src="/missing-csp-test.png";document.body.append(img);});
 await first.waitForFunction(()=>globalThis.cspViolation===true);
 assert.equal(await first.evaluate(()=>globalThis.injected),undefined);
 await first.locator("#detail-dialog [data-close]").click();
 await first.locator("#sync-devices").click();
 await first.waitForSelector("#device-list button");
 first.once("dialog",dialog=>dialog.accept());
 await first.locator("#device-list button").click();
 await second.locator("#sync-now").click();
 await second.waitForFunction(()=>/no longer|denied/i.test(document.querySelector("#sync-status").textContent));
 console.log("CSP enforced; owner revoked the second phone and its access was denied");
 console.log("Two-phone browser flow passed");
})().catch(async error=>{
 console.error(error);
 if(browser)for(const context of browser.contexts())for(const page of context.pages())console.error("Sync status:",await page.locator("#sync-status").textContent().catch(()=>"unavailable"),"Boot:",await page.locator("#boot-error").textContent().catch(()=>"unavailable"));
 process.exitCode=1;
}).finally(async()=>{if(browser)await browser.close();});
