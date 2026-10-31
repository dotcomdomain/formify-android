import {spawn, execFileSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
const adb=process.argv[2], serial=process.argv[3] || 'emulator-5554';
if(!adb) throw new Error('Pass the adb executable path');
const pages=await(await fetch('http://127.0.0.1:9222/json/list')).json();
const page=pages.find(p=>p.url.startsWith('https://getformify.pages.dev'));
const ws=new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
let id=0;const pending=new Map();
ws.onmessage=e=>{const data=JSON.parse(e.data),p=pending.get(data.id);if(p){pending.delete(data.id);clearTimeout(p.timer);data.error?p.reject(data.error):p.resolve(data.result)}};
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>reject(new Error(method)),20000);pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({id:n,method,params}));});
const js=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const wait=async expression=>{for(let i=0;i<80;i++){if(await js(expression))return;await pause(150)}throw new Error(expression)};
const tap=async selector=>{
  await js(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest',behavior:'smooth'})`);
  await pause(350);
  const point=await js(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
  await pause(90);
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
};
const top=async(selector,offset=120)=>{await js(`window.scrollTo({top:document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().top+scrollY-${offset},behavior:'smooth'})`);await pause(650)};
await js(`location.hash='you'`);await wait(`!!document.querySelector('[data-th=warm]')`);
await js(`document.querySelector('[data-th=warm]').click();location.hash='search'`);
await wait(`!!document.querySelector('.bcard')`);await pause(500);
await js(`window.scrollTo({top:0,behavior:'instant'})`);
// A real screen recording; no account or check-in is submitted.
const started=Date.now();
const recorder=spawn(adb,['-s',serial,'shell','screenrecord','--bit-rate','10000000','--time-limit','80','/sdcard/formify-demo-raw.mp4'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
recorder.stderr.on('data',data=>process.stderr.write(data));
const shots=[];let shot;
const mark=key=>{const now=(Date.now()-started)/1000;if(shot)shot.end=now;shot={key,start:now};shots.push(shot);console.log('Filming '+key)};
try {
  await pause(1600);
  mark('discover');await pause(2400);
  await js(`window.scrollTo({top:340,behavior:'smooth'})`);await pause(1700);
  mark('search');await js(`window.scrollTo({top:0,behavior:'smooth'})`);await pause(450);
  for(const value of ['s','sk','ski']){await js(`document.querySelector('#q').value=${JSON.stringify(value)};document.querySelector('#q').dispatchEvent(new Event('input',{bubbles:true}))`);await pause(220)}
  await wait(`document.querySelector('.bcard')?.innerText.toLowerCase().includes('ski')`);await pause(2000);
  mark('forms');await tap('.bcard');await wait(`!!document.querySelector('.formlist .formrow')`);await pause(1400);
  await top('.formlist',160);await pause(3200);
  mark('fill');await tap('.formacts .btn-alt');await wait(`!!document.querySelector('#consent')`);await pause(800);
  await tap('#consent');await tap('[data-go=form]');await wait(`!!document.querySelector('#kiosk form input:not([type=file])')`);
  await top('#kiosk',120);await pause(2500);
  await js(`window.scrollBy({top:300,behavior:'smooth'})`);await pause(1500);
  mark('assistant');await tap('[data-tab=assistant]');await wait(`!!document.querySelector('.chatcard')`);await pause(3400);
  mark('account');await tap('[data-tab=you]');await wait(`!!document.querySelector('#aform')`);
  await top('#aform',240);await pause(750);
  await tap('[data-mode=login]');await pause(1200);await tap('[data-mode=signup]');await pause(1200);
  mark('theme');await top('[data-th=warm]',400);await pause(600);
  await tap('[data-th=blue]');await pause(1400);await tap('[data-th=warm]');await pause(1400);
  await tap('[data-th=blue]');await pause(1400);
  mark('finish');await tap('[data-tab=search]');await wait(`!!document.querySelector('#q')`);
  await js(`document.querySelector('#q').value='';document.querySelector('#q').dispatchEvent(new Event('input',{bubbles:true}));window.scrollTo({top:0,behavior:'instant'})`);
  await pause(1500);await tap('#themeBtn');await pause(1800);
  shot.end=(Date.now()-started)/1000;
  await writeFile('shots.json',JSON.stringify({recordedAt:new Date().toISOString(),shots},null,2));
} finally {
  // SIGINT on the Android process finalizes the MP4, unlike terminating the host adb client.
  try{execFileSync(adb,['-s',serial,'shell','pkill','-INT','screenrecord'],{windowsHide:true})}catch{}
  await new Promise(resolve=>{if(recorder.exitCode!==null)resolve();else recorder.on('exit',resolve)});
  ws.close();
  execFileSync(adb,['-s',serial,'pull','/sdcard/formify-demo-raw.mp4','formify-demo-raw.mp4'],{windowsHide:true,stdio:'inherit'});
}
