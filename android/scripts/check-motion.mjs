// Debug-WebView check. Forward its devtools socket to the port supplied as the first argument.
import assert from 'node:assert/strict';
const port = process.argv[2] || '9222';
const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = pages.find(p => p.url.startsWith('https://getformify.pages.dev'));
assert.ok(page, 'Formify WebView must be open');
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let sequence = 0;
const pending = new Map();
socket.onmessage = event => {
  const data = JSON.parse(event.data), request = pending.get(data.id);
  if (request) { pending.delete(data.id); clearTimeout(request.timer); data.error ? request.reject(data.error) : request.resolve(data.result); }
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  const timer = setTimeout(() => { pending.delete(id); reject(new Error('Timed out: ' + method)); }, 15000);
  pending.set(id, {resolve, reject, timer});
  socket.send(JSON.stringify({id, method, params}));
});
const evaluate = async expression => {
  const response = await send('Runtime.evaluate', {expression, returnByValue:true, awaitPromise:true, userGesture:true});
  assert.ok(!response.exceptionDetails, JSON.stringify(response.exceptionDetails));
  return response.result.value;
};
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const waitFor = async expression => {
  for (let i = 0; i < 40; i++) { if (await evaluate(expression)) return; await pause(250); }
  throw new Error('Condition failed: ' + expression);
};
const tap = async selector => {
  const point = await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await send('Input.dispatchMouseEvent', {type:'mousePressed', button:'left', clickCount:1, ...point});
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(selector)}).classList.contains('fm-pressed')`), true, 'press feedback');
  await pause(80);
  await send('Input.dispatchMouseEvent', {type:'mouseReleased', button:'left', clickCount:1, ...point});
};
try {
  await waitFor(`!!document.querySelector('[data-tab=search]')`);
  await evaluate(`document.querySelector('[data-tab=search]').click()`);
  await waitFor(`!!document.querySelector('.fm-tab-indicator') && !!document.querySelector('.bcard')`);
  assert.equal(await evaluate(`document.querySelectorAll('#formify-android-motion').length`), 1);
  const results = ['single motion stylesheet'];
  const order = await evaluate(`Array.from(document.querySelectorAll('.tabs button[data-tab]')).map(button=>button.dataset.tab)`);
  let previous = await evaluate(`location.hash.slice(1) || 'search'`);
  for (const tab of ['assistant', 'visits', 'search']) {
    await tap(`[data-tab=${tab}]`);
    await waitFor(`location.hash === '#${tab}'`);
    await pause(400);
    const aligned = await evaluate(`(()=>{const a=document.querySelector('.tabs button.on').getBoundingClientRect(),b=document.querySelector('.fm-tab-indicator').getBoundingClientRect();return Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y),Math.abs(a.width-b.width),Math.abs(a.height-b.height))<2})()`);
    assert.equal(aligned, true, `highlight follows ${tab}`);
    const expected = order.indexOf(tab) === order.indexOf(previous) ? '0px' : order.indexOf(tab) > order.indexOf(previous) ? '14px' : '-14px';
    assert.equal(await evaluate(`document.documentElement.style.getPropertyValue('--fm-route-x')`), expected, 'page direction follows the actual tab order');
    previous = tab;
    results.push(`${tab}: press, navigation, highlight alignment and page direction`);
  }
  await pause(550);
  assert.equal(await evaluate(`document.querySelectorAll('.fm-pressed,.fm-tap-wave').length`), 0);
  results.push('press and ripple elements clean up');
  await send('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion', value:'reduce'}]});
  await tap('[data-tab=assistant]');
  await waitFor(`!!document.querySelector('#view > .view')`);
  assert.equal(await evaluate(`parseFloat(getComputedStyle(document.querySelector('#view > .view')).animationDuration)<0.001 && !document.querySelector('.fm-tap-wave')`), true);
  results.push('reduced motion suppresses movement and ripples');
  await send('Emulation.setEmulatedMedia', {features:[]});
  // Rapid route changes must leave one correctly positioned highlight.
  await evaluate(`['visits','search','assistant','search'].forEach(tab=>document.querySelector('[data-tab='+tab+']').click())`);
  await pause(650);
  assert.equal(await evaluate(`document.querySelectorAll('.fm-tab-indicator').length === 1 && location.hash === '#search'`), true);
  results.push('rapid taps leave one highlight on the final route');
  console.log(JSON.stringify({passed:results.length, checks:results}, null, 2));
} finally {
  await send('Emulation.setEmulatedMedia', {features:[]});
  socket.close();
}
