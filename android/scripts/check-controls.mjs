import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const [port='9222',adb,serial='emulator-5554',mode='fixture']=process.argv.slice(2);
const pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page=pages.find(p=>p.url.startsWith('https://getformify.pages.dev'));
assert.ok(page,'Open Formify first');
const ws=new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
let id=0;const pending=new Map();
ws.onmessage=event=>{const data=JSON.parse(event.data),p=pending.get(data.id);if(p){pending.delete(data.id);clearTimeout(p.timer);data.error?p.reject(data.error):p.resolve(data.result)}};
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>reject(new Error(method)),15000);pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({id:n,method,params}))});
const js=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});assert.ok(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const wait=async expression=>{for(let i=0;i<60;i++){if(await js(expression))return;await pause(150)}throw new Error(expression)};
const tap=async selector=>{
 await js(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'instant'})`);await pause(220);
 const point=await js(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
 await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await pause(65);
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
};
const key=async name=>{const codes={ArrowDown:40,Enter:13,Escape:27};await send('Input.dispatchKeyEvent',{type:'keyDown',key:name,code:name,windowsVirtualKeyCode:codes[name]});await send('Input.dispatchKeyEvent',{type:'keyUp',key:name,code:name,windowsVirtualKeyCode:codes[name]})};
const checks=[];
try {
 await wait(`!!window.FormifyUI`);
 if(mode==='real'){
  await js(`location.hash='search'`);await wait(`!!document.querySelector('#q')`);
  const target=await js(`(async()=>{const d=await(await fetch('/api/directory?q=ski')).json();return d.businesses[0].id})()`);
  await js(`location.hash='checkin/'+${JSON.stringify(target)}`);await wait(`!!document.querySelector('#consent')`);
  await js(`document.querySelector('#consent').checked=true;document.querySelector('[data-go=form]').click()`);
  for(let step=0;step<5 && !await js(`!!document.querySelector('#kiosk select')`);step++){
   assert.equal(await js(`document.querySelector('[data-go=next]')?.textContent.trim() !== 'Check in'`),true,'Never submit a check-in');
   await js(`document.querySelectorAll('#kiosk form input:not([type=file])').forEach(input=>{input.value=input.type==='number'?'170':input.type==='email'?'demo@example.invalid':input.type==='date'?'2000-01-01':'Demo visitor'});document.querySelector('[data-go=next]').click()`);await pause(200);
  }
  await wait(`!!document.querySelector('#kiosk select')`);
  await tap('#kiosk select');await wait(`!!document.querySelector('.fm-picker[open]')`);await pause(280);
  assert.ok(await js(`document.querySelector('.fm-picker h2').textContent.length>0`));
  if(adb){execFileSync(adb,['-s',serial,'shell','screencap','-p','/sdcard/formify-custom-picker.png'],{windowsHide:true});execFileSync(adb,['-s',serial,'pull','/sdcard/formify-custom-picker.png','evidence/custom-picker.png'],{windowsHide:true,stdio:'ignore'})}
  await js(`window.FormifyUI.dismissPicker()`);await wait(`!window.FormifyUI.pickerOpen()`);
  checks.push('real rental form opens the themed HTML picker');
 }
 // Isolated controls exercise native form semantics without sending data to any API.
 await js(`(()=>{const host=document.createElement('section');host.id='fm-controls-test';host.style.cssText='position:fixed;inset:100px 24px auto;z-index:9000;background:var(--paper);padding:20px;border:1px solid var(--line);border-radius:20px';host.innerHTML='<form id="fm-test-form"><label for="fm-test-text">Test text</label><input id="fm-test-text"><label for="fm-test-select">Choose equipment</label><select id="fm-test-select" name="equipment" required><option value="">Choose one</option><option value="ski">Ski</option><option value="board">Snowboard</option><option value="disabled" disabled>Unavailable</option></select><label for="fm-test-multi">Pick sizes</label><select id="fm-test-multi" name="sizes" multiple><optgroup label="Sizes">'+Array.from({length:10},(_,i)=>'<option value="'+i+'"'+(i===2?' selected':'')+'>'+(i===9?'Tall':'Size '+i)+'</option>').join('')+'</optgroup></select></form>';document.body.append(host);window.__controlCheck={changes:0,inputs:0,hash:location.hash};document.querySelector('#fm-test-select').addEventListener('input',()=>__controlCheck.inputs++);document.querySelector('#fm-test-select').addEventListener('change',()=>__controlCheck.changes++)})()`);
 await js(`document.querySelector('#fm-test-text').focus({preventScroll:true})`);
 await pause(200);
 assert.equal(await js(`getComputedStyle(document.querySelector('#fm-test-text')).outlineStyle==='none' && getComputedStyle(document.querySelector('#fm-test-text')).boxShadow!=='none'`),true);
 await js(`document.activeElement.blur()`);await pause(350);
 checks.push('text focus uses an integrated border/glow, without an outer outline');
 await tap('#fm-test-select');await wait(`!!document.querySelector('.fm-picker[open]')`);
 assert.equal(await js(`document.querySelectorAll('.fm-picker-option:disabled').length===2 && document.querySelector('.fm-picker').getAttribute('aria-modal')==='true'`),true);
 await tap('.fm-picker-option[data-option-index="2"]');await wait(`!window.FormifyUI.pickerOpen()`);
 assert.equal(await js(`document.querySelector('#fm-test-select').value==='board' && new FormData(document.querySelector('#fm-test-form')).get('equipment')==='board' && __controlCheck.changes===1 && __controlCheck.inputs===1`),true);
 checks.push('selection updates the real form and fires one input/change pair; disabled rows stay disabled');
 await tap('#fm-test-select');await wait(`window.FormifyUI.pickerOpen()`);
 await pause(500);
 if(adb)execFileSync(adb,['-s',serial,'shell','input','keyevent','4'],{windowsHide:true});else await key('Escape');
 await wait(`!window.FormifyUI.pickerOpen()`);
 assert.equal(await js(`location.hash===__controlCheck.hash && document.activeElement.id==='fm-test-select' && __controlCheck.changes===1`),true);
 checks.push('Android Back dismisses the sheet and restores focus without navigating or changing data');
 await key('ArrowDown');await wait(`window.FormifyUI.pickerOpen()`);await key('ArrowDown');await key('Enter');await wait(`!window.FormifyUI.pickerOpen()`);
 assert.equal(await js(`document.querySelector('#fm-test-select').value==='ski' && __controlCheck.changes===2`),true);
 checks.push('keyboard arrows and Enter select options');
 await js(`document.querySelector('#fm-test-select').value='';document.querySelector('#fm-test-select').reportValidity()`);
 await wait(`window.FormifyUI.pickerOpen()`);
 assert.equal(await js(`!!document.querySelector('.fm-picker-note.fm-invalid') && !document.querySelector('#fm-test-select').validity.valid`),true);
 await js(`window.FormifyUI.dismissPicker()`);await wait(`!window.FormifyUI.pickerOpen()`);
 checks.push('required-field validation opens the custom picker with a helpful message');
 await tap('#fm-test-multi');await wait(`window.FormifyUI.pickerOpen()`);
 await js(`document.querySelector('.fm-picker-search').value='Tall';document.querySelector('.fm-picker-search').dispatchEvent(new Event('input',{bubbles:true}))`);
 assert.equal(await js(`document.querySelectorAll('.fm-picker-option:not([hidden])').length===1`),true);
 await tap('.fm-picker-option[data-option-index="9"]');await tap('.fm-picker-done');await wait(`!window.FormifyUI.pickerOpen()`);
 assert.equal(await js(`Array.from(document.querySelector('#fm-test-multi').selectedOptions).map(option=>option.value).join(',')==='2,9'`),true);
 checks.push('searchable multi-select preserves selections and commits on Done');
 await tap('#fm-test-select');await wait(`window.FormifyUI.pickerOpen()`);
 await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:3,y:3});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:3,y:3});await wait(`!window.FormifyUI.pickerOpen()`);
 assert.equal(await js(`document.documentElement.style.overflow!=='hidden' && document.querySelectorAll('.fm-picker').length===0`),true);
 checks.push('backdrop dismissal cleans up the modal and scroll lock');
 console.log(JSON.stringify({passed:checks.length,checks},null,2));
} finally {
 await js(`window.FormifyUI?.dismissPicker();document.querySelector('#fm-controls-test')?.remove();delete window.__controlCheck;document.activeElement?.blur()`);
 await pause(200);
 ws.close();
}
