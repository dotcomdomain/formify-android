import test from "node:test";
import assert from "node:assert/strict";
import { createDemo, seedDemo, snowValleyConfig, COMPANY_SAMPLE } from "../public/js/demo.js";
import { sanitize } from "../lib/config.js";

const now = Date.UTC(2026,9,31,18);
const storage = () => { const map=new Map();return {getItem:(k)=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)}; };
const setup = () => {const store=storage(),demo=createDemo(store,()=>now);demo.setEnabled(true);return {store,demo};};
const get=(d,path)=>d.request(path);

test("demo is opt-in and never falls through to a live request",()=>{
  const d=createDemo(storage(),()=>now);
  assert.equal(d.enabled,false);
  assert.throws(()=>get(d,"/api/biz/me"),/off/);
  d.setEnabled(true);
  for(const path of ["/api/unknown","/api/kiosks/real_id","/api/checkins/real_id/messages","https://example.com/api/biz/me"]) assert.throws(()=>get(d,path),/demo|Demo|External/);
});

test("mode and sample edits persist separately from real account preferences",()=>{
  const {demo,store}=setup();store.setItem("fz_loc","real-location");
  get(demo,"/api/biz/me");
  const profile=get(demo,"/api/biz/page");
  demo.request("/api/biz/page",{method:"POST",body:{name:"Sample rename",slug:profile.slug,profile:profile.profile}});
  demo.setEnabled(false);
  const next=createDemo(store,()=>now);
  assert.equal(next.enabled,false);assert.equal(store.getItem("fz_loc"),"real-location");
  next.setEnabled(true);assert.equal(get(next,"/api/biz/me").business.name,"Sample rename");
  next.reset();assert.equal(get(next,"/api/biz/me").business.name,"Cedar Cycle Demo");
});

test("every navigation section has sample data and live metrics reconcile to visits",()=>{
  const {demo}=setup(), me=get(demo,"/api/biz/me");
  assert.equal(me.locations.length,3);assert.equal(me.perms.staff,true);
  assert.equal(get(demo,"/api/biz/staff").members.length,3);
  assert.equal(get(demo,"/api/biz/page").forms.length,3);
  assert.equal(Object.keys(get(demo,"/api/playbooks").playbooks).length,6);
  assert.ok(get(demo,"/api/biz/integrations").webhook_url.includes("example.com"));
  for(const l of me.locations) {
    const live=get(demo,`/api/kiosks/${l.id}/checkins`);
    assert.ok(live.checkins.length);assert.ok(live.inbox.length);assert.ok(live.alerts.length);
    assert.ok(get(demo,`/api/kiosks/${l.id}/now`).serving.length);
    const d=get(demo,`/api/kiosks/${l.id}/insights?days=30`);
    assert.equal(d.daily.reduce((n,x)=>n+x.visits,0),d.summary.visits);
    assert.equal(d.hours.reduce((n,x)=>n+x.visits,0),d.summary.visits);
    assert.equal(d.channels.reduce((n,x)=>n+x.visits,0),d.summary.visits);
    assert.ok(d.summary.paid_cents>0);assert.ok(d.recommendations.length);
    assert.ok(get(demo,`/api/kiosks/${l.id}/export?days=7`).csv.startsWith('"DEMO DATA ONLY"'));
  }
});

test("sample status and payments update the queue and analytics",()=>{
  const {demo}=setup();const path="/api/kiosks/demo_downtown";
  const live=get(demo,path+"/checkins");const v=live.checkins.find((v)=>v.status==="payment");
  const before=get(demo,path+"/insights?days=30");
  demo.request(`/api/checkins/${v.id}`,{method:"PATCH",body:{status:"done",paid:"counter"}});
  const after=get(demo,path+"/insights?days=30");
  assert.equal(after.summary.completed,before.summary.completed+1);
  assert.equal(after.summary.paid_cents,before.summary.paid_cents+v.amount_cents);
  assert.equal(after.summary.outstanding_cents,before.summary.outstanding_cents-v.amount_cents);
});

test("sample replies and data deletion stay in the local dataset",()=>{
  const {demo}=setup();const path="/api/kiosks/demo_downtown";
  const live=get(demo,path+"/checkins");const v=live.checkins.find((v)=>v.unread);
  demo.request(`/api/checkins/${v.id}/messages`,{method:"POST",body:{body:"Sample reply"}});
  assert.equal(get(demo,`/api/checkins/${v.id}/messages`).messages.at(-1).body,"Sample reply");
  assert.equal(get(demo,path+"/insights?days=30").attention_counts.unanswered_visits,0);
  const deletion=live.checkins.find((v)=>v.delete_status==="requested");
  demo.request(`/api/checkins/${deletion.id}/data`,{method:"POST",body:{action:"delete"}});
  assert.deepEqual(get(demo,path+`/checkins?reveal=${deletion.id}`).checkins.find((v)=>v.id===deletion.id).answers,{});
});

test("demo invitations never open an email app or claim real delivery",()=>{
  const {demo}=setup(),path="/api/kiosks/demo_downtown/invites";
  assert.ok(get(demo,path).invites.some((i)=>i.status==="opened"));
  const r=demo.request(path,{method:"POST",body:{email:"new@example.com",name:"New Demo"}});
  assert.equal(r.sent,false);assert.equal(r.mailto,undefined);assert.match(r.link,/^\/demo.html/);
  assert.equal(get(demo,path).invites[0].email,"new@example.com");
});

test("demo conversations include approval records and can simulate a new request",()=>{
  const {demo}=setup();
  const queue=get(demo,"/api/kiosks/demo_downtown/checkins").checkins;
  const waiting=queue.find((v)=>v.status==="waiting"),serving=queue.find((v)=>v.status==="serving");
  assert.ok(get(demo,`/api/checkins/${serving.id}/messages`).approvals.some((a)=>a.status==="approved"));
  const path=`/api/checkins/${waiting.id}/approvals`;
  demo.request(path,{method:"POST",body:{title:"Sample extra work",amount:"12.50"}});
  const thread=get(demo,`/api/checkins/${waiting.id}/messages`);
  assert.equal(thread.approvals.at(-1).amount_cents,1250);
  assert.equal(thread.approvals.at(-1).status,"pending");
  assert.ok(thread.messages.some((m)=>m.kind==="approval"));
  assert.throws(()=>demo.request(path,{method:"POST",body:{title:"Another request"}}),/pending/);
});

test("form edits, mock import and public preview submissions never require the backend",()=>{
  let at=now;const demo=createDemo(storage(),()=>at);demo.setEnabled(true);const c=snowValleyConfig();
  const created=demo.request("/api/kiosks",{method:"POST",body:{config:c}});
  c.name="Edited sample";demo.request(`/api/kiosks/${created.id}`,{method:"PUT",body:{config:c}});
  assert.equal(get(demo,`/api/kiosks/${created.id}`).config.name,"Edited sample");
  assert.match(demo.request("/api/import",{method:"POST"}).warnings[0],/not read, uploaded or converted/);
  const before=get(demo,`/api/kiosks/${created.id}/insights?days=7`).summary.visits;
  const result=demo.previewSubmit(created.id,{full_name:"Fictional Guest"});
  assert.match(result.ticket,/DEMO/);
  at++;
  assert.equal(get(demo,`/api/kiosks/${created.id}/insights?days=7`).summary.visits,before+1);
  assert.throws(()=>demo.request("/api/biz/password",{method:"POST",body:{}}),/No credentials were changed/);
});

test("public company sample is clearly unofficial and fits the existing form schema",()=>{
  const c=snowValleyConfig(),clean=sanitize(c);
  assert.equal(clean.listed,false);assert.equal(clean.flow,"forms_only");
  assert.equal(clean.steps.flatMap((s)=>s.fields).length,11);
  assert.match(COMPANY_SAMPLE.note,/not endorsed/);
  assert.ok(c.steps.some((s)=>s.description.includes("binding settings")));
  assert.ok(c.steps[1].fields.some((f)=>f.id==="height_cm"));
  assert.ok(!c.steps.flatMap((s)=>s.fields).some((f)=>/din|binding_setting|signature/.test(f.id)));
  const data=seedDemo(now);
  assert.ok(data.visits.filter((v)=>v.kiosk_id===COMPANY_SAMPLE.id).every((v)=>!v.summary.includes("Bike")&&!v.summary.includes("tire")));
});

test("demo controller handles unavailable browser storage without exposing real actions",()=>{
  const d=createDemo({getItem(){throw new Error("blocked");},setItem(){throw new Error("blocked");}},()=>now);
  d.setEnabled(true);assert.ok(get(d,"/api/biz/me").demo);
  assert.throws(()=>d.request("/api/checkins/1",{method:"PATCH",body:{status:"done"}}),/No live request/);
});
