const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const clone = (value) => structuredClone(value);
const storageKey = 're-desktop/about-icon/draft-v1';
const sourceStorageKey = storageKey + '/json';
const names = ['Magenta', 'Yellow', 'Cyan'];
const descriptions = ['Halftone disc', 'Striped disc', 'Soft radial disc'];
const state = {
  settings: null, defaults: null, selected: 0, visible: [true, true, true],
  revision: 0, valid: false, result: null, zoom: 1, pan: [0, 0],
  history: [], position: -1, sourceDirty: false, busyExport: false, error: null,
};
let renderTimer, historyTimer, rendering = false, pendingRender = false;
let requestQueue = Promise.resolve();
let storageAvailable = true;

function get(path) { return path.split('.').reduce((value, key) => value?.[key], state.settings); }
function set(path, value) {
  const keys = path.split('.');
  const key = keys.pop();
  keys.reduce((parent, part) => parent[part], state.settings)[key] = value;
}
function settingsFile(settings = state.settings) { return { formatVersion: 1, settings }; }
function json(settings = state.settings) { return JSON.stringify(settingsFile(settings), null, 2) + '\n'; }
function action(message, error = false) {
  $('#action-status').textContent = message;
  $('#action-status').classList.toggle('error', error);
}
function updateButtons() {
  const pendingEdit = state.settings && JSON.stringify(state.settings) !== state.history[state.position];
  $('#undo').disabled = state.position <= 0 && !pendingEdit;
  $('#redo').disabled = Boolean(pendingEdit) || state.position >= state.history.length - 1;
  for (const id of ['copy', 'export', 'pin', 'download']) $(`#${id}`).disabled = !state.valid || state.busyExport;
}
function saveDraft() {
  try { localStorage.setItem(storageKey, json()); }
  catch { storageAvailable = false; }
  const changed = JSON.stringify(state.settings) !== JSON.stringify(state.defaults);
  $('#draft-status').textContent = changed
    ? storageAvailable ? 'Draft saved in this browser' : 'Draft in memory · export to keep it'
    : 'Starting values';
}
function saveSourceDraft(value) {
  try {
    if (value === null) localStorage.removeItem(sourceStorageKey);
    else localStorage.setItem(sourceStorageKey, value);
  } catch { storageAvailable = false; }
}
function commitHistory() {
  clearTimeout(historyTimer);
  const value = JSON.stringify(state.settings);
  if (value !== state.history[state.position]) {
    state.history.splice(state.position + 1);
    state.history.push(value);
    state.position = state.history.length - 1;
  }
  updateButtons();
}
function changed() {
  state.valid = false;
  state.revision++;
  updateButtons();
  saveDraft();
  if (!state.sourceDirty) $('#settings-json').value = json();
  clearTimeout(historyTimer);
  historyTimer = setTimeout(commitHistory, 350);
  $('#render-status').textContent = 'Updating preview…';
  $('#render-status').classList.remove('error');
  $('#preview-caption').textContent = 'Current draft · updating';
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderLatest, 140);
}

function apiRender(settings, size = 512, visible = [true, true, true]) {
  const task = requestQueue.then(async () => {
    const response = await fetch('/api/render', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings, size, visible }),
    });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error), { field: result.field });
    return result;
  });
  requestQueue = task.catch(() => {});
  return task;
}

function showError(error) {
  state.error = error;
  $('#render-status').textContent = `Preview could not update. ${error.message}`;
  $('#render-status').classList.add('error');
  $('#preview-caption').textContent = 'Last valid preview';
  $('#field-error').hidden = false;
  $('#field-error').textContent = error.message;
  $('#retry').hidden = false;
  $$('[data-path]').forEach((input) => {
    const affected = error.field && (input.dataset.path === error.field || input.dataset.path.startsWith(error.field + '.'));
    input.setAttribute('aria-invalid', affected ? 'true' : 'false');
  });
}
async function renderLatest() {
  pendingRender = true;
  if (rendering || !state.settings) return;
  rendering = true;
  try {
    while (pendingRender) {
      pendingRender = false;
      const revision = state.revision;
      try {
        const result = await apiRender(clone(state.settings), 512, [...state.visible]);
        if (revision !== state.revision) continue;
        state.result = result;
        state.valid = true;
        state.error = null;
        $('#preview-image').src = result.png;
        $$('[data-size]').forEach((image) => { image.src = result.png; });
        $('#preview-caption').textContent = 'Current draft';
        $('#render-status').textContent = `Preview ready · Python PNG · ${result.duration_ms} ms`;
        $('#render-status').classList.remove('error');
        $('#field-error').hidden = true;
        $('#retry').hidden = true;
        $$('[data-path]').forEach((input) => input.removeAttribute('aria-invalid'));
        drawGuides(result);
        updateGeometry(result);
      } catch (error) {
        if (revision === state.revision) showError(error);
      }
      updateButtons();
    }
  } finally { rendering = false; }
}

function numberField(path, label, min, max, step = 1, unit = 'u', hint = '', factor = 1) {
  const id = 'field-' + path.replaceAll('.', '-');
  const value = get(path) == null ? '' : +(get(path) * factor).toFixed(6);
  const field = document.createElement('div');
  field.className = 'field';
  field.innerHTML = `<label for="${id}">${label}</label><div class="field-row"><input type="range" min="${min}" max="${max}" step="${step}" aria-label="${label} slider"><input id="${id}" type="number" min="${min}" max="${max}" step="${step}" data-path="${path}"><span class="unit">${unit}</span></div>`;
  const [range, input] = field.querySelectorAll('input');
  range.value = value;
  input.value = value;
  if (hint) {
    const help = document.createElement('p');
    help.className = 'caption'; help.id = id + '-hint'; help.textContent = hint;
    field.append(help); input.setAttribute('aria-describedby', help.id);
  }
  for (const control of [range, input]) control.addEventListener('input', () => {
    const raw = control.value;
    if (control === range) input.value = raw;
    else range.value = raw;
    set(path, raw === '' || !Number.isFinite(Number(raw)) ? null : Number(raw) / factor);
    changed();
  });
  $('#controls').append(field);
}
function colorField(path, label) {
  const id = 'field-' + path.replaceAll('.', '-');
  const field = document.createElement('div'); field.className = 'field';
  field.innerHTML = `<label for="${id}">${label}</label><div class="field-row"><input type="color" aria-label="${label} picker"><input id="${id}" type="text" data-path="${path}" spellcheck="false" maxlength="7" placeholder="#FFFFFF"></div>`;
  const [picker, input] = field.querySelectorAll('input');
  input.value = get(path);
  if (/^#[\da-f]{6}$/i.test(get(path))) picker.value = get(path);
  for (const control of [picker, input]) control.addEventListener('input', () => {
    set(path, control.value);
    if (control === picker) input.value = control.value.toUpperCase();
    else if (/^#[\da-f]{6}$/i.test(input.value)) picker.value = input.value;
    changed();
  });
  $('#controls').append(field);
}
function buildControls() {
  $('#controls').replaceChildren();
  $('#field-error').hidden = true;
  const layer = state.selected;
  $$('[data-layer]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.layer === String(layer))));
  $('#isolate').disabled = layer === 'canvas';
  $('#isolate').textContent = state.visible.filter(Boolean).length === 1 && state.visible[layer] ? 'Show all layers' : 'Isolate selected layer';
  $('#controls-title').textContent = layer === 'canvas' ? 'Canvas' : names[layer];
  $('#controls-description').textContent = layer === 'canvas' ? 'Background and ink blending' : descriptions[layer];
  $('#layer-badge').textContent = layer === 'canvas' ? 'Whole mark' : `Layer ${layer + 1}`;
  if (layer === 'canvas') {
    numberField('canvas_units', 'Canvas size', 8, 128, 1, 'u', 'The largest disc stays centered on this square.');
    colorField('background', 'Background');
    const field = document.createElement('div'); field.className = 'field';
    field.innerHTML = '<label for="blend">Ink blending</label><select id="blend"><option value="multiply">Multiply</option><option value="normal">Normal</option></select><p class="caption">Multiply makes cyan over yellow appear green.</p>';
    field.querySelector('select').value = state.settings.blend;
    field.querySelector('select').addEventListener('change', (event) => { state.settings.blend = event.target.value; changed(); });
    $('#controls').append(field);
    if (state.error) showError(state.error);
    return;
  }
  numberField(`diameters.${layer}`, 'Diameter', 1, 64, .5);
  if (layer > 0) numberField(`bottom_gaps.${layer - 1}`, 'Bottom inset', 0, 30, .5, 'u', `From ${names[layer - 1].toLowerCase()}’s bottom edge to this disc’s bottom edge. Smaller values move this disc down.`);
  numberField(`opacities.${layer}`, 'Opacity', 0, 100, 1, '%', '', 100);
  colorField(`colors.${layer}`, 'Ink color');
  if (layer === 0) {
    numberField('dot_diameter', 'Dot diameter', .1, 20, .1);
    numberField('dot_gap', 'Clear gap between dots', 0, 24, .5, 'u', 'Dot pitch equals diameter plus clear gap.');
    numberField('dot_angle', 'Grid angle', -180, 180, 1, '°');
    numberField('dot_phase.0', 'Pattern offset X', -20, 20, .5);
    numberField('dot_phase.1', 'Pattern offset Y', -20, 20, .5);
  } else if (layer === 1) {
    numberField('stripe_width', 'Stripe width', .1, 24, .1);
    numberField('stripe_gap', 'Clear gap between stripes', 0, 24, .5);
    numberField('stripe_angle', 'Stripe angle', -180, 180, 1, '°');
    numberField('stripe_phase', 'Pattern offset', -24, 24, .5);
  } else {
    numberField('cyan_core', 'Solid core radius', 0, 99, 1, '%', 'Full ink coverage inside this radius; a smooth fade continues to the edge.', 100);
  }
  if (state.error) showError(state.error);
}
function updateGeometry(result) {
  const [, middle, inner] = result.geometry;
  const dy = inner.center[1] - middle.center[1];
  $('#geometry-summary').textContent = `Centers: ${result.geometry.map((circle) => `(${circle.center.map((v) => +v.toFixed(2)).join(', ')})`).join(' · ')}. Cyan is ${Math.abs(+dy.toFixed(2))} u ${dy < 0 ? 'above' : dy > 0 ? 'below' : 'from'} yellow’s center.`;
}
function drawGuides(result = state.result) {
  if (!result) return;
  const svg = $('#construction');
  const size = result.settings.canvas_units;
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.replaceChildren();
  const element = (name, attrs, text) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    if (text != null) node.textContent = text;
    return node;
  };
  if ($('#grid').checked) {
    const pattern = element('pattern', { id: 'unit-grid', width: 4, height: 4, patternUnits: 'userSpaceOnUse' });
    pattern.append(element('path', { d: 'M 4 0 H 0 V 4', fill: 'none', stroke: '#64718a', 'stroke-width': .1, opacity: .35 }));
    const defs = element('defs', {}); defs.append(pattern); svg.append(defs, element('rect', { width: size, height: size, fill: 'url(#unit-grid)' }));
  }
  if (!$('#guides').checked) return;
  for (const [index, circle] of result.geometry.entries()) {
    const [x, y] = circle.center;
    svg.append(element('circle', { cx: x, cy: y, r: circle.diameter / 2, fill: 'none', stroke: ['#ab168c', '#8a7100', '#007f89'][index], 'stroke-width': .12, 'stroke-dasharray': '.6 .5' }));
    svg.append(element('path', { d: `M ${x - .7} ${y} h 1.4 M ${x} ${y - .7} v 1.4`, stroke: '#17233b', 'stroke-width': .13 }));
  }
  for (let index = 1; index < 3; index++) {
    const parent = result.geometry[index - 1], child = result.geometry[index];
    const bottom = parent.center[1] + parent.diameter / 2, top = child.center[1] + child.diameter / 2;
    const x = size / 2 + (index === 1 ? 2 : -2);
    svg.append(element('path', { d: `M ${x - .6} ${top} h 1.2 M ${x} ${top} V ${bottom} M ${x - .6} ${bottom} h 1.2`, stroke: '#285de0', 'stroke-width': .15 }));
    svg.append(element('text', { x: x + .8, y: (top + bottom) / 2, fill: '#285de0', 'font-size': 1.5, 'font-family': 'sans-serif' }, result.settings.bottom_gaps[index - 1]));
  }
}
function updateVisibility() {
  $$('[data-visible]').forEach((input) => { input.checked = state.visible[Number(input.dataset.visible)]; });
  const count = state.visible.filter(Boolean).length;
  $('#visibility-note').textContent = count === 3 ? 'All layers visible.' : `${count} of 3 layers visible. Visibility affects the preview only.`;
  buildControls();
  changed();
}
function transform() {
  $('#artboard').style.transform = `translate(${state.pan[0]}px, ${state.pan[1]}px) scale(${state.zoom})`;
  $('#zoom-label').textContent = `${Math.round(state.zoom * 100)}%`;
  $('#stage').classList.toggle('is-zoomed', state.zoom > 1);
  $('#zoom-out').disabled = state.zoom <= .5;
  $('#zoom-in').disabled = state.zoom >= 4;
}
function zoom(value) { state.zoom = Math.min(4, Math.max(.5, value)); if (state.zoom <= 1) state.pan = [0, 0]; transform(); }
function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function loadSettings(payload, label) {
  try {
    action(`Checking ${label}…`);
    const result = await apiRender(payload);
    commitHistory();
    state.settings = clone(result.settings);
    state.sourceDirty = false;
    saveSourceDraft(null);
    $('#source-status').textContent = '';
    buildControls(); changed(); commitHistory();
    action(`${label} loaded into this draft.`);
  } catch (error) {
    action(`${label} could not load. ${error.message} The current draft is preserved.`, true);
  }
}

$$('[data-layer]').forEach((button) => button.addEventListener('click', () => {
  if (!state.settings) return;
  state.selected = button.dataset.layer === 'canvas' ? 'canvas' : Number(button.dataset.layer);
  buildControls();
}));
$$('[data-visible]').forEach((input) => input.addEventListener('change', () => {
  if (!state.settings) return;
  state.visible[Number(input.dataset.visible)] = input.checked; updateVisibility();
}));
$('#isolate').addEventListener('click', () => {
  if (!state.settings || state.selected === 'canvas') return;
  state.visible = state.visible.filter(Boolean).length === 1 && state.visible[state.selected]
    ? [true, true, true] : [0, 1, 2].map((index) => index === state.selected);
  updateVisibility();
});
for (const id of ['undo', 'redo']) $(`#${id}`).addEventListener('click', () => {
  commitHistory();
  state.position += id === 'undo' ? -1 : 1;
  state.settings = JSON.parse(state.history[state.position]);
  buildControls(); changed(); updateButtons();
});
$('#reset').addEventListener('click', () => {
  commitHistory(); state.settings = clone(state.defaults); state.sourceDirty = false;
  saveSourceDraft(null);
  $('#source-status').textContent = ''; buildControls(); changed(); commitHistory();
  action('Starting values restored. Undo restores your previous draft.');
});
$('#import').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', async (event) => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 32768) throw new Error('Choose a settings file under 32 KiB.');
    await loadSettings(JSON.parse(await file.text()), 'Settings file');
  } catch (error) { action(`Settings file could not load. ${error.message}`, true); }
  event.target.value = '';
});
$('#settings-json').addEventListener('input', () => {
  state.sourceDirty = true;
  saveSourceDraft($('#settings-json').value);
  $('#source-status').textContent = storageAvailable ? 'JSON draft saved. Load it to update the preview.' : 'JSON has edits in memory. Load it to update the preview.';
});
$('#load-json').addEventListener('click', () => {
  try { void loadSettings(JSON.parse($('#settings-json').value), 'JSON settings'); }
  catch (error) { action(`JSON settings could not load. ${error.message}`, true); }
});
$('#export').addEventListener('click', () => {
  download(new Blob([json(state.result.settings)], { type: 'application/json' }), 're-desktop-about.settings.json');
  action('Settings exported. Share the JSON file or copy its values here.');
});
$('#copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(json(state.result.settings)); action('Settings copied. Paste them here to share your preferred values.'); }
  catch {
    if (state.sourceDirty) {
      action('Clipboard access was unavailable. Use Export settings to save the current design. Your JSON edits are preserved.', true);
      return;
    }
    state.sourceDirty = false; $('#settings-json').value = json(state.result.settings);
    $('.source-panel').open = true; $('#settings-json').focus(); $('#settings-json').select();
    action('Clipboard access was unavailable. The settings are selected below; copy them with your keyboard.', true);
  }
});
$('#download').addEventListener('click', async () => {
  state.busyExport = true; updateButtons();
  try {
    const size = Number($('#png-size').value);
    action(`Rendering ${size} px PNG with all three layers…`);
    const result = await apiRender(clone(state.result.settings), size);
    const bytes = Uint8Array.from(atob(result.png.split(',')[1]), (character) => character.charCodeAt(0));
    download(new Blob([bytes], { type: 'image/png' }), `re-desktop-about-${size}.png`);
    action(`${size} px PNG exported with all three layers.`);
  } catch (error) { action(`PNG could not export. ${error.message}`, true); }
  finally { state.busyExport = false; updateButtons(); }
});
$$('[data-view]').forEach((button) => button.addEventListener('click', () => {
  const compare = button.dataset.view === 'compare';
  $$('[data-view]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
  $('#comparison').classList.toggle('is-comparing', compare);
  $('#reference-figure').hidden = !compare; $('#reference-actions').hidden = !compare;
  state.pan = [0, 0]; zoom(1);
}));
$('#pin').addEventListener('click', () => {
  $('#reference-image').src = state.result.png;
  $('#reference-caption').textContent = 'Pinned preview';
  action('Current preview pinned for comparison. Layer visibility is included in this reference.');
});
let startingReference;
$('#restore-reference').addEventListener('click', () => { $('#reference-image').src = startingReference; $('#reference-caption').textContent = 'Starting design'; });
for (const id of ['guides', 'grid']) $(`#${id}`).addEventListener('change', () => drawGuides());
$('#zoom-in').addEventListener('click', () => zoom(state.zoom * 1.25));
$('#zoom-out').addEventListener('click', () => zoom(state.zoom / 1.25));
$('#fit').addEventListener('click', () => { state.pan = [0, 0]; zoom(1); });
$('#retry').addEventListener('click', () => { state.revision++; void renderLatest(); });
let drag;
$('#stage').addEventListener('pointerdown', (event) => {
  if (state.zoom <= 1 || event.button !== 0) return;
  drag = [event.clientX, event.clientY, ...state.pan];
  event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.classList.add('is-panning');
});
$('#stage').addEventListener('pointermove', (event) => {
  if (!drag) return;
  state.pan = [drag[2] + event.clientX - drag[0], drag[3] + event.clientY - drag[1]]; transform();
});
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) $('#stage').addEventListener(name, () => { drag = null; $('#stage').classList.remove('is-panning'); });
document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !event.target.closest('input, textarea, select')) {
    const button = event.shiftKey ? $('#redo') : $('#undo');
    if (!button.disabled) { event.preventDefault(); button.click(); }
  }
});

async function start() {
  try {
    const response = await fetch('/api/state');
    if (!response.ok) throw new Error('Settings could not be read.');
    const initial = await response.json();
    state.defaults = clone(initial.settings); state.settings = clone(initial.settings);
    state.history = [JSON.stringify(state.settings)]; state.position = 0;
    startingReference = initial.reference;
    $('#reference-image').src = initial.reference; $('#preview-image').src = initial.reference;
    let saved;
    try { saved = localStorage.getItem(storageKey); } catch { storageAvailable = false; }
    if (saved) {
      try {
        const restored = await apiRender(JSON.parse(saved));
        state.settings = restored.settings; commitHistory();
      } catch (error) {
        $('#settings-json').value = saved; state.sourceDirty = true; $('.source-panel').open = true;
        saveSourceDraft(saved);
        action(`Saved draft could not load. ${error.message} Its JSON is preserved below.`, true);
      }
    }
    try {
      const sourceDraft = localStorage.getItem(sourceStorageKey);
      if (sourceDraft !== null) {
        $('#settings-json').value = sourceDraft; state.sourceDirty = true; $('.source-panel').open = true;
        $('#source-status').textContent = 'JSON draft restored. Load it to update the preview.';
      }
    } catch { storageAvailable = false; }
    for (const id of ['reset', 'import', 'load-json']) $(`#${id}`).disabled = false;
    buildControls(); changed();
  } catch (error) {
    $('#render-status').textContent = `Workbench could not connect. ${error.message} Check that npm run icon:workbench is running, then reload.`;
    $('#render-status').classList.add('error');
  }
}
void start();
