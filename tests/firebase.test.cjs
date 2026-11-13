"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const root=path.resolve(__dirname,".."),base=path.join(root,".build/firebase-tools/node_modules/firebase");
const appSdk=require(path.join(base,"app")),authSdk=require(path.join(base,"auth")),dbSdk=require(path.join(base,"database"));
require("../dist/core.js");require("../dist/data.js");require("../dist/sync-core.js");
const namespace="demo-plant-pocket-default-rtdb",url="http://127.0.0.1:9000";
let checks=0,apps=[];
function check(ok,message){assert.ok(ok,message);checks++;}
async function denied(action,message){await assert.rejects(action,/permission|denied/i,message);checks++;}
async function person(name){
 const app=appSdk.initializeApp({apiKey:"demo-key",projectId:"demo-plant-pocket",databaseURL:"https://"+namespace+".firebaseio.com"},name);apps.push(app);
 const auth=authSdk.getAuth(app);authSdk.connectAuthEmulator(auth,"http://127.0.0.1:9099",{disableWarnings:true});
 const user=(await authSdk.signInAnonymously(auth)).user;
 const db=dbSdk.getDatabase(app);dbSdk.connectDatabaseEmulator(db,"127.0.0.1",9000);
 return {app,auth,user,db};
}
(async()=>{
 const ruleResponse=await fetch(url+"/.settings/rules.json?ns="+namespace,{method:"PUT",headers:{"Authorization":"Bearer owner","Content-Type":"application/json"},body:fs.readFileSync(path.join(root,"firebase/database.rules.json"),"utf8")});
 assert.equal(ruleResponse.status,200,await ruleResponse.text());
 await fetch(url+"/.json?ns="+namespace,{method:"DELETE",headers:{"Authorization":"Bearer owner"}});
 const [a,b,c]=await Promise.all([person("owner"),person("invited"),person("outsider")]);
 const collectionId=crypto.randomBytes(16).toString("hex"),location="collections/"+collectionId;
 await dbSdk.set(dbSdk.ref(a.db,location),{owner:a.user.uid,createdAt:Date.now(),version:1,members:{[a.user.uid]:{joinedAt:Date.now(),inviteId:"owner"}}});
 check((await dbSdk.get(dbSdk.ref(a.db,location+"/owner"))).val()===a.user.uid,"Owner creates private collection");
 await denied(dbSdk.get(dbSdk.ref(c.db,location)),"Uninvited device denied read access");
 await denied(dbSdk.set(dbSdk.ref(b.db,location+"/members/"+b.user.uid),{joinedAt:Date.now(),inviteId:"fake"}),"Joining without a valid invitation denied");
 const token=crypto.randomBytes(24).toString("hex"),invitation={collectionId,createdBy:a.user.uid,expiresAt:Date.now()+3600000};
 await dbSdk.set(dbSdk.ref(a.db,"invites/"+token),invitation);
 check((await dbSdk.get(dbSdk.ref(b.db,"invites/"+token))).val().collectionId===collectionId,"Invitation readable only by exact secret code");
 await denied(dbSdk.get(dbSdk.ref(c.db,"invites")),"Invitations cannot be listed");
 const claim=await dbSdk.runTransaction(dbSdk.ref(b.db,"invites/"+token),value=>{const candidate=value||invitation;return !candidate.claimedBy?{...candidate,claimedBy:b.user.uid}:undefined;});
 check(claim.committed,"Invited device claims code");
 await dbSdk.set(dbSdk.ref(b.db,location+"/members/"+b.user.uid),{joinedAt:Date.now(),inviteId:token});
 check((await dbSdk.get(dbSdk.ref(b.db,location+"/owner"))).val()===a.user.uid,"Invited device gains collection access");
 await denied(dbSdk.update(dbSdk.ref(c.db,"invites/"+token),{claimedBy:c.user.uid}),"Used invitation cannot be claimed again");
 await denied(dbSdk.set(dbSdk.ref(c.db,location+"/members/"+c.user.uid),{joinedAt:Date.now(),inviteId:token}),"Used code cannot add another device");
 await denied(dbSdk.set(dbSdk.ref(b.db,"invites/"+crypto.randomBytes(24).toString("hex")),{...invitation,createdBy:b.user.uid}),"Only collection owner can issue invitations");
 const make=(id,plant,type,date)=>({id,plantId:plant,clock:Date.now(),kind:"log",value:{id,type,date}});
 const aOp=make("android-water","plant-7485","watered",PlantCore.dayKey()),bOp=make("iphone-check","plant-7485","moist",PlantCore.dayKey());
 await Promise.all([
  dbSdk.set(dbSdk.ref(a.db,location+"/ops/"+aOp.id),{writer:a.user.uid,payload:JSON.stringify(aOp)}),
  dbSdk.set(dbSdk.ref(b.db,location+"/ops/"+bOp.id),{writer:b.user.uid,payload:JSON.stringify(bOp)})
 ]);
 const operations=(await dbSdk.get(dbSdk.ref(a.db,location+"/ops"))).val();
 check(operations["android-water"]&&operations["iphone-check"],"Concurrent writes from two anonymous devices both survive");
 await denied(dbSdk.set(dbSdk.ref(b.db,location+"/ops/"+aOp.id),{writer:b.user.uid,payload:"overwritten"}),"Existing care changes cannot be overwritten");
 await denied(dbSdk.set(dbSdk.ref(c.db,location+"/ops/outsider"),{writer:c.user.uid,payload:"x"}),"Uninvited device denied writes");
 await denied(dbSdk.set(dbSdk.ref(b.db,location+"/ops/spoofed"),{writer:a.user.uid,payload:"x"}),"A device cannot impersonate another writer");
 await denied(dbSdk.get(dbSdk.ref(c.db,"collections")),"Private collections cannot be enumerated");
 const publicRead=await fetch(url+"/"+location+".json?ns="+namespace);check(publicRead.status===401,"Unauthenticated reads denied");
 console.log(checks+" Firebase permission and concurrent-write assertions passed");
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{for(const app of apps)dbSdk.goOffline(dbSdk.getDatabase(app));await Promise.all(apps.map(app=>appSdk.deleteApp(app)));setTimeout(()=>process.exit(process.exitCode||0),100);});
