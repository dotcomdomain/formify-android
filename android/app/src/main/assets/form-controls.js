(() => {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let current = null, serial = 0;
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const icon = path => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '20'); svg.setAttribute('height', '20');
    svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round'); svg.setAttribute('aria-hidden', 'true');
    const line = document.createElementNS(svg.namespaceURI, 'path'); line.setAttribute('d', path); svg.append(line);
    return svg;
  };
  const close = (immediate = false, restoreFocus = true) => {
    if (!current) return false;
    const state = current;
    if (state.closing) return true;
    state.closing = true;
    state.select.setAttribute('aria-expanded', 'false');
    const finish = () => {
      if (state.dialog.open) state.dialog.close();
      state.dialog.remove();
      document.documentElement.style.overflow = state.overflow;
      if (current === state) current = null;
      if (restoreFocus && state.select.isConnected) state.select.focus({preventScroll:true});
    };
    if (immediate || reducedMotion.matches) finish();
    else { state.dialog.classList.add('fm-closing'); setTimeout(finish, 145); }
    return true;
  };
  const open = (select, invalid = false) => {
    if (!select.isConnected || select.matches(':disabled')) return;
    if (current?.select === select) return;
    if (current && invalid) return;
    close(true, false);
    // Blur the editor before opening so the IME does not cover the options.
    document.activeElement?.blur();
    window.FormifyNative?.postMessage(JSON.stringify({type:'picker', open:true}));
    const dialog = element('dialog', 'fm-picker');
    const head = element('div', 'fm-picker-head'), top = element('div', 'fm-picker-top');
    const label = Array.from(select.labels || []).map(label => label.textContent.trim()).filter(Boolean).join(' ')
      || select.getAttribute('aria-label') || select.getAttribute('title') || 'Choose an option';
    const title = element('h2', '', label); title.id = 'fm-picker-title-' + ++serial;
    dialog.setAttribute('aria-labelledby', title.id); dialog.setAttribute('aria-modal', 'true');
    const dismiss = element('button', 'fm-picker-close'); dismiss.type = 'button'; dismiss.setAttribute('aria-label', 'Close options');
    dismiss.append(icon('m6 6 12 12 M18 6 6 18')); dismiss.onclick = () => close();
    top.append(title, dismiss); head.append(top);
    const note = element('p', 'fm-picker-note' + (invalid ? ' fm-invalid' : ''),
      invalid ? select.validationMessage : select.multiple ? 'Select any that apply, then tap Done.' : 'Choose one option.');
    note.id = 'fm-picker-note-' + serial; head.append(note); dialog.setAttribute('aria-describedby', note.id);
    const list = element('div', 'fm-picker-list'); list.setAttribute('role', 'listbox'); list.setAttribute('aria-labelledby', title.id);
    if (select.multiple) list.setAttribute('aria-multiselectable', 'true');
    const pending = new Set(Array.from(select.options).filter(option => option.selected).map(option => option.index));
    const state = {select, dialog, pending, closing:false, rows:[], overflow:document.documentElement.style.overflow};
    current = state;
    const commit = () => {
      if (state.closing || !select.isConnected || select.matches(':disabled')) return close();
      const before = Array.from(select.options).map(option => option.selected).join(',');
      for (const option of select.options) option.selected = pending.has(option.index);
      if (select.validity.valid) select.removeAttribute('aria-invalid');
      if (before !== Array.from(select.options).map(option => option.selected).join(',')) {
        select.dispatchEvent(new Event('input', {bubbles:true}));
        select.dispatchEvent(new Event('change', {bubbles:true}));
      }
      close();
    };
    let group = null;
    for (const option of select.options) {
      const parent = option.parentElement;
      if (parent?.tagName === 'OPTGROUP' && parent !== group) {
        group = parent; list.append(element('div', 'fm-picker-group', parent.label));
      } else if (parent?.tagName !== 'OPTGROUP') group = null;
      const row = element('button', 'fm-picker-option'); row.type = 'button'; row.tabIndex = -1;
      row.setAttribute('role', 'option'); row.setAttribute('aria-selected', String(option.selected));
      row.disabled = option.disabled || (parent?.tagName === 'OPTGROUP' && parent.disabled)
        || (select.required && option.value === '');
      row.dataset.optionIndex = String(option.index);
      const tick = element('span', 'fm-picker-tick'); tick.append(icon('m5 12 4 4 10-10'));
      row.append(element('span', '', option.label), tick);
      row.onclick = () => {
        if (state.closing || row.disabled) return;
        if (select.multiple) {
          pending.has(option.index) ? pending.delete(option.index) : pending.add(option.index);
          row.setAttribute('aria-selected', String(pending.has(option.index)));
        } else {
          pending.clear(); pending.add(option.index);
          for (const item of state.rows) item.setAttribute('aria-selected', String(item === row));
          commit();
        }
      };
      state.rows.push(row); list.append(row);
    }
    if (select.options.length >= 8) {
      const search = element('input', 'fm-picker-search'); search.type = 'search';
      search.placeholder = 'Find an option'; search.setAttribute('aria-label', 'Find an option');
      const empty = element('p', 'fm-picker-empty', 'No matching options'); empty.hidden = true;
      search.oninput = () => {
        const query = search.value.trim().toLocaleLowerCase();
        for (const row of state.rows) row.hidden = !row.textContent.toLocaleLowerCase().includes(query);
        list.querySelectorAll('.fm-picker-group').forEach(heading => { heading.hidden = !!query; });
        empty.hidden = state.rows.some(row => !row.hidden); updateRovingFocus();
      };
      head.append(search); list.append(empty);
    }
    const enabledRows = () => state.rows.filter(row => !row.disabled && !row.hidden);
    const updateRovingFocus = target => {
      const enabled = enabledRows();
      target ||= enabled.find(row => row.getAttribute('aria-selected') === 'true') || enabled[0];
      for (const row of state.rows) row.tabIndex = row === target ? 0 : -1;
      return target;
    };
    dialog.append(head, list);
    if (select.multiple) {
      const footer = element('div', 'fm-picker-footer'), done = element('button', 'fm-picker-done', 'Done');
      done.type = 'button'; done.onclick = commit; footer.append(done); dialog.append(footer);
    }
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    // A dialog backdrop delivers clicks to the dialog, not a separate HTML element.
    let outsideDown = false;
    const outside = event => { const r = dialog.getBoundingClientRect(); return event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom; };
    dialog.addEventListener('pointerdown', event => { outsideDown = event.target === dialog && outside(event); });
    dialog.addEventListener('click', event => { if (outsideDown && event.target === dialog && outside(event)) close(); });
    let prefix = '', typedAt = 0;
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      if (['Enter', ' '].includes(event.key) && event.target.matches('.fm-picker-option')) {
        event.preventDefault(); event.target.click(); return;
      }
      if (event.target instanceof HTMLInputElement && event.key !== 'ArrowDown') return;
      const enabled = enabledRows(); if (!enabled.length) return;
      let index = enabled.indexOf(document.activeElement), target;
      if (event.key === 'ArrowDown') target = enabled[(index + 1) % enabled.length];
      else if (event.key === 'ArrowUp') target = enabled[(index - 1 + enabled.length) % enabled.length];
      else if (event.key === 'Home') target = enabled[0];
      else if (event.key === 'End') target = enabled.at(-1);
      else if (event.key.length === 1 && /\S/.test(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const now = performance.now(); prefix = now - typedAt < 700 ? prefix + event.key : event.key; typedAt = now;
        target = enabled.find(row => row.textContent.trim().toLocaleLowerCase().startsWith(prefix.toLocaleLowerCase()));
      }
      if (target) { event.preventDefault(); updateRovingFocus(target); target.focus({preventScroll:true}); target.scrollIntoView({block:'nearest'}); }
    });
    document.body.append(dialog);
    document.documentElement.style.overflow = 'hidden';
    select.setAttribute('aria-haspopup', 'dialog'); select.setAttribute('aria-expanded', 'true');
    dialog.showModal();
    const selected = updateRovingFocus();
    (selected || dismiss).focus({preventScroll:true});
    selected?.scrollIntoView({block:'nearest'});
  };
  // Prevent the select's default popup before WebView can open Android's selector.
  document.addEventListener('pointerdown', event => {
    const select = event.target.closest('select');
    if (!select || select.matches(':disabled') || !event.isPrimary || event.button !== 0) return;
    event.preventDefault(); open(select);
  }, {capture:true, passive:false});
  document.addEventListener('click', event => {
    const select = event.target.closest('select'); if (!select || select.matches(':disabled')) return;
    event.preventDefault(); open(select);
  }, true);
  document.addEventListener('keydown', event => {
    if (event.target instanceof HTMLSelectElement && [' ', 'Enter', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); open(event.target);
    }
  }, true);
  document.addEventListener('invalid', event => {
    if (!(event.target instanceof HTMLSelectElement)) return;
    event.preventDefault(); event.target.setAttribute('aria-invalid', 'true'); open(event.target, true);
  }, true);
  window.addEventListener('hashchange', () => close(true, false));
  window.addEventListener('pagehide', () => close(true, false));
  new MutationObserver(() => {
    if (current && !current.select.isConnected) close(true, false);
  }).observe(document, {childList:true, subtree:true});
  // Leave native form values and validation intact; Android Back only dismisses the sheet.
  window.FormifyUI = Object.freeze({dismissPicker: () => close(), pickerOpen: () => !!current});
})();
