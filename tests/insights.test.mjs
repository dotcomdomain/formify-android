import test from "node:test";
import assert from "node:assert/strict";
import { DAY, insightWindow, shapeInsights, loadInsights } from "../lib/insights.js";
import { onRequestGet } from "../functions/api/kiosks/[id]/insights.js";
import { onRequestGet as exportCsv } from "../functions/api/kiosks/[id]/export.js";
const now = Date.UTC(2026, 9, 31, 12);

test("period windows honor retention and location creation before allowing comparison", () => {
  assert.equal(insightWindow(30, 30, 0, now).comparison_available, false);
  assert.equal(insightWindow(7, 30, 0, now).comparison_available, true);
  const short = insightWindow(90, 10, 0, now);
  assert.equal(short.from, now-10*DAY); assert.equal(short.clipped, true);
  const fresh = insightWindow(7, 365, now-DAY, now);
  assert.equal(fresh.from, now-DAY); assert.equal(fresh.comparison_available, false);
  assert.throws(() => insightWindow(365, 30, 0, now));
});

test("empty analytics preserve missing averages and fill chart gaps with zero counts", () => {
  const rows = { summary: [{ visits: 0, wait_ms: null }], ratings: [{ count: 0, average: null }] };
  const d = shapeInsights(rows, insightWindow(7,30,0,now), now);
  assert.equal(d.summary.wait_ms,null); assert.equal(d.ratings.average,null);
  assert.equal(d.hours.length,24); assert.equal(d.daily.length,8);
  assert.ok(d.daily.every((x)=>x.visits === 0));
  assert.deepEqual(d.recommendations,[]);
});

test("recommendations follow actual counts and require enough wait samples", () => {
  const rows = { summary:[{visits:5,wait_ms:20*60000,wait_samples:2}], attention_counts:[{unanswered_visits:2,deletion_requests:1,unpaid_visits:1,ready_visits:1}], ratings:[{low_scores:1}], hours:[{hour:12,visits:5}] };
  let d = shapeInsights(rows, insightWindow(7,30,0,now),now);
  assert.equal(d.recommendations.length,5);
  rows.summary[0].wait_samples=3;
  d = shapeInsights(rows, insightWindow(7,30,0,now),now);
  assert.equal(d.recommendations.length,6);
  assert.match(d.recommendations.at(-1).detail,/12:00 UTC/);
});

function env({role="owner",owner=true}={}) {
  const state = { batches:0, queries:[] };
  return { state, DB:{ prepare(sql) { return { bind(...args) { return { sql,args,first: async()=>{
    if(sql.includes("FROM sessions")) return {subject_id:"member",expires_at:Date.now()+DAY};
    if(sql.includes("FROM members")) return {business_id:"business",role};
    if(sql.startsWith("SELECT id FROM kiosks")) return owner ? {id:"location"} : null;
    if(sql.startsWith("SELECT id, config")) return {id:"location",config:JSON.stringify({name:"Clinic",retention_days:30}),created_at:0};
    throw new Error("Unexpected query");
  }}; }}; }, async batch(statements){ state.batches++; state.queries=statements; return statements.map(()=>({results:[]})); } } };
}
const request=(days=30,cookie=true)=>new Request(`https://formify.test/api/kiosks/location/insights?days=${days}`, {headers:cookie?{cookie:`fz_biz=${"a".repeat(64)}`}:{}});

test("analytics enforce owner/manager and location isolation before querying aggregates",async()=>{
  for(const opts of [{role:"staff"},{owner:false}]) {
    const e=env(opts); assert.equal((await onRequestGet({params:{id:"location"},request:request(),env:e})).status,403);
    assert.equal(e.state.batches,0);
  }
  const e=env(); assert.equal((await onRequestGet({params:{id:"location"},request:request(30,false),env:e})).status,403);
});

test("analytics validate ranges, disable caching, and query one consistent batch",async()=>{
  const e=env({role:"manager"});
  assert.equal((await onRequestGet({params:{id:"location"},request:request(999),env:e})).status,400);
  const response=await onRequestGet({params:{id:"location"},request:request(7),env:e});
  assert.equal(response.status,200); assert.equal(response.headers.get("cache-control"),"no-store");
  assert.equal(e.state.batches,1); assert.ok(e.state.queries.every(q=>q.args[0]==="location"));
  const d=await response.json(); assert.equal(d.window.requested_days,7); assert.equal(d.window.timezone,"UTC");
});

test("retention filter is applied without fetching sensitive form answers",async()=>{
  const e=env();
  await loadInsights(e,{id:"location",config:JSON.stringify({retention_days:3}),created_at:0},30,now);
  assert.ok(e.state.queries.every(q=>q.args[1]===now-3*DAY));
  assert.ok(e.state.queries.every(q=>!q.sql.includes("answers")));
});

test("CSV export caps the requested period at retention and scopes its query",async()=>{
  for (const [days, expectedDays] of [[7,7],[90,30]]) {
    const state = { args:null, audited:false };
    const e = env();
    const prepare = e.DB.prepare.bind(e.DB);
    e.DB.prepare = (sql) => {
      if (sql.startsWith("SELECT config FROM kiosks")) return { bind:()=>({first:async()=>({config:JSON.stringify({name:"Clinic",retention_days:30,steps:[]})})}) };
      if (sql.startsWith("SELECT ticket")) return {bind:(...args)=>({all:async()=>{state.args=args; return {results:[]};}})};
      if (sql.startsWith("INSERT INTO audit")) return {bind:()=>({run:async()=>{state.audited=true;}})};
      return prepare(sql);
    };
    const start=Date.now();
    const response=await exportCsv({params:{id:"location"},request:request(days),env:e});
    assert.equal(response.status,200);
    assert.equal(state.args[0],"location");
    assert.ok(state.args[1]>=start-expectedDays*DAY && state.args[1]<=Date.now()-expectedDays*DAY);
    assert.equal(state.args[2]-state.args[1],expectedDays*DAY);
    assert.equal(state.audited,true);
    assert.match(response.headers.get("content-type"),/text\/csv/);
  }
});
