import AppKit
import WebKit
import Foundation
let app=NSApplication.shared
app.setActivationPolicy(.accessory)
let config=WKWebViewConfiguration()
config.websiteDataStore = .nonPersistent()
let web=WKWebView(frame:NSRect(x:0,y:0,width:390,height:844),configuration:config)
var done=false
var failed=false
func fail(_ message:String){fputs(message+"\n",stderr);failed=true;done=true}
class Delegate:NSObject,WKNavigationDelegate{
 var phase=0
 func webView(_ view:WKWebView,didFailProvisionalNavigation navigation:WKNavigation!,withError error:Error){fail(error.localizedDescription)}
 func webView(_ view:WKWebView,didFinish navigation:WKNavigation!){
  guard view.url?.path=="/" else{return}
  if phase==0{
   phase=1
   view.callAsyncJavaScript("""
   const wait=ms=>new Promise(r=>setTimeout(r,ms));
   for(let i=0;i<100&&!document.querySelector(".plant-card");i++)await wait(100);
   if(document.querySelectorAll(".plant-card").length!==16)throw Error("Original app did not load");
   if(!state.plants.every(p=>C.latest(p,"watered")===null))throw Error("Test must start with the original missing records");
   await navigator.serviceWorker.ready;
   for(let i=0;i<100&&!navigator.serviceWorker.controller;i++)await wait(100);
   if(!navigator.serviceWorker.controller)throw Error("Legacy offline worker never took control");
   const oldCache=await caches.open("plant-pocket-v1");
   if(!await oldCache.match(new URL("./app.js",location.href).href))throw Error("Legacy scripts not cached");
   state.plants[0].notes="Keep my existing notes";
   state.plants[0].history=[{id:"newer-water",type:"watered",date:"2026-11-12"}];
   state.plants[0].lastCheck="2026-11-12";state.plants[0].lastCheckKind="watered";
   state.plants.push({...JSON.parse(JSON.stringify(PLANT_SEEDS[0])),id:"custom-plant",name:"My new plant",history:[]});
   await writeDB(state);
   const response=await fetch("/__qa/upgrade",{method:"POST"});
   if(!response.ok)throw Error("Test server could not switch releases");
   return "Original offline version reproduced";
   """,arguments:[:],in:nil,in:.page){ result in
    switch result{
    case .success(let value):print(value);view.load(URLRequest(url:URL(string:"http://127.0.0.1:8088/record-watering.html")!))
    case .failure(let error):fail(error.localizedDescription)
    }
   }
  }else if phase==1{
   phase=2
   view.callAsyncJavaScript("""
   const wait=ms=>new Promise(r=>setTimeout(r,ms));
   for(let i=0;i<100&&!document.querySelector(".plant-card");i++)await wait(100);
   if(state.plants.length!==17)throw Error("Collection size changed");
   if(state.plants[0].notes!=="Keep my existing notes")throw Error("Personal notes changed");
   if(C.latest(state.plants[0],"watered")!=="2026-11-12")throw Error("Later watering date overwritten");
   if(!state.plants.slice(1,16).every(p=>C.latest(p,"watered")==="2026-11-11"))throw Error("Initial watering missing after old-cache upgrade");
   if(C.latest(state.plants[16],"watered")!==null)throw Error("Unrelated new plant was logged");
   if(![...document.querySelectorAll(".last-water")].slice(1,16).every(e=>e.textContent.includes("11 Nov 2026")))throw Error("Cards do not show 11 November");
   const stored=await readDB();
   if(!stored.plants.slice(1,16).every(p=>p.history.filter(e=>e.type==="watered"&&e.date==="2026-11-11").length===1))throw Error("Stored watering entries missing or duplicated");
   return "Upgrade from original cached app passed: dates visible, notes/later logs/new plants preserved";
   """,arguments:[:],in:nil,in:.page){ result in
    switch result{
    case .success(let value):print(value);done=true
    case .failure(let error):fail(error.localizedDescription)
    }
   }
  }
 }
}
let delegate=Delegate();web.navigationDelegate=delegate
let window=NSWindow(contentRect:NSRect(x:0,y:0,width:390,height:844),styleMask:[.borderless],backing:.buffered,defer:false)
window.contentView=web
web.load(URLRequest(url:URL(string:"http://127.0.0.1:8088/")!))
let timeout=Date().addingTimeInterval(55)
while !done && Date()<timeout{RunLoop.current.run(until:Date().addingTimeInterval(0.05))}
if !done{fail("Upgrade test timed out")}
exit(failed ? 1 : 0)
