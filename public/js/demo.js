import { DAY, insightWindow, shapeInsights } from "./insight-data.js";

const copy = (value) => structuredClone(value);
const MODE_KEY = "fz_business_demo";
const DATA_KEY = "fz_business_demo_data_v2";
const field = (id, label, type = "text", required = true, sensitive = false, options) => ({ id, label, type, required, sensitive, description: "", ...(options ? { options } : {}) });
export const COMPANY_SAMPLE = {
  id: "demo_snow_valley", name: "Snow Valley · unofficial rental demo",
  guide: "https://www.skisnowvalley.com/learn-to-ski/1st-timer-guide/rental-equipment-tips/",
  source: "https://www.skisnowvalley.com/wp-content/uploads/2024/11/2022-Group-Ski-Rental-Form.pdf",
  note: "Unofficial Formify concept. Snow Valley has not endorsed this demonstration. This is an individual pre-check-in inspired by its public rental workflow, not a reproduction of its group agreement."
};

export const DEMO_PLAYBOOKS = Object.fromEntries([
  ["fill_chair", "Fill the chair", "Don't lose walk-ins", "walk_in", "Walkaways avoided"],
  ["no_empty_slots", "No empty slots", "Make every booking show up", "appointment", "No-show rate"],
  ["faster_mornings", "Faster mornings", "Get through the rush", "appointment", "Checked in ahead"],
  ["ready_on_time", "Ready when promised", "Hand work back on time", "dropoff", "Average time to ready"],
  ["regulars", "Regulars", "Bring them back", "walk_in", "Rebook rate"],
  ["signed_ahead", "Signed before arrival", "Get the paperwork right", "forms_only", "Forms done ahead"]
].map(([id, name, goal, flow, metric]) => [id, { name, goal, flow, metric, for: "Sample business workflow", levers: { deposit_cents: 0, waitlist_offer: false, rebook_weeks: 0, now_serving: true, addons: [] } }]));

function config(name, label, playbook) {
  return { name, form_label: label, business_type: "bike shop", city: "Hamilton, ON", brand_color: "#1f4d3a", ticket_prefix: "C",
    welcome_title: label, welcome_subtitle: "Try this sample check-in with fictional details.",
    consent_text: "This is a Formify demonstration. Use fictional details only. Sample submissions stay in this browser and do not contact a business or make a booking.",
    done_message: "Your sample check-in is ready. Nothing was sent to a business.", notify: "Front desk", avg_service_minutes: 12, retention_days: 90,
    listed: false, website: "", google_reviews: "", instagram: "", playbook, flow: DEMO_PLAYBOOKS[playbook].flow, levers: copy(DEMO_PLAYBOOKS[playbook].levers),
    steps: [{ title: "Your visit", description: "A few details so the team can prepare.", fields: [
      field("full_name", "Full name", "text", true, true), field("email", "Email", "email", true, true),
      field("service", "What brings you in?", "select", true, false, ["Bike tune-up", "Flat tire", "Safety check", "Rental pickup"]),
      field("notes", "Anything we should know?", "textarea", false)
    ] }]
  };
}

export function snowValleyConfig() {
  const c = config(COMPANY_SAMPLE.name, "Prepare for your rental visit", "faster_mornings");
  Object.assign(c, { business_type: "ski rental", city: "Barrie, ON", brand_color: "#255b86", ticket_prefix: "S", welcome_title: "Spend less time on rental paperwork", welcome_subtitle: "An unofficial Snow Valley concept. Try one renter's pre-check-in with fictional details.", avg_service_minutes: 8, flow: "forms_only" });
  c.steps = [
    { title: "Your visit", description: "One sample submission per renter. Contact fields are a Formify addition for visit updates; they are optional.", fields: [
      field("rental_date", "Rental date", "date"), field("group", "School or group, if applicable", "text", false),
      field("full_name", "Renter's full name", "text", true, true), field("email", "Email for visit updates", "email", false, true),
      field("phone", "Phone for visit updates", "tel", false, true)
    ] },
    { title: "Equipment fitting details", description: "The public group form asks for skier type, height, weight and age. This concept uses explicit metric units. A rental technician must verify the details and fit the equipment.", fields: [
      field("age", "Renter's age", "number", true, true), field("height_cm", "Height in centimetres", "number", true, true),
      field("weight_kg", "Weight in kilograms", "number", true, true),
      { ...field("skier_type", "Skier type", "select", true, false, ["Type I", "Type II", "Type III", "Not sure; ask the rental team"]), description: "Staff must confirm the appropriate classification. This form does not calculate binding settings." }
    ] },
    { title: "Help from the rental team", description: "Equipment assignment, binding settings, technician sign-off and the rental agreement remain with Snow Valley. This sample does not reserve equipment or replace those steps.", fields: [
      field("notes", "Questions for the rental team", "textarea", false),
      field("staff_fitting", "I understand the rental team must verify details and fit the equipment", "checkbox")
    ] }
  ];
  return c;
}

export function seedDemo(now = Date.now()) {
  const configs = { demo_downtown: config("Cedar Cycle · Downtown", "Bike repair drop-off", "ready_on_time"), demo_trailhead: config("Cedar Cycle · Trailhead", "Rental pickup", "faster_mornings"), [COMPANY_SAMPLE.id]: snowValleyConfig() };
  const state = { version: 2, created_at: now - 120 * DAY, configs, visits: [], messages: {}, approvals: {}, invites: [], alerts: [], audit: [], webhook_url: "https://example.com/demo-webhook",
    business: { id: "demo_business", name: "Cedar Cycle Demo", slug: "cedar-cycle-demo" },
    members: [{ id: "demo_owner", name: "Morgan Lee", email: "morgan@example.com", role: "owner" }, { id: "demo_manager", name: "Jamie Rivera", email: "jamie@example.com", role: "manager" }, { id: "demo_staff", name: "Taylor Chen", email: "taylor@example.com", role: "staff" }],
    profile: { tagline: "Friendly repairs and rentals, ready when you are.", about: "A fictional bike shop demonstrating Formify's front desk, forms and customer follow-up tools.", address: "123 Sample Street", city: "Hamilton, ON", phone: "555-0100", hours: "Mon-Sat, 9am-6pm", brand_color: "#1f4d3a", links: { instagram: "", tiktok: "", facebook: "", google_reviews: "", website: "" } }
  };
  const names = ["Alex Chen", "Jordan Patel", "Sam Rivera", "Casey Morgan", "Riley Brooks", "Avery Kim", "Quinn Taylor", "Drew Singh"];
  let sequence = 1000;
  const midnight = new Date(now); midnight.setUTCHours(0, 0, 0, 0);
  Object.entries(configs).forEach(([kiosk, c], ki) => {
    for (let day = 74; day >= 1; day--) {
      const volume = 3 + (day * 7 + ki * 3) % 8;
      for (let i = 0; i < volume; i++) {
        const id = String(++sequence), person = (day + i + ki) % names.length;
        const created = midnight.getTime() - day * DAY + (9 + (i * 3 + day) % 9) * 3600000 + i * 180000;
        const status = (day + i) % 19 === 0 ? "no-show" : (day + i) % 23 === 0 ? "cancelled" : "done";
        state.visits.push({ id, kiosk_id: kiosk, ticket: `${c.ticket_prefix}${sequence}`, status, created_at: created, arrived_at: created + 300000, served_at: status === "done" ? created + (8 + (day + i) % 14) * 60000 : null,
          channel: i % 3 === 0 ? "kiosk" : i % 5 === 0 ? "ai agent" : "phone", language: "en", user_id: i % 4 ? ((day + i) % 3 ? `demo_customer_${person}` : `demo_first_visit_${ki}_${day}_${i}`) : null,
          answers: { full_name: names[person], email: `guest${person + 1}@example.com`, service: c.steps[0].fields.find((f) => f.id === "service")?.options[i % 4] || "Rental pickup", notes: "Fictional demo visit" },
          summary: "Sample customer visit", flags: [], amount_cents: status === "done" ? (35 + (i + day) % 9 * 10) * 100 : null, paid_at: status === "done" ? created + 3600000 : null, pay_method: "demo", deposit_cents: null, deposit_paid_at: null,
          score: i % 3 === 0 ? ((day + i) % 13 === 0 ? 2 : (day + i) % 4 === 0 ? 4 : 5) : null, comment: (day + i) % 13 === 0 ? "I had trouble finding the pickup desk." : "Easy check-in and a friendly team.", unread: 0, delete_status: null });
      }
    }
    for (const [i, status] of ["waiting", "serving", "ready", "payment", "pending", "waiting", "done"].entries()) {
      const id = String(++sequence), created = now - (55 - i * 5) * 60000;
      const row = { id, kiosk_id: kiosk, ticket: `${c.ticket_prefix}${String(i + 41).padStart(3,"0")}`, status, created_at: created, arrived_at: status === "pending" ? null : created,
        served_at: ["serving","ready","payment","done"].includes(status) ? created + 8 * 60000 : null, channel: i % 2 ? "phone" : "kiosk", language: "en", user_id: `demo_customer_${i}`,
        answers: { full_name: names[i], email: `guest${i+1}@example.com`, service: "Bike tune-up", notes: i === 2 ? "Pickup after 4pm, please." : "Sample visit only" },
        summary: ["Flat tire; wants to get back on the trail.", "Routine tune-up; customer is at the desk.", "Bike ready; customer asked about pickup.", "Service finished; awaiting payment.", "Checked in remotely; arriving soon.", "Needs help finding the rental counter.", "Completed visit; customer requested data deletion."][i],
        flags: i === 0 ? ["First visit"] : [], amount_cents: ["payment","done"].includes(status) ? 6500 : null, paid_at: status === "done" ? now - 60000 : null, pay_method: status === "done" ? "demo" : null,
        deposit_cents: status === "pending" ? 1000 : null, deposit_paid_at: status === "pending" ? now - 300000 : null, score: status === "done" ? 2 : null, comment: "The wait was longer than expected.", unread: i === 2 ? 1 : 0, delete_status: status === "done" ? "requested" : null, delete_note: status === "done" ? "Please remove my sample contact details." : null };
      state.visits.push(row);
      state.messages[id] = [{ id: `welcome_${id}`, sender: "system", kind: "status", body: "Sample visit received. This conversation is simulated.", at: created }, { id: `message_${id}`, sender: "customer", kind: "text", body: i === 2 ? "Can I pick this up after 4pm?" : "Thanks! This is a sample conversation.", at: created + 60000 }];
      if (i === 1 || i === 2) {
        const message_id = `approval_message_${id}`;
        state.approvals[id] = [{ id:`demo_approval_${id}`, message_id, title:kiosk === COMPANY_SAMPLE.id ? "Ask the rental team to review my fitting details" : "Replace worn brake cable", amount_cents:kiosk === COMPANY_SAMPLE.id ? 0 : 1500, status:i===1?"approved":"pending", requested_by:"Morgan (demo)", requested_at:created+120000 }];
        state.messages[id].push({ id:message_id, sender:"business", kind:"approval", body:"Sample approval request", at:created+120000 });
      }
      if (i === 5) state.alerts.push({ id: `alert_${id}`, kiosk_id: kiosk, kind: "help", ticket: row.ticket, message: "Sample visitor needs help finding the rental counter.", at: now - 180000 });
    }
    state.audit.push({ kiosk_id: kiosk, action: "sample data loaded", detail: "Fictional visits and conversations are ready to explore.", at: now - 60000 });
    state.invites.push({kiosk_id:kiosk,name:"Alex Demo",email:"alex@example.com",status:"opened",created_at:now-DAY,opened_at:now-3600000}, {kiosk_id:kiosk,name:"Jordan Demo",email:"jordan@example.com",status:"created",created_at:now-600000,opened_at:null});
  });
  // The researched company's sample uses rental-specific data throughout the demo.
  for (const v of state.visits.filter((v) => v.kiosk_id === COMPANY_SAMPLE.id)) {
    v.answers = { full_name:v.answers.full_name, email:v.answers.email, rental_date:new Date(v.created_at).toISOString().slice(0,10), group:"Demo ski group", age:28, height_cm:170, weight_kg:70, skier_type:"Type I", notes:"First rental; please help confirm fit.", staff_fitting:true };
    v.summary = v.status === "ready" ? "Rental details reviewed; waiting for technician fitting." : v.status === "pending" ? "Pre-check-in complete; renter is on the way." : "Sample renter needs skis, boots and a helmet.";
    v.comment = v.score <= 2 ? "It took a while to find the fitting area." : "Clear steps and a helpful rental team.";
    v.flags = ["Technician must confirm fitting"];
  }
  return state;
}

function analytics(state, id, days, now) {
  const c = state.configs[id], w = insightWindow(days, c.retention_days, state.created_at, now);
  const retained = state.visits.filter((v) => v.kiosk_id === id && v.created_at >= w.retained_from && v.created_at < now);
  const visits = retained.filter((v) => v.created_at >= w.from);
  const summarize = (items) => {
    const waits = items.filter((v) => v.arrived_at && v.served_at >= v.arrived_at).map((v) => v.served_at - v.arrived_at);
    return { visits: items.length, completed: items.filter((v)=>v.status==="done").length, no_shows:items.filter((v)=>v.status==="no-show").length, cancelled:items.filter((v)=>v.status==="cancelled").length,
      active:items.filter((v)=>["pending","waiting","serving","ready","payment"].includes(v.status)).length, anonymous_visits:items.filter((v)=>!v.user_id).length,
      paid_cents:items.reduce((sum,v)=>sum+(v.paid_at?v.amount_cents||0:0),0), paid_visits:items.filter((v)=>v.paid_at).length,
      deposit_cents:items.reduce((sum,v)=>sum+(v.deposit_paid_at?v.deposit_cents||0:0),0), outstanding_cents:items.reduce((sum,v)=>sum+(v.status==="payment"&&!v.paid_at?v.amount_cents||0:0),0),
      wait_ms:waits.length?waits.reduce((a,b)=>a+b,0)/waits.length:null, wait_samples:waits.length };
  };
  const known = [...new Set(visits.map((v)=>v.user_id).filter(Boolean))];
  const repeat = known.filter((u)=>retained.filter((v)=>v.user_id===u).length>1).length;
  const daily = new Map(), hours = new Map(), channels = new Map();
  for(const v of visits) {
    const day = new Date(v.created_at).toISOString().slice(0,10), hour = new Date(v.created_at).getUTCHours();
    const row = daily.get(day)||{day,visits:0,completed:0}; row.visits++; if(v.status==="done")row.completed++;daily.set(day,row);
    hours.set(hour,(hours.get(hour)||0)+1);channels.set(v.channel,(channels.get(v.channel)||0)+1);
  }
  const feedback=visits.filter((v)=>v.score).sort((a,b)=>b.created_at-a.created_at);
  const attention=visits.filter((v)=>v.unread||v.delete_status==="requested"||v.score&&v.score<=2||v.status==="ready"||v.status==="payment"&&!v.paid_at)
    .sort((a,b)=>Number(b.delete_status==="requested")-Number(a.delete_status==="requested")||(b.unread||0)-(a.unread||0)||a.created_at-b.created_at);
  const rows = { summary:[summarize(visits)], previous:[summarize(retained.filter((v)=>v.created_at>=w.previous_from&&v.created_at<w.previous_to))],
    customers:[{identified_customers:known.length,repeat_customers:repeat,single_visit_customers:known.length-repeat}],
    ratings:[{count:feedback.length,average:feedback.length?feedback.reduce((sum,v)=>sum+v.score,0)/feedback.length:null,low_scores:feedback.filter((v)=>v.score<=2).length}],
    daily:[...daily.values()],hours:[...hours].map(([hour,visits])=>({hour,visits})),channels:[...channels].map(([channel,visits])=>({channel,visits})),
    feedback:feedback.slice(0,8).map((v)=>({ticket:v.ticket,score:v.score,comment:v.comment,at:v.created_at})), attention:attention.slice(0,20),
    attention_counts:[{deletion_requests:visits.filter((v)=>v.delete_status==="requested").length,unanswered_visits:visits.filter((v)=>v.unread).length,unpaid_visits:visits.filter((v)=>v.status==="payment"&&!v.paid_at).length,ready_visits:visits.filter((v)=>v.status==="ready").length}],
    funnel:[{type:"view",count:visits.length*3},{type:"start",count:Math.round(visits.length*1.3)},{type:"checkin",count:visits.length},{type:"rebook",count:Math.floor(visits.length*.16)}],
    audit:state.audit.filter((v)=>v.kiosk_id===id&&v.at>=w.from).slice(-15).reverse() };
  return {...shapeInsights(rows,w,now),demo:true,location:{id,name:c.name,form_label:c.form_label}};
}

export function createDemo(storage, clock = () => Date.now()) {
  const read = (key) => { try { return storage?.getItem(key); } catch { return null; } };
  const write = (key,value) => { try { storage?.setItem(key,value); } catch {} };
  let enabled = read(MODE_KEY) === "1", state = null;
  const getState = () => {
    if (!state) {
      try { const saved=JSON.parse(read(DATA_KEY)); if(saved?.version===2&&saved.configs&&Array.isArray(saved.visits)&&clock()-saved.seeded_at<12*3600000)state=saved; } catch {}
      state ||= {...seedDemo(clock()),seeded_at:clock()};
    }
    return state;
  };
  const persist = () => write(DATA_KEY,JSON.stringify(getState()));
  const fail = (message) => { const e=new Error(message);e.status=400;throw e; };
  const needConfig = (id) => getState().configs[id] || fail("This demo form does not exist. No live request was sent.");
  const needVisit = (id) => getState().visits.find((v)=>v.id===String(id)) || fail("This demo visit does not exist. No live request was sent.");
  const addAudit = (id,action,detail) => getState().audit.push({kiosk_id:id,action,detail,at:clock()});
  function handle(url,opts={}) {
    if(!enabled) fail("Demo mode is off.");
    const parsed = new URL(url,"https://formify.example"), method=(opts.method||"GET").toUpperCase(), b=opts.body||{}, s=getState();
    if(parsed.origin!=="https://formify.example")fail("External requests are unavailable in demo mode.");
    const p=parsed.pathname;
    if(p==="/api/biz/me"&&method==="GET")return {signedIn:true,demo:true,business:copy(s.business),member:copy(s.members[0]),perms:{forms:true,insights:true,staff:true},payments:true,
      locations:Object.entries(s.configs).map(([id,c])=>({id,name:c.name,business_type:c.business_type,brand_color:c.brand_color,city:c.city,waiting:s.visits.filter((v)=>v.kiosk_id===id&&v.status==="waiting").length,alerts:s.alerts.filter((a)=>a.kiosk_id===id).length,ease:{avg:4.6,count:86}}))};
    if(p==="/api/playbooks"&&method==="GET")return {playbooks:copy(DEMO_PLAYBOOKS)};
    if(p==="/api/biz/page"){
      if(method==="GET")return {name:s.business.name,slug:s.business.slug,published:true,profile:copy(s.profile),forms:Object.entries(s.configs).map(([id,c])=>({id,label:c.form_label,fallback:c.welcome_title,subtitle:c.welcome_subtitle,listed:c.listed!==false}))};
      if(method==="POST"){
        s.business.name=String(b.name||s.business.name).slice(0,80);s.business.slug=String(b.slug||s.business.slug).replace(/[^a-z0-9-]/g,"").slice(0,40);s.profile={...s.profile,...copy(b.profile)};
        for(const f of b.forms||[])if(s.configs[f.id])Object.assign(s.configs[f.id],{form_label:f.label,listed:f.listed});
        return {ok:true,slug:s.business.slug};
      }
    }
    if(p==="/api/biz/staff"){
      if(method==="GET")return {members:copy(s.members)};
      if(method==="POST"){ if(!b.name||!b.email)fail("Enter a sample name and email.");const id=`demo_member_${s.members.length+1}`;s.members.push({id,name:b.name,email:b.email,role:b.role||"staff"});return {ok:true,email:b.email,temp_password:"demo-only-not-a-login"}; }
    }
    const staff=p.match(/^\/api\/biz\/staff\/([^/]+)$/);
    if(staff&&method==="DELETE"){if(staff[1]==="demo_owner")fail("Keep the demo owner.");s.members=s.members.filter((m)=>m.id!==staff[1]);return {ok:true};}
    if(p==="/api/biz/integrations"){
      if(method==="GET")return {webhook_url:s.webhook_url};
      if(method==="POST"){if(!b.test)s.webhook_url=String(b.webhook_url||"");return {ok:true,secret:b.test?undefined:"demo-secret-not-a-real-key"};}
    }
    if(p==="/api/biz/password")fail("Exit demo mode to manage your real password. No credentials were changed.");
    if(p==="/api/generate"&&method==="POST"){const c=config("Demo business","Sample check-in form","fill_chair");return {config:c,source:"template",note:"Local sample; no AI request was sent."};}
    if(p==="/api/import"&&method==="POST")return {config:copy(snowValleyConfig()),source:"document",warnings:["Demo import: these are sample questions. Your document was not read, uploaded or converted.","This unofficial Snow Valley concept does not replace its rental agreement or technician fitting."]};
    if(p==="/api/kiosks"&&method==="POST"){const id=`demo_form_${Object.keys(s.configs).length+1}`;s.configs[id]=copy(b.config||config("Demo business","Sample form","fill_chair"));addAudit(id,"sample form published","Saved only in this browser.");return {id};}
    const kiosk=p.match(/^\/api\/kiosks\/([^/]+)(?:\/(checkins|insights|export|now|invites))?$/);
    if(kiosk){
      const id=kiosk[1], c=needConfig(id), part=kiosk[2];
      if(!part&&method==="GET")return {config:copy(c),id};
      if(!part&&method==="PUT"){s.configs[id]=copy(b.config);addAudit(id,"sample form edited","Demo changes only.");return {ok:true};}
      if(part==="invites"&&method==="GET")return {invites:copy(s.invites.filter((i)=>i.kiosk_id===id).slice(-8).reverse())};
      if(part==="invites"&&method==="POST"){
        if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(b.email||"")))fail("Enter a sample email address.");
        s.invites.push({kiosk_id:id,email:String(b.email),name:String(b.name||""),status:"created",created_at:clock(),opened_at:null});
        addAudit(id,"sample invite created","Simulated only; no email or mail app was opened.");
        return {ok:true,demo:true,sent:false,link:`/demo.html?view=phone&id=${encodeURIComponent(id)}`};
      }
      if(part==="insights"&&method==="GET")return analytics(s,id,Number(parsed.searchParams.get("days")||30),clock());
      if(part==="checkins"&&method==="GET"){
        const cutoff=clock()-DAY, data=s.visits.filter((v)=>v.kiosk_id===id&&v.created_at>=cutoff), a=analytics(s,id,30,clock()),play=DEMO_PLAYBOOKS[c.playbook]||DEMO_PLAYBOOKS.fill_chair;
        const checkins=copy(data).map((v)=>{
          v.line_at=v.arrived_at||v.created_at;
          const approvals=s.approvals[v.id]||[];v.approvals_open=approvals.filter((a)=>a.status==="pending").length;v.approved_cents=approvals.filter((a)=>a.status==="approved").reduce((sum,a)=>sum+a.amount_cents,0);
          if(parsed.searchParams.get("reveal")!==v.id) {
            for(const f of c.steps.flatMap((x)=>x.fields))if(f.sensitive&&v.answers[f.id])v.answers[f.id]="•••";
          } else addAudit(id,"sample sensitive reveal",`Sample ticket ${v.ticket}`);
          return v;
        });
        return {config:copy(c),checkins,alerts:copy(s.alerts.filter((x)=>x.kiosk_id===id)),inbox:data.filter((v)=>v.unread||v.delete_status==="requested").map((v)=>({id:v.id,ticket:v.ticket,status:v.status,unread:v.unread,delete_status:v.delete_status,delete_note:v.delete_note,last:s.messages[v.id]?.filter((m)=>m.sender==="customer").at(-1)?.body})),
          feedback:a.feedback,audit:a.audit,ease:{avg:a.ratings.average,count:a.ratings.count},funnel:{views:a.funnel.view,starts:a.funnel.start,checkins:a.summary.visits},goal:{playbook:c.playbook,...play,value:String(a.summary.completed),detail:"sample completed visits in the last 30 days",metric:"Completed sample visits"}};
      }
      if(part==="now"&&method==="GET"){const v=s.visits.filter((v)=>v.kiosk_id===id&&v.created_at>=clock()-DAY);return {name:c.name,brand_color:c.brand_color,serving:v.filter((v)=>v.status==="serving").map((v)=>v.ticket),ready:v.filter((v)=>v.status==="ready").map((v)=>v.ticket),next:v.filter((v)=>v.status==="waiting").map((v)=>({ticket:v.ticket,express:v.channel!=="kiosk"})),wait_minutes:12};}
      if(part==="export"&&method==="GET"){
        const days=Math.min(Number(parsed.searchParams.get("days")||90),c.retention_days), rows=s.visits.filter((v)=>v.kiosk_id===id&&v.created_at>=clock()-days*DAY);
        const cell=(v)=>`"${String(v??"").replace(/"/g,'""')}"`;
        return {csv:[["DEMO DATA ONLY","Ticket","Status","Created","Amount CAD"],...rows.map((v)=>["Fictional sample",v.ticket,v.status,new Date(v.created_at).toISOString(),((v.amount_cents||0)/100).toFixed(2)])].map((r)=>r.map(cell).join(",")).join("\r\n")};
      }
    }
    const visit=p.match(/^\/api\/checkins\/([^/]+)(?:\/(messages|data|approvals))?$/);
    if(visit){
      const v=needVisit(visit[1]);
      if(visit[2]==="messages"){
        const messages=s.messages[v.id]||=[];
        if(method==="GET"){v.unread=0;return {messages:copy(messages),approvals:copy(s.approvals[v.id]||[])};}
        if(method==="POST"){if(!String(b.body||"").trim())fail("Write a sample reply.");messages.push({id:`demo_msg_${clock()}`,sender:"business",author:"Morgan (demo)",kind:"text",body:String(b.body).slice(0,1000),at:clock()});v.unread=0;return {ok:true};}
      }
      if(visit[2]==="approvals"&&method==="POST"){
        if(String(b.title||"").trim().length<3)fail("Say what needs sample approval.");
        const amount=Math.round(Number(b.amount||0)*100);if(!Number.isFinite(amount)||amount<0)fail("Enter a valid sample amount.");
        const approvals=s.approvals[v.id]||=[];if(approvals.some((a)=>a.status==="pending"))fail("This demo visit already has a pending approval.");
        const id=`demo_approval_${clock()}`, message_id=`demo_approval_message_${clock()}`;
        approvals.push({id,message_id,title:String(b.title).slice(0,140),amount_cents:amount,status:"pending",requested_by:"Morgan (demo)",requested_at:clock()});
        (s.messages[v.id]||=[]).push({id:message_id,sender:"business",kind:"approval",body:String(b.title).slice(0,140),at:clock()});
        addAudit(v.kiosk_id,"sample approval requested",`Sample ticket ${v.ticket}; no customer was contacted.`);return {id};
      }
      if(visit[2]==="data"&&method==="POST"){
        if(b.action==="delete"){v.answers={};v.summary="Sample data deleted";v.flags=[];v.user_id=null;v.unread=0;v.delete_status="deleted";s.messages[v.id]=(s.messages[v.id]||[]).filter((m)=>m.sender!=="customer");}
        else if(b.action==="keep"&&String(b.note||"").trim()){v.delete_status="kept";v.delete_note=String(b.note);}
        else fail("Choose delete or enter a reason to keep the sample.");
        addAudit(v.kiosk_id,"sample data request handled",`Sample ticket ${v.ticket}`);return {ok:true};
      }
      if(!visit[2]&&method==="PATCH"){
        if(!["waiting","serving","ready","payment","done","no-show"].includes(b.status))fail("Choose a sample visit status.");
        if(b.status==="payment"){if(!(Number(b.amount)>0))fail("Enter a sample total.");v.amount_cents=Math.round(Number(b.amount)*100);}
        v.status=b.status;if(b.status==="serving")v.served_at=clock();if(b.status==="done"&&b.paid==="counter"){v.paid_at=clock();v.pay_method="demo counter";}
        addAudit(v.kiosk_id,"sample visit updated",`${v.ticket}: ${v.status}`);return {ok:true};
      }
    }
    const alert=p.match(/^\/api\/alerts\/([^/]+)$/);
    if(alert&&method==="POST"){s.alerts=s.alerts.filter((a)=>a.id!==alert[1]);return {ok:true};}
    fail("This action is unavailable in demo mode. No live request was sent.");
  }
  return {
    get enabled(){return enabled;},
    setEnabled(value){enabled=!!value;write(MODE_KEY,enabled?"1":"0");if(enabled)persist();},
    reset(){state={...seedDemo(clock()),seeded_at:clock()};persist();},
    request(url,opts){const result=handle(url,opts);persist();return copy(result);},
    previewConfig(id){return copy(needConfig(id));},
    previewSubmit(id,answers){const c=needConfig(id);const v={id:`demo_submission_${clock()}`,kiosk_id:id,ticket:`${c.ticket_prefix}DEMO`,status:"done",created_at:clock(),answers:copy(answers),channel:"phone",language:"en",unread:0,summary:"Sample pre-check-in",flags:[],user_id:null};getState().visits.push(v);persist();return {ticket:v.ticket,ahead:0,wait_minutes:0};}
  };
}
