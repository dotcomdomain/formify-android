// Executed once per trusted document. CSS is supplied from the packaged Android asset.
const mountStyle = () => {
  if (!document.documentElement) return false;
  const style = document.createElement('style');
  style.id = 'formify-android-motion';
  style.textContent = css;
  (document.head || document.documentElement).append(style);
  return true;
};
if (!mountStyle()) {
  const ready = new MutationObserver(() => { if (mountStyle()) ready.disconnect(); });
  ready.observe(document, {childList: true});
}
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const tabIndex = () => Array.from(document.querySelectorAll('.tabs button[data-tab]'))
  .map(button => button.dataset.tab).indexOf(location.hash.slice(1) || 'search');
let previousTab = -1;
const direction = () => {
  const next = tabIndex();
  const x = next < 0 || previousTab < 0 || next === previousTab ? 0 : next > previousTab ? 14 : -14;
  document.documentElement.style.setProperty('--fm-route-x', x + 'px');
  previousTab = next;
};
// Capture runs before the site's route handler inserts the new page.
window.addEventListener('hashchange', direction, true);
let pressed = null, startX = 0, startY = 0;
const release = () => { pressed?.classList.remove('fm-pressed'); pressed = null; };
document.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0) return;
  release();
  const control = event.target.closest('button, a.bcard, a.biz, a.soc, a.formrow');
  if (!control || control.disabled || control.getAttribute('aria-disabled') === 'true') return;
  pressed = control;
  startX = event.clientX; startY = event.clientY;
  control.classList.add('fm-pressed');
}, {passive: true});
document.addEventListener('pointermove', event => {
  if (Math.hypot(event.clientX - startX, event.clientY - startY) > 9) release();
}, {passive: true});
document.addEventListener('pointerup', event => {
  const control = pressed;
  release();
  if (!control || !control.isConnected || reduced.matches) return;
  const rect = control.getBoundingClientRect();
  const wave = document.createElement('span'), circle = document.createElement('span');
  wave.className = 'fm-tap-wave'; wave.setAttribute('aria-hidden', 'true');
  const size = Math.hypot(rect.width, rect.height) * 2;
  const computed = getComputedStyle(control);
  Object.assign(wave.style, {left:rect.left+'px', top:rect.top+'px', width:rect.width+'px',
    height:rect.height+'px', borderRadius:computed.borderRadius, color:computed.color});
  Object.assign(circle.style, {width:size+'px', height:size+'px',
    left:event.clientX-rect.left-size/2+'px', top:event.clientY-rect.top-size/2+'px'});
  wave.append(circle); document.body.append(wave);
  circle.addEventListener('animationend', () => wave.remove(), {once:true});
  setTimeout(() => wave.remove(), 500);
}, {passive: true});
document.addEventListener('pointercancel', release, {passive:true});
document.addEventListener('scroll', release, {passive:true, capture:true});
window.addEventListener('blur', release);
const boot = () => {
  previousTab = tabIndex();
  requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.add('fm-theme-ready')));
  let scheduled = false;
  const update = () => {
    scheduled = false;
    const typing = innerHeight < 600 && document.activeElement?.matches('.kiosk.assistant-mode #msg');
    if (document.body.classList.contains('fm-chat-typing') !== !!typing) document.body.classList.toggle('fm-chat-typing', !!typing);
    document.querySelectorAll('.cards').forEach(grid => {
      Array.from(grid.children).forEach((card, index) => {
        if (card.classList.contains('bcard') && !card.style.getPropertyValue('--fm-card-order'))
          card.style.setProperty('--fm-card-order', String(index));
      });
    });
    document.querySelectorAll('.tabs').forEach(nav => {
      const active = nav.querySelector('button.on');
      if (!active) return;
      if (!nav.classList.contains('fm-motion-tabs')) {
        nav.classList.add('fm-motion-tabs');
        if (getComputedStyle(nav).position === 'static') nav.style.position = 'relative';
      }
      let indicator = nav.querySelector('.fm-tab-indicator');
      const first = !indicator;
      if (first) {
        indicator = document.createElement('span');
        indicator.className = 'fm-tab-indicator fm-snap';
        indicator.setAttribute('aria-hidden', 'true'); nav.prepend(indicator);
      }
      indicator.style.width = active.offsetWidth + 'px';
      indicator.style.height = active.offsetHeight + 'px';
      indicator.style.transform = `translate3d(${active.offsetLeft}px,${active.offsetTop}px,0)`;
      if (first) requestAnimationFrame(() => requestAnimationFrame(() => indicator.classList.remove('fm-snap')));
    });
  };
  const schedule = () => { if (!scheduled) { scheduled = true; requestAnimationFrame(update); } };
  new MutationObserver(schedule).observe(document.body, {childList:true, subtree:true, attributes:true, attributeFilter:['class']});
  new ResizeObserver(schedule).observe(document.documentElement);
  document.addEventListener('focusin', schedule);
  document.addEventListener('focusout', schedule);
  document.fonts?.ready.then(schedule);
  update();
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
else boot();
