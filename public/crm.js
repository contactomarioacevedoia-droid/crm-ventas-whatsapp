const by = selector => document.querySelector(selector);
const board = by('#board');
const drawer = by('#drawer');
const reply = by('#reply');
const quote = by('#quote');
const visit = by('#visit');
const money = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' });
const moment = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', dateStyle: 'short', timeStyle: 'short' });
const dayKey = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Santiago', dateStyle: 'short' });
const longDate = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', dateStyle: 'full' });
const weekday = new Intl.DateTimeFormat('es-CL', { timeZone: 'UTC', weekday: 'short' });
const chile = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
let state;
let selected = null;
let linkedStatus='';
let playback = null;
let pendingRefresh;
let configReady = false;
const svgNS = 'http://www.w3.org/2000/svg';
const viewLinks = [...document.querySelectorAll('[data-view-link]')];
const views = [...document.querySelectorAll('[data-view]')];
const viewNames = viewLinks.map(link => link.dataset.viewLink);
const configLinks = [...document.querySelectorAll('[data-settings-link]')];
const configPanels = [...document.querySelectorAll('[data-settings-panel]')];
const drawerLinks = [...document.querySelectorAll('[data-drawer-link]')];
const drawerPanels = [...document.querySelectorAll('[data-drawer-panel]')];
const lossForm = by('#loss-form');
const upload = by('#logo-file');
let preparedLogo;
const bookedTimes = Array.from({ length: 16 }, (_, index) =>
  `${String(10 + Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}`);
visit.elements.time.replaceChildren(new Option('Elige una hora', ''), ...bookedTimes.map(time => new Option(time, time)));

function element(tag, value, className) {
  const node = document.createElement(tag);
  if (value !== undefined) node.textContent = value;
  if (className) node.className = className;
  return node;
}

function svgNode(tag, attributes) {
  const node = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

function icon(name) {
  const svg = svgNode('svg', { 'aria-hidden': 'true' });
  svg.append(svgNode('use', { href: `#i-${name}` }));
  return svg;
}

async function api(path, body) {
  const response = await fetch(path, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
}

function activeView() {
  const hash = location.hash.slice(1);
  return viewNames.includes(hash) ? hash : 'resumen';
}

function selectView(event) {
  const selectedView = activeView();
  for (const view of views) view.hidden = view.dataset.view !== selectedView;
  for (const link of viewLinks) {
    if (link.dataset.viewLink === selectedView) {
      link.setAttribute('aria-current', 'page');
      by('#top-view').textContent = link.getAttribute('aria-label');
    } else link.removeAttribute('aria-current');
  }
  by('#app-status').textContent = '';
  if (state) renderCurrentView();
  if (event) {
    const heading = views.find(view => !view.hidden).querySelector('h1');
    heading.tabIndex = -1;
    heading.focus();
  }
}

function renderCurrentView() {
  by('#store').textContent = state.config.store;
  const mark = by('.workspace-mark');
  mark.textContent = Array.from(state.config.store)[0].toLocaleUpperCase('es-CL');
  if (state.config.logo) {
    const picture = new Image();
    picture.alt = '';
    picture.src = state.config.logo;
    mark.replaceChildren(picture);
  }
  if (state.scenario) {
    by('#demo-link').href = '/';
    by('#demo-link').firstChild.textContent = 'Probar una consulta en la tienda ';
  }
  document.title = `${state.config.store} · CRM de ventas`;
  renderConnection();
  const pending = state.leads.filter(lead => lead.stage === 'Nueva').length;
  by('#inbox-count').textContent = pending;
  by('#inbox-count').hidden = pending === 0;
  const attention = state.leads.filter(lead => lead.attention_reason).length;
  by('#attention-count').textContent = attention;
  by('#attention-count').hidden = attention === 0;
  switch (activeView()) {
    case 'te-toca': renderAttention('#attention-list'); break;
    case 'oportunidades': renderBoard(); break;
    case 'bandeja': renderInbox(); break;
    case 'agenda': renderAgenda(); break;
    case 'configuracion': renderSettings(); break;
    default: renderDashboard();
  }
}

function renderDashboard() {
  const won = state.leads.filter(lead => lead.stage === 'Ganada');
  const active = state.leads.filter(lead => !['Ganada', 'Perdida'].includes(lead.stage));
  const amount = active.reduce((sum, lead) => sum + (lead.unit_price ?? 0) * (lead.quantity ?? 0), 0);
  const wonAmount = won.reduce((sum, lead) => sum + (lead.unit_price ?? 0) * (lead.quantity ?? 0), 0);
  by('#dashboard-date').textContent = longDate.format(new Date());
  by('#metrics').replaceChildren(...[
    ['Consultas', state.leads.length, 'chat', '', 'Contactos registrados'],
    ['Oportunidades activas', active.length, 'board', 'cyan', 'Ventas aún abiertas'],
    ['Cotizaciones abiertas', money.format(amount), 'trend', 'amber', 'Total cotizado en ventas aún abiertas'],
    ['Ventas ganadas', money.format(wonAmount), 'check', 'green', `${won.length} ${won.length === 1 ? 'venta cerrada' : 'ventas cerradas'} · monto registrado`],
  ].map(([label, number, iconName, tone, detail]) => {
    const metric = element('article', undefined, 'metric');
    const top = element('div', undefined, 'metric-top');
    const tile = element('span', undefined, `tile-icon ${tone}`);
    tile.append(icon(iconName));
    top.append(tile, element('span', label));
    metric.append(top, element('strong', number), element('small', detail, 'metric-detail'));
    return metric;
  }));
  renderActivity();
  const counts = new Map(state.stages.map(stage => [stage, 0]));
  for (const lead of state.leads) if (counts.has(lead.stage)) counts.set(lead.stage, counts.get(lead.stage) + 1);
  by('#distribution').replaceChildren(...[...counts].map(([stage, count], index) => {
    const row = element('div', undefined, `distribution-row tone-${index}`);
    const meter = element('meter');
    meter.max = Math.max(1, state.leads.length);
    meter.value = count;
    meter.setAttribute('aria-hidden', 'true');
    row.append(element('span', stage), meter, element('strong', count));
    return row;
  }));
  showRecords('#recent', state.leads.slice(0, 4), 'Las nuevas consultas aparecerán aquí.');
  by('#attention-preview').hidden = !state.leads.some(lead => lead.attention_reason);
  renderAttention('#attention-recent', 2);
}

function renderAttention(selector, limit = state.leads.length) {
  showRecords(selector, state.leads.filter(lead => lead.attention_reason).slice(0, limit), 'No hay clientes esperando atención.', 'attention');
}

function renderActivity() {
  const today = Date.parse(`${dayKey.format(new Date())}T12:00:00Z`);
  const dates = Array.from({ length: 14 }, (_, index) => new Date(today - (13 - index) * 86_400_000));
  const points = new Map(dates.map(date => [date.toISOString().slice(0, 10), 0]));
  for (const lead of state.leads) {
    const key = dayKey.format(new Date(lead.created));
    if (points.has(key)) points.set(key, points.get(key) + 1);
  }
  const values = [...points.values()];
  const max = Math.max(1, ...values);
  by('#weekly-total').textContent = values.reduce((total, value) => total + value, 0);
  const chart = svgNode('svg', { class: 'bar-chart', viewBox: '0 0 560 100', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
  for (const y of [5, 35, 65, 95]) chart.append(svgNode('line', { class: 'chart-line', x1: 0, x2: 560, y1: y, y2: y }));
  const labels = element('ol', undefined, 'chart-days');
  values.forEach((value, index) => {
    const height = value / max * 88;
    if (height) chart.append(svgNode('rect', { class: `chart-bar${index === 13 ? ' today' : ''}`, x: index * 40 + 9, y: 95 - height, width: 22, height, rx: 3 }));
    const day = element('li');
    const label = `${weekday.format(dates[index])} ${dates[index].getUTCDate()}`;
    day.title = `${label}: ${value} consultas`;
    day.append(element('strong', value), element('span', dates[index].getUTCDate()));
    labels.append(day);
  });
  by('#chart').replaceChildren(chart, labels);
}

function matchingLeads(searchField) {
  const query = by(searchField).value.toLocaleLowerCase('es-CL').trim();
  return state.leads.filter(lead => [lead.name, lead.phone, lead.last].join(' ').toLocaleLowerCase('es-CL').includes(query));
}

function contactButton(lead, className) {
  const button = element('button', undefined, className);
  button.type = 'button';
  button.addEventListener('click', () => showLead(lead.id).catch(error => {
    (drawer.open ? by('#drawer-status') : by('#app-status')).textContent = error.message;
  }));
  return button;
}

function showRecords(selector, leads, emptyMessage, mode) {
  const target = by(selector);
  if (!leads.length) {
    target.replaceChildren(element('p', emptyMessage, 'empty'));
    return;
  }
  target.replaceChildren(...leads.map(lead => {
    const row = contactButton(lead, 'record');
    const initials = lead.name.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join('').toLocaleUpperCase('es-CL');
    const copy = element('span', undefined, 'record-copy');
    const detail = mode === 'agenda' ? moment.format(new Date(lead.visit))
      : mode === 'attention' ? lead.attention_reason : lead.last || lead.channel;
    copy.append(element('strong', lead.name), element('span', detail, 'last'));
    row.append(element('span', initials, `avatar tone-${state.stages.indexOf(lead.stage)}`), copy,
      element('span', mode === 'agenda' ? lead.channel : lead.stage, 'record-end'), icon('arrow'));
    return row;
  }));
}

function renderInbox() {
  showRecords('#inbox-list', matchingLeads('#inbox-search'), 'No hay conversaciones que mostrar.');
}

function renderAgenda() {
  const day=by('#agenda-day');
  if(!day.value)day.value=dayKey.format(new Date());
  const list=by('#horario');
  list.replaceChildren();
  for(let half=20;half<36;half++){
    const time=String(Math.floor(half/2)).padStart(2,'0')+':'+(half%2?'30':'00');
    const lead=state.leads.find(l=>l.visit && dayKey.format(new Date(l.visit))===day.value && new Intl.DateTimeFormat('en-GB',{timeZone:'America/Santiago',hour:'2-digit',minute:'2-digit'}).format(new Date(l.visit))===time);
    const weekend=[0,6].includes(new Date(day.value+'T12:00:00Z').getUTCDay());
    const cell=element('button',time+' · '+(lead?lead.name:weekend?'Cerrado':'Sin reserva'));
    cell.disabled=!lead;if(lead)cell.onclick=()=>showLead(lead.id);
    list.append(cell);
  }
  const visits = state.leads.filter(lead => lead.visit && Date.parse(lead.visit) > Date.now())
    .sort((a, b) => a.visit.localeCompare(b.visit));
  showRecords('#agenda-list', visits, 'Abre una ficha y elige Reunión para reservar un horario.', 'agenda');
}

function renderBoard() {
  const scope = by('#board-filter').value;
  board.className = `board ${scope}`;
  const shownStages = state.stages.filter(stage => {
    const closed = ['Ganada', 'Perdida'].includes(stage);
    return scope === 'all' || (scope === 'closed' ? closed : !closed);
  });
  const filtered = matchingLeads('#search').filter(lead => shownStages.includes(lead.stage));
  by('#board-count').textContent = `${filtered.length} ${filtered.length === 1 ? 'oportunidad' : 'oportunidades'}`;
  const openGroups = new Set([...board.querySelectorAll('details[open]')].map(group => group.dataset.stage));
  board.replaceChildren(...shownStages.map(stage => {
    const index = state.stages.indexOf(stage);
    const leads = filtered.filter(lead => lead.stage === stage);
    const column = element('section', undefined, `column tone-${index}`);
    const heading = element('h3', stage);
    heading.append(element('span', leads.length, 'count'));
    column.append(heading);
    if (leads.length === 0) column.append(element('p', 'Sin oportunidades', 'empty'));
    const more = element('details', undefined, 'more-leads');
    more.dataset.stage = stage;
    more.open = openGroups.has(stage);
    if (leads.length > 4) more.append(element('summary', `Ver ${leads.length - 4} más`));
    for (const [position, lead] of leads.entries()) {
      const card = contactButton(lead, 'lead');
      card.append(element('strong', lead.name), element('span', lead.attention_reason || lead.last, 'last'));
      if (lead.unit_price) card.append(element('small', money.format(lead.unit_price * lead.quantity), 'meta'));
      (position < 4 ? column : more).append(card);
    }
    if (leads.length > 4) column.append(more);
    return column;
  }));
}

function refresh() {
  const current = (pendingRefresh ?? Promise.resolve()).catch(() => {}).then(async () => {
    const next = await api('/api/state');
    if (JSON.stringify(next) !== JSON.stringify(state)) {
      state = next;
      renderCurrentView();
      if (selected) {
        fillLeadNotes(state.leads.find(lead => lead.id === selected));
        await renderThread(selected);
      }
    }
  });
  pendingRefresh = current;
  return current;
}

function action(button, status, handler) {
  return async event => {
    event.preventDefault();
    const id = selected;
    button.disabled = true;
    status.textContent = '';
    try {
      const result = await handler(id);
      if (status !== by('#drawer-status') || selected === id) status.textContent = result || '';
    } catch (error) {
      if (status !== by('#drawer-status') || selected === id) status.textContent = error.message;
    } finally { button.disabled = false; }
  };
}

async function renderThread(id) {
  if(playback?.id===id)return;
  const { messages } = await api(`/api/leads/${id}`);
  if (id !== selected || playback?.id===id) return;
  const thread = by('#thread');
  thread.replaceChildren(...messages.map(messageBubble));
  thread.scrollTop = thread.scrollHeight;
}

function messageBubble(message){
    const item = element('article', undefined, `bubble ${message.role}`);
    item.append(element('small', `${message.role === 'cliente' ? 'Cliente' : 'Equipo'} · ${moment.format(new Date(message.created))}`),
      element('p', message.body));
    if(message.filename){
      const a=element('a',message.filename);
      a.href='/api/adjuntos/'+message.id;a.target='_blank';a.rel='noopener';
      item.append(a);
    }
    item.dataset.message=message.id;
    return item;
}

function fillLeadFields() {
  const lead = state.leads.find(item => item.id === selected);
  const product = state.config.catalog.find(item => item.id === lead.product_id);
  by('#sim-customer').hidden=lead.channel!=='Simulación' || Boolean(lead.attention_reason);
  by('#pdf-link').hidden=!product;
  by('#pdf-link').href='/api/leads/'+lead.id+'/cotizacion.pdf';
  by('#stage').value = lead.stage;
  const closed = ['Ganada', 'Perdida'].includes(lead.stage);
  quote.hidden = closed;
  by('#quote-closed').hidden = !closed;
  if (closed && !product) by('#quote-closed').textContent = 'Puedes reabrir la oportunidad si necesitas preparar una cotización.';
  else by('#quote-closed').textContent = 'Cambia la etapa si necesitas preparar una nueva cotización.';
  by('#quote-total').textContent = product
    ? `${product.name} · ${lead.quantity} × ${money.format(lead.unit_price)} = ${money.format(lead.quantity * lead.unit_price)}`
    : closed ? 'Sin cotización registrada.' : 'El sistema calcula con el precio y las existencias del catálogo.';
  by('#visit-current').textContent = lead.visit ? `Reunión agendada para el ${moment.format(new Date(lead.visit))}.` :
    'De lunes a viernes, de 10:00 a 17:30.';
}

function fillLeadNotes(lead) {
  if (!lead) return;
  by('#human-note').hidden = !lead.attention_reason;
  by('#human-reason').textContent = lead.attention_reason ?? '';
  by('#loss-summary').hidden = lead.stage !== 'Perdida' || !lossForm.hidden;
  by('#loss-summary').textContent = lead.loss_reason ? `Motivo de pérdida: ${lead.loss_reason}` : 'No se registró el motivo de pérdida.';
  by('#draft').hidden = lead.channel !== 'Simulación' || Boolean(lead.attention_reason) || !state.openrouter || !state.config.model;
}

function selectDrawerPanel(name) {
  for (const link of drawerLinks) link.setAttribute('aria-pressed', String(link.dataset.drawerLink === name));
  for (const panel of drawerPanels) panel.hidden = panel.dataset.drawerPanel !== name;
}
for (const link of drawerLinks) link.addEventListener('click', () => selectDrawerPanel(link.dataset.drawerLink));

async function showLead(id) {
  const lead = state.leads.find(item => item.id === id);
  if (!lead) return;
  selected = id;
  by('#contact').replaceChildren(element('h2', lead.name), element('p', lead.channel, 'muted'));
  by('#stage').replaceChildren(...state.stages.map(stage => new Option(stage, stage)));
  quote.elements.product.replaceChildren(...state.config.catalog.map(product => new Option(product.name, product.id)));
  if (lead.product_id) quote.elements.product.value = lead.product_id;
  quote.elements.quantity.value = lead.quantity || 1;
  const [visitDay, visitTime] = lead.visit ? chile.format(new Date(lead.visit)).split(' ') : ['', ''];
  visit.elements.day.value = visitDay;
  visit.elements.day.min = dayKey.format(new Date());
  visit.elements.time.value = visitTime;
  reply.reset();
  by('#thread').replaceChildren(element('p', 'Cargando conversación…', 'muted'));
  by('#drawer-status').textContent = '';
  lossForm.hidden = true;
  lossForm.reset();
  selectDrawerPanel('chat');
  by('#reply-button').textContent = lead.channel.startsWith('WhatsApp') ? 'Enviar por WhatsApp' : 'Guardar respuesta';
  fillLeadNotes(lead);
  fillLeadFields();
  if (!drawer.open) {
    drawer.scrollTop = 0;
    drawer.showModal();
  }
  await renderThread(id);
}

by('#close-drawer').addEventListener('click', () => drawer.close());
drawer.addEventListener('close', () => { selected=null; playback=null; by('#customer-next').disabled=false; by('#play-customer').disabled=false; });
window.addEventListener('hashchange', selectView);
by('#search').addEventListener('input', () => { if (state) renderBoard(); });
by('#board-filter').addEventListener('change', () => { if (state) renderBoard(); });
by('#inbox-search').addEventListener('input', () => { if (state) renderInbox(); });

const stage = by('#stage');
async function setStage(id, value, reason) {
  try {
    await api(`/api/leads/${id}/stage`, { stage: value, reason });
    if (id === selected) {
      lossForm.hidden = true;
      by('#drawer-status').textContent = 'Etapa actualizada.';
    }
    await refresh();
    if (id === selected) fillLeadFields();
  } catch (error) {
    if (id === selected) {
      if (lossForm.hidden) fillLeadFields();
      by('#drawer-status').textContent = error.message;
    }
  }
}
stage.addEventListener('change', () => {
  if (stage.value === 'Perdida') {
    lossForm.hidden = false;
    by('#loss-summary').hidden = true;
    lossForm.elements.reason.focus();
    return;
  }
  lossForm.hidden = true;
  setStage(selected, stage.value);
});
lossForm.addEventListener('submit', async event => {
  event.preventDefault();
  event.submitter.disabled = true;
  try { await setStage(selected, 'Perdida', lossForm.elements.reason.value); }
  finally { event.submitter.disabled = false; }
});
by('#cancel-loss').addEventListener('click', () => {
  lossForm.hidden = true;
  lossForm.reset();
  fillLeadFields();
  fillLeadNotes(state.leads.find(lead => lead.id === selected));
});
by('#resolve-attention').addEventListener('click', action(by('#resolve-attention'), by('#drawer-status'), async id => {
  await api(`/api/leads/${id}/attention`, { resolve: true });
  await refresh();
  return 'Marcado como atendido.';
}));

reply.addEventListener('submit', action(by('#reply-button'), by('#drawer-status'), async id => {
  await api(`/api/leads/${id}/reply`, { text: reply.elements.text.value });
  if (selected === id) reply.reset();
  await refresh();
  return 'Respuesta registrada.';
}));
by('#draft').addEventListener('click', action(by('#draft'), by('#drawer-status'), async id => {
  const { text } = await api(`/api/leads/${id}/draft`, {});
  if (selected === id) reply.elements.text.value = text;
  return 'Borrador listo para revisar.';
}));
quote.addEventListener('submit', action(quote.querySelector('button'), by('#drawer-status'), async id => {
  const { total } = await api(`/api/leads/${id}/quote`, { product: quote.elements.product.value, quantity: quote.elements.quantity.valueAsNumber });
  await refresh();
  if (selected === id) fillLeadFields();
  return `Cotización guardada por ${money.format(total)}.`;
}));

function chileanDate(parts) {
  const ideal = Date.parse(`${parts}:00Z`);
  let instant = ideal;
  for (let attempt = 0; attempt < 3; attempt++) {
    const local = chile.format(new Date(instant)).replace(' ', 'T');
    if (local === parts) return new Date(instant).toISOString();
    instant += ideal - Date.parse(`${local}:00Z`);
  }
  throw new Error('Esa hora no existe en Chile. Elige otro horario.');
}

visit.addEventListener('submit', action(visit.querySelector('button'), by('#drawer-status'), async id => {
  const starts = chileanDate(`${visit.elements.day.value}T${visit.elements.time.value}`);
  await api(`/api/leads/${id}/visit`, { starts });
  await refresh();
  if (selected === id) fillLeadFields();
  return 'Reunión agendada.';
}));

const configForm = by('#config-form');
function selectSettingsPanel(name) {
  configForm.hidden = name === "reportes";
  for (const link of configLinks) link.setAttribute('aria-pressed', String(link.dataset.settingsLink === name));
  for (const panel of configPanels) panel.hidden = panel.dataset.settingsPanel !== name;
}
for (const link of configLinks) {
  link.addEventListener('click', () => selectSettingsPanel(link.dataset.settingsLink));
}
configForm.addEventListener('invalid', event => {
  const panel = event.target.closest('[data-settings-panel]');
  if (panel?.hidden) selectSettingsPanel(panel.dataset.settingsPanel);
}, true);

function connectionLabel(selector, ready, label, pendingLabel) {
  const pill = by(selector);
  pill.textContent = ready ? label : pendingLabel;
  pill.classList.toggle('ready', ready);
  pill.classList.toggle('pending', !ready);
}

function renderSettings() {
  by('#link-real').hidden=!state.scenario;by('#link-start').hidden=state.scenario;
  renderConnection();
  connectionLabel('#router-status', state.openrouter, state.routerTemporary ? 'Clave temporal activa' : 'Clave configurada', 'Falta clave');
  by('#clear-router-key').disabled = !state.routerTemporary;
  if (configReady) return;
  const { store, phone, model, catalog } = state.config;
  for (const [name, value] of Object.entries({ store, phone, model })) configForm.elements[name].value = value;
  by('#catalog-settings').replaceChildren(...catalog.map(product => {
    const row = element('div', undefined, 'catalog-row');
    row.append(element('strong', product.name));
    for (const [key, labelText, min, max] of [['price', 'Precio (CLP)', 1, 100000000], ['stock', 'Stock', 0, 1000000]]) {
      const label = element('label', labelText);
      const input = element('input');
      Object.assign(input, { type: 'number', required: true, min, max, step: 1, name: `${key}-${product.id}`, value: product[key] });
      label.append(input);
      row.append(label);
    }
    return row;
  }));
  configReady = true;
  if (state.config.logo) showLogoPreview(state.config.logo);
}

function showLogoPreview(logo) {
  const preview = by('#logo-preview');
  preview.src = logo;
  preview.hidden = false;
}

upload.addEventListener('change', async () => {
  const file = upload.files[0];
  if (!file) return;
  const status = by('#config-status');
  try {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10_000_000) {
      throw new Error('Elige una imagen PNG, JPG o WebP de hasta 10 MB.');
    }
    const image = await createImageBitmap(file);
    const canvas = element('canvas');
    const ratio = Math.min(1, 192 / Math.max(image.width, image.height));
    canvas.width = Math.max(1, Math.round(image.width * ratio));
    canvas.height = Math.max(1, Math.round(image.height * ratio));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.close();
    preparedLogo = canvas.toDataURL('image/jpeg', .8);
    showLogoPreview(preparedLogo);
    status.textContent = 'Foto lista. Guarda los cambios para aplicarla.';
  } catch (error) {
    status.textContent = error.message || 'La imagen no se pudo abrir.';
  }
});

const keyInput = by('#router-key');
const keyStatus = by('#router-key-status');
const useKey = by('#use-router-key');
const clearKey = by('#clear-router-key');
useKey.addEventListener('click', action(useKey, keyStatus, async () => {
  await api('/api/router-key', { key: keyInput.value });
  keyInput.value = '';
  await refresh();
  return 'Clave temporal activa. Guarda el modelo para probarla.';
}));
const removeTemporaryKey = action(clearKey, keyStatus, async () => {
  await api('/api/router-key', { clear: true });
  keyInput.value = '';
  await refresh();
  return 'Clave temporal retirada.';
});
clearKey.addEventListener('click', async event => {
  await removeTemporaryKey(event);
  clearKey.disabled = !state.routerTemporary;
});
configForm.addEventListener('submit', action(configForm.querySelector('[type=submit]'), by('#config-status'), async () => {
  const { store, phone, model } = configForm.elements;
  const catalog = state.config.catalog.map(({ id }) => ({
    price: configForm.elements[`price-${id}`].valueAsNumber,
    stock: configForm.elements[`stock-${id}`].valueAsNumber,
  }));
  await api('/api/settings', { store: store.value, phone: phone.value, model: model.value, catalog, logo: preparedLogo });
  await refresh();
  return 'Cambios guardados.';
}));

try {
  selectView();
  if (new URLSearchParams(location.search).get('guia') === 'whatsapp') {
    selectSettingsPanel('conexiones');
    by('#guia-meta').open = true;
  }
  await refresh();
  await showLink();
  const contact = Number(new URL(location.href).searchParams.get('contacto'));
  if (contact) await showLead(contact);
  setInterval(() => {
    if (!document.hidden) refresh().catch(() => {});
  }, 3000);
} catch (error) { by('#app-status').textContent = error.message; }

by('#agenda-day').onchange=renderAgenda;
const pause = ms => new Promise(resolve=>setTimeout(resolve,ms));
async function playConversation(automatic){
  if(playback || !selected)return;
  const run={id:selected};
  playback=run;
  const active=()=>playback===run && selected===run.id && drawer.open;
  const thread=by('#thread');
  const controls=[by('#customer-next'),by('#play-customer')];
  controls.forEach(b=>b.disabled=true);
  try{
    do{
      const shown=new Set([...thread.querySelectorAll('[data-message]')].map(n=>n.dataset.message));
      const typed=element('p','Cliente está escribiendo…','typing');
      thread.append(typed);thread.scrollTop=thread.scrollHeight;
      await pause(1150);
      if(!active())break;
      await api('/api/ensayar/'+run.id,{text:by('#customer-text').value});
      if(!active())break;
      by('#customer-text').value='';
      const {messages}=await api('/api/leads/'+run.id);
      for(const message of messages.filter(m=>!shown.has(String(m.id)))){
        if(!active())break;
        if(message.role!=='cliente'){
          typed.textContent='Mesa Norte está escribiendo…';
          thread.append(typed);thread.scrollTop=thread.scrollHeight;
          await pause(Math.min(3200,1500+message.body.length*11));
        }
        if(!active())break;
        typed.remove();
        const bubble=messageBubble(message);
        bubble.classList.add('incoming');
        thread.append(bubble);thread.scrollTo({top:thread.scrollHeight,behavior:'smooth'});
        await pause(message.filename ? 2100 : 1100);
      }
      if(!active())break;
      await refresh();
      if(!active())break;
      fillLeadFields();
      if(automatic && !by('#sim-customer').hidden) await pause(1400);
    }while(automatic && active() && !by('#sim-customer').hidden);
  }catch(e){if(active())by('#drawer-status').textContent=e.message;}
  finally{
    if(playback===run){
      thread.querySelector('.typing')?.remove();
      playback=null;
      controls.forEach(b=>b.disabled=false);
    }
  }
}
by('#customer-next').onclick=()=>playConversation(false);
by('#play-customer').onclick=()=>playConversation(true);
function renderConnection(){
  const linked=!state.scenario && linkedStatus==='Vinculado';
  const ready=linked || state.metaEnabled;
  by('#connection').textContent=state.scenario ? 'Ensayo local' : linked ? 'WhatsApp vinculado por QR' : state.metaEnabled ? 'API de WhatsApp habilitada' : 'WhatsApp sin vincular';
  by('.connection').classList.toggle('ready',ready);
  connectionLabel('#meta-status',ready,linked ? 'Teléfono vinculado' : 'API de Meta habilitada',state.scenario ? 'Ensayo local' : 'Pendiente de conectar');
}
async function showLink(){
  if(!state || state.scenario)return;
  const data=await api('/api/link');
  linkedStatus=data.status;
  renderConnection();
  by('#link-status').textContent=data.status;
  by('#link-qr').hidden=!data.qr;
  if(data.qr && by('#link-qr').src!==data.qr)by('#link-qr').src=data.qr;
}
by('#link-start').onclick=async()=>{
  try{await api('/api/link',{});await showLink();}
  catch(e){by('#link-status').textContent=e.message;}
};
setInterval(()=>{if(!document.hidden && !state?.scenario)showLink().catch(()=>{});},2000);

if(!state?.scenario && new URLSearchParams(location.search).get('vincular')==='1'){
  selectSettingsPanel('conexiones');
  by('#link-start').click();
}

let reportData;
const reportForm=by('#report-form');
function paintMail(){
  const mail=reportData.emails[Number(by('#report-day').value)];
  by('#report-preview').textContent='Asunto: '+mail.subject+'\n\n'+mail.text;
}
async function loadReports(){
  reportData=await api('/api/reportes');
  const {settings,rows,last}=reportData;
  by('#report-source').textContent=settings.scenario?'Prueba local con datos ficticios. Así se vería el correo de cada cierre.':'Datos del CRM conectado. Los mensajes de ensayo quedan fuera.';
  by('#report-day').replaceChildren(...rows.map((r,i)=>new Option(r.day,String(i))).reverse());
  paintMail();
  reportForm.elements.recipient.value=settings.recipient;
  reportForm.elements.time.value=settings.time;
  reportForm.elements.enabled.checked=Boolean(settings.enabled);
  reportForm.elements.enabled.disabled=settings.scenario || !settings.configured;
  by('#report-status').textContent=settings.scenario?'Vista previa de ensayo.':!settings.configured?'Falta configurar GMAIL_FROM y GMAIL_APP_PASSWORD en el servidor.':last?'Última entrega: '+last.day+' · '+last.status:'Gmail configurado. Elige el destinatario y activa la entrega.';
}
by('#report-day').onchange=paintMail;
by('[data-settings-link="reportes"]').addEventListener('click',()=>loadReports().catch(e=>by('#report-status').textContent=e.message));
reportForm.onsubmit=async e=>{
  e.preventDefault();
  try{await api('/api/reportes',{recipient:reportForm.elements.recipient.value.trim(),time:reportForm.elements.time.value,enabled:reportForm.elements.enabled.checked});await loadReports();by('#report-status').textContent+=' Preferencias guardadas.';}
  catch(error){by('#report-status').textContent=error.message;}
};
if(new URLSearchParams(location.search).has('reportes'))by('[data-settings-link="reportes"]').click();
