import AppKit
import WebKit
import Foundation

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let config = WKWebViewConfiguration()
config.websiteDataStore = .nonPersistent()
let web = WKWebView(frame: NSRect(x:0,y:0,width:390,height:844), configuration:config)
var finished = false
var failed = false
func fail(_ text:String) { fputs(text+"\n",stderr); failed=true; finished=true }
class Delegate: NSObject, WKNavigationDelegate {
    var ran = false
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { fail(error.localizedDescription) }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { fail(error.localizedDescription) }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if ran { return }; ran=true
        let js = """
        const wait = ms => new Promise(r=>setTimeout(r,ms));
        let n=0; const check=(v,m)=>{if(!v)throw Error(m);n++};
        for(let i=0;i<100&&!document.querySelector(".plant-card");i++)await wait(100);
        check(document.querySelectorAll(".plant-card").length===16,"16 cards rendered");
        check(document.documentElement.scrollWidth<=390,"No horizontal overflow at phone width");
        const badImages=[...document.images].filter(i=>i.complete&&!i.naturalWidth);
        check(!badImages.length,"Photos load");
        document.querySelector("#search").value="aloe";
        document.querySelector("#search").dispatchEvent(new Event("input"));
        check(document.querySelectorAll(".plant-card").length===1,"Search filters cards");
        document.querySelector("#search").value="";
        document.querySelector("#search").dispatchEvent(new Event("input"));
        document.querySelector("[data-detail]").click();
        check(document.querySelector("#detail-dialog").open,"Detail opens");
        document.querySelector("[data-log=watered]").click();await wait(300);
        check(document.querySelector("#detail-content").textContent.includes("Watered"),"Water log rendered");
        check(document.querySelectorAll(".plant-card .badge.due").length===15,"Logged plant no longer due");
        document.querySelector("[data-log=moist]").click();await wait(300);
        check(document.querySelector("#detail-content").textContent.includes("Checked · still moist"),"Moist check separate");
        document.querySelector("[data-undo]").click();await wait(300);
        check(!document.querySelector(".history").textContent.includes("still moist"),"Undo removes last log");
        document.querySelector("[data-edit]").click();
        check(document.querySelector("#editor-dialog").open,"Edit opens");
        const form=document.querySelector("#editor-form");
        check(form.elements.name.value==="Compact dracaena","Editor populated");
        form.elements.notes.value="Browser test note";
        form.requestSubmit();await wait(400);
        check(!document.querySelector("#editor-dialog").open,"Edit saved");
        document.querySelector("[data-detail]").click();
        check(document.querySelector("#detail-content").textContent.includes("Browser test note"),"Notes saved");
        document.querySelector("#detail-dialog").close();
        document.querySelector("#add-plant").click();
        form.elements.name.value="Test fern";
        form.elements.botanical.value="Test only";
        form.elements.light.value="Filtered light";
        form.elements.water.value="Check compost first";
        form.requestSubmit();await wait(400);
        check(document.querySelectorAll(".plant-card").length===17,"New plant added");
        document.querySelector("#import").click();
        check(document.querySelector("#import-dialog").open,"Import opens");
        check(document.querySelector("#confirm-import").disabled,"Import cannot run before validation");
        document.querySelector("#import-dialog").close();
        document.querySelector("#install").click();
        check(document.querySelector("#help-dialog").textContent.includes("On iPhone"),"iPhone help available");
        check(document.querySelector("#help-dialog").textContent.includes("On Android"),"Android help available");
        document.querySelector("#help-dialog").close();
        const backup=C.parseImport({format:"plant-pocket-backup",version:1,season:state.season,plants:state.plants});
        check(backup.plants.length===17,"Live collection round-trip");
        check(backup.plants[0].notes==="Browser test note","Notes survive round-trip");
        const stored=await readDB();check(stored.plants.length===17,"IndexedDB collection saved");
        check(stored.plants[0].history.length===1,"IndexedDB water log saved");
        const recordDate=C.addDays(C.dayKey(),-1);
        const recordFile={format:"plant-pocket-records",version:1,records:PLANT_SEEDS.map(p=>({plantId:p.id,type:"watered",date:recordDate}))};
        function chooseRecords(data){
          const transfer=new DataTransfer();
          transfer.items.add(new File([JSON.stringify(data)],"care-records.json",{type:"application/json"}));
          document.querySelector("#import-file").files=transfer.files;
          document.querySelector("#import-file").dispatchEvent(new Event("change"));
        }
        document.querySelector("#import").click();chooseRecords(recordFile);await wait(300);
        check(document.querySelector("#import-preview").textContent.includes("16 new care records"),"Records preview lists matched entries");
        check(!document.querySelector("#confirm-import").disabled,"Validated records ready for import");
        document.querySelector("#confirm-import").click();await wait(400);
        check(!document.querySelector("#import-dialog").open,"Records import completes");
        check(state.plants.length===17,"Record import keeps plant collection intact");
        check(state.plants.slice(0,16).every(p=>p.history.some(e=>e.type==="watered"&&e.date===recordDate)),"All 16 dated records saved");
        check(state.plants[0].lastCheck===C.dayKey(),"Dated import preserves later check");
        check(state.plants[0].notes==="Browser test note","Dated import preserves notes");
        document.querySelector("#import").click();chooseRecords(recordFile);await wait(300);
        check(document.querySelector("#import-preview").textContent.includes("0 new care records"),"Reimport recognises duplicates");
        check(document.querySelector("#confirm-import").disabled,"Duplicate-only import cannot add more records");
        chooseRecords({format:"plant-pocket-records",version:1,records:[{plantId:"plant-7485",date:"9999-01-01",type:"watered"}]});await wait(300);
        check(document.querySelector("#confirm-import").disabled,"Invalid replacement file cannot reuse pending valid import");
        document.querySelector("#import-dialog").close();
        // Leave the visual preview on the real initial 16 plants; this is isolated test storage.
        state={version:1,season:"auto",plants:PLANT_SEEDS.map(p=>C.normalizePlant(p))};
        await writeDB(state);render();
        document.querySelector("#toast").hidden=true;
        [...document.images].forEach(i=>i.loading="eager");
        await Promise.race([Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))),wait(10000).then(()=>{throw Error("Photo decode timed out");})]);
        check([...document.images].every(i=>i.naturalWidth>0),"Bundled images decoded");
        await Promise.race([navigator.serviceWorker.ready,wait(10000).then(()=>{throw Error("Service worker readiness timed out");})]);
        const cache=await caches.open("plant-pocket-v2");
        check(!!await cache.match(new URL("./index.html",location.href).href),"Offline app shell cached");
        const cachedPhotos=await Promise.all(PLANT_SEEDS.map(p=>cache.match(new URL(p.photo,location.href).href)));
        check(cachedPhotos.every(Boolean),"All 16 photos cached for offline use");
        return n+" browser assertions passed";
        """
        webView.callAsyncJavaScript(js, arguments:[:], in:nil, in:.page) { result in
            switch result {
            case .success(let value):
                print(value)
                let sc=WKSnapshotConfiguration()
                webView.takeSnapshot(with:sc) { img,error in
                    if let img=img, let tiff=img.tiffRepresentation, let bitmap=NSBitmapImageRep(data:tiff), let png=bitmap.representation(using:.png,properties:[:]) {
                        try? png.write(to:URL(fileURLWithPath:CommandLine.arguments[1]+"/.build/phone-preview.png"))
                        print("Saved phone preview")
                    }
                    finished=true
                }
            case .failure(let error): fail("Browser test failed: "+error.localizedDescription)
            }
        }
    }
}
let delegate=Delegate()
web.navigationDelegate=delegate
let window=NSWindow(contentRect:NSRect(x:0,y:0,width:390,height:844),styleMask:[.borderless],backing:.buffered,defer:false)
window.contentView=web
web.load(URLRequest(url:URL(string:"http://127.0.0.1:8087/")!))
let timeout=Date().addingTimeInterval(55)
while !finished && Date()<timeout { RunLoop.current.run(until:Date().addingTimeInterval(0.05)) }
if !finished { fail("Browser test timed out") }
exit(failed ? 1 : 0)
