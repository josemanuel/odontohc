/**
 * OdontoHC — app.js v1.2
 * Autor: José Manuel Fernández Carreira
 */
'use strict';

/* ══════════════════════════════════
   1. ESTADO Y CONSTANTES
══════════════════════════════════ */
const LS_KEY   = 'odontohc_patients';
const LS_THEME = 'odontohc_theme';

const ARCHES = {
  upper: [18,17,16,15,14,13,12,11, 21,22,23,24,25,26,27,28],
  lower: [41,42,43,44,45,46,47,48, 31,32,33,34,35,36,37,38],
};

const TOOTH_TYPE = {
  11:'incisivo',12:'incisivo',21:'incisivo',22:'incisivo',
  31:'incisivo',32:'incisivo',41:'incisivo',42:'incisivo',
  13:'canino',  23:'canino',  33:'canino',  43:'canino',
  14:'premolar',15:'premolar',24:'premolar',25:'premolar',
  34:'premolar',35:'premolar',44:'premolar',45:'premolar',
  16:'molar',17:'molar',18:'molar',26:'molar',27:'molar',28:'molar',
  36:'molar',37:'molar',38:'molar',46:'molar',47:'molar',48:'molar',
};

let patients   = [];
let activeId   = null;
let lbImgId    = null;
let currentTooth = null;

/* ══════════════════════════════════
   2. UTILIDADES
══════════════════════════════════ */
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
  const r = Math.random()*16|0; return (c==='x'?r:(r&0x3|0x8)).toString(16);
});
const today = () => new Date().toISOString().split('T')[0];
const fmtDate = iso => {
  if(!iso) return '—';
  const [y,m,d] = iso.split('-');
  return `${d}/${m}/${y}`;
};
const calcAge = dob => {
  if(!dob) return '';
  const b = new Date(dob), n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if(n.getMonth() < b.getMonth() || (n.getMonth()===b.getMonth() && n.getDate()<b.getDate())) a--;
  return `${a} años`;
};
const esc = s => s==null ? '' : String(s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const initials = p =>
  ((p.nombre||'').charAt(0) + (p.apellidos||'').charAt(0)).toUpperCase() || '?';

let _toastT;
const showToast = (msg, type='info', ms=2800) => {
  const el = $('toast');
  el.textContent = msg;
  el.className = `toast ${type} show`;
  clearTimeout(_toastT);
  _toastT = setTimeout(() => { el.className = 'toast'; }, ms);
};

const $ = id => document.getElementById(id);
const getActive = () => patients.find(p => p.id === activeId) || null;

/* ══════════════════════════════════
   3. PERSISTENCIA
══════════════════════════════════ */
function load() {
  try {
    patients = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    patients.forEach(p => {
      p.dientes  = p.dientes  || {};
      p.imagenes = p.imagenes || [];
      p.createdAt = p.createdAt || today();
    });
  } catch(e) { patients = []; }
}

function save() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(patients)); }
  catch(e) { showToast('Error al guardar — almacenamiento lleno', 'error'); }
}

function ensureTooth(p, num) {
  const k = String(num);
  if(!p.dientes[k]) p.dientes[k] = { patologias:[], intervenciones:[] };
  return p.dientes[k];
}

/* ══════════════════════════════════
   4. COLOR DOMINANTE DEL DIENTE
══════════════════════════════════ */
function toothColor(p, num) {
  const d = p.dientes[String(num)];
  if(!d) return null;
  const pats = d.patologias || [], ints = d.intervenciones || [];
  if(pats.some(x => x.tipo==='Ausencia dental' && x.estado==='Activo')) return 'ausente';
  if(ints.some(x => x.tipo==='Implante'))     return 'implante';
  if(pats.some(x => x.estado==='Activo'))     return 'patologia';
  if(pats.some(x => x.estado==='Controlado')) return 'seguimiento';
  if(ints.length > 0)                         return 'tratado';
  return null;
}

/* ══════════════════════════════════
   5. SVG DIENTE
══════════════════════════════════ */
const TC = {
  null:        {oc:'#e8f5e9',v:'#c8e6c9',m:'#b2dfdb',d:'#b2dfdb',l:'#dcedc8',s:'#78909c'},
  ausente:     {oc:'#eeeeee',v:'#e0e0e0',m:'#bdbdbd',d:'#bdbdbd',l:'#e0e0e0',s:'#9e9e9e'},
  patologia:   {oc:'#ffcdd2',v:'#ef9a9a',m:'#ef5350',d:'#ef5350',l:'#ffcdd2',s:'#c62828'},
  seguimiento: {oc:'#fff9c4',v:'#ffe082',m:'#ffb300',d:'#ffb300',l:'#fff9c4',s:'#e65100'},
  tratado:     {oc:'#c8e6c9',v:'#81c784',m:'#43a047',d:'#43a047',l:'#c8e6c9',s:'#1b5e20'},
  implante:    {oc:'#bbdefb',v:'#90caf9',m:'#1e88e5',d:'#1e88e5',l:'#bbdefb',s:'#0d47a1'},
};

function toothSVG(num, colorKey) {
  const c  = TC[colorKey] || TC[null];
  const sw = '0.9';
  const tp = TOOTH_TYPE[num] || 'molar';

  const ocShapes = {
    molar:    `<rect x="11" y="13" width="14" height="14" rx="3.5" fill="${c.oc}" stroke="${c.s}" stroke-width="${sw}"/>
               <line x1="18" y1="13" x2="18" y2="27" stroke="${c.s}" stroke-width="0.5" opacity=".35"/>
               <line x1="11" y1="20" x2="25" y2="20" stroke="${c.s}" stroke-width="0.5" opacity=".35"/>`,
    premolar: `<rect x="12" y="14" width="12" height="12" rx="3" fill="${c.oc}" stroke="${c.s}" stroke-width="${sw}"/>
               <line x1="18" y1="14" x2="18" y2="26" stroke="${c.s}" stroke-width="0.5" opacity=".35"/>`,
    canino:   `<ellipse cx="18" cy="20" rx="5" ry="6.5" fill="${c.oc}" stroke="${c.s}" stroke-width="${sw}"/>`,
    incisivo: `<rect x="13" y="15" width="10" height="10" rx="2" fill="${c.oc}" stroke="${c.s}" stroke-width="${sw}"/>`,
  };
  const vShapes = {
    molar:    `M9,2 L27,2 C28.2,2 28.8,2.8 28.2,4.5 L27,13 L9,13 L7.8,4.5 C7.2,2.8 7.8,2 9,2 Z`,
    premolar: `M10,2 L26,2 C27,2 27.5,2.8 27,4.5 L26,13 L10,13 L9,4.5 C8.5,2.8 9,2 10,2 Z`,
    canino:   `M12,2 L24,2 C25,2 25.5,3 25,5 L24,13 L12,13 L11,5 C10.5,3 11,2 12,2 Z`,
    incisivo: `M11,3 L25,3 C26,3 26.5,4 26,6 L25,13 L11,13 L10,6 C9.5,4 10,3 11,3 Z`,
  };
  const lShapes = {
    molar:    `M9,27 L27,27 L28.2,35.5 C28.8,37.2 28.2,38 27,38 L9,38 C7.8,38 7.2,37.2 7.8,35.5 Z`,
    premolar: `M10,27 L26,27 L27,35.5 C27.5,37.2 27,38 26,38 L10,38 C9,38 8.5,37.2 9,35.5 Z`,
    canino:   `M12,27 L24,27 L25,35 C25.5,37 25,38 24,38 L12,38 C11,38 10.5,37 11,35 Z`,
    incisivo: `M11,27 L25,27 L26,34 C26.5,36 26,37 25,37 L11,37 C10,37 9.5,36 10,34 Z`,
  };

  let overlay = '';
  if(colorKey==='ausente'){
    overlay = `<line x1="13" y1="13" x2="23" y2="27" stroke="#757575" stroke-width="1.5" stroke-linecap="round"/>
               <line x1="23" y1="13" x2="13" y2="27" stroke="#757575" stroke-width="1.5" stroke-linecap="round"/>`;
  }
  if(colorKey==='implante'){
    overlay = `<circle cx="18" cy="20" r="4" fill="none" stroke="#0d47a1" stroke-width="1.2"/>
               <line x1="18" y1="14" x2="18" y2="26" stroke="#0d47a1" stroke-width="1" stroke-linecap="round"/>`;
  }

  return `<svg class="tooth-svg" viewBox="0 0 36 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path fill="${c.v}" stroke="${c.s}" stroke-width="${sw}" d="${vShapes[tp]||vShapes.molar}"/>
  <path fill="${c.l}" stroke="${c.s}" stroke-width="${sw}" d="${lShapes[tp]||lShapes.molar}"/>
  <path fill="${c.m}" stroke="${c.s}" stroke-width="${sw}"
    d="M1.5,11 L11,13 L11,27 L1.5,29 C0.5,28.5 0.2,28 0.2,27 L0.2,13 C0.2,12 0.5,11.5 1.5,11 Z"/>
  <path fill="${c.d}" stroke="${c.s}" stroke-width="${sw}"
    d="M34.5,11 L25,13 L25,27 L34.5,29 C35.5,28.5 35.8,28 35.8,27 L35.8,13 C35.8,12 35.5,11.5 34.5,11 Z"/>
  ${ocShapes[tp]||ocShapes.molar}
  ${overlay}
</svg>`;
}

/* ══════════════════════════════════
   6. SIDEBAR
══════════════════════════════════ */
function renderSidebar() {
  const list  = $('patientList');
  const badge = $('patientCount');
  badge.textContent = patients.length;
  list.innerHTML = '';

  if(!patients.length) {
    list.innerHTML = `<li style="padding:20px 14px;text-align:center;font-size:12px;color:var(--tx-3)">Sin pacientes registrados</li>`;
    return;
  }

  [...patients]
    .sort((a,b) => `${a.apellidos} ${a.nombre}`.localeCompare(`${b.apellidos} ${b.nombre}`))
    .forEach(p => {
      let alerts = 0;
      Object.values(p.dientes||{}).forEach(d =>
        alerts += (d.patologias||[]).filter(x => x.estado==='Activo').length
      );

      const li = document.createElement('li');
      li.className = 'patient-item' + (p.id===activeId ? ' active' : '');
      li.setAttribute('tabindex','0');
      li.setAttribute('role','listitem');
      li.setAttribute('aria-label', `${p.nombre} ${p.apellidos}`);
      li.innerHTML = `
        <div class="patient-avatar">${initials(p)}</div>
        <div class="patient-info">
          <div class="patient-name">${esc(p.apellidos)}, ${esc(p.nombre)}</div>
          <div class="patient-meta">${esc(p.nhc)}${p.fechaNacimiento?' · '+calcAge(p.fechaNacimiento):(p.dni?' · '+esc(p.dni):'')}</div>
        </div>
        ${alerts ? `<span class="sidebar-alert" title="${alerts} patología(s) activa(s)">${alerts}</span>` : ''}`;
      li.addEventListener('click', () => selectPatient(p.id));
      li.addEventListener('keydown', e => { if(e.key==='Enter'||e.key===' ') selectPatient(p.id); });
      list.appendChild(li);
    });
}

/* ══════════════════════════════════
   7. SELECCIÓN DE PACIENTE
══════════════════════════════════ */
function selectPatient(id) {
  activeId = id;
  renderSidebar();
  renderPatientView();
  closeMobileSidebar();
}

function renderPatientView() {
  const p = getActive();

  // Mostrar/ocultar secciones principales
  $('emptyState').style.display  = p ? 'none'  : 'flex';
  $('patientView').style.display = p ? 'flex'  : 'none';

  if(!p) return;

  // Encabezado del paciente
  const av = $('pvAvatar');
  av.textContent = initials(p);
  av.style.cssText = '';

  $('pvName').textContent = `${p.apellidos||''}, ${p.nombre||''}`.replace(/^, |, $/,'');
  $('pvMeta').textContent = [
    p.nhc,
    p.fechaNacimiento ? calcAge(p.fechaNacimiento) : null,
    p.dni || null,
  ].filter(Boolean).join(' · ');

  // Rellenar formulario
  fillForm(p);

  // Resetear a tab datos
  activateTab('datos');
}

function fillForm(p) {
  const f = $('patientForm');
  ['nhc','dni','nombre','apellidos','fechaNacimiento','sexo',
   'direccion','telefono','email','alergias','medicacion',
   'enfermedades','observaciones'].forEach(k => {
    const el = f.elements[k];
    if(el) el.value = p[k] || '';
  });
  updateAge();
}

function updateAge() {
  const dob = $('fFechaNac').value;
  $('fEdad').value = dob ? calcAge(dob) : '';
}

/* ══════════════════════════════════
   8. TABS
══════════════════════════════════ */
function activateTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => {
    const on = b.dataset.tab === tab;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', String(on));
  });
  document.querySelectorAll('.tab-content').forEach(c => {
    c.classList.toggle('active', c.id === `tab-${tab}`);
  });
  if(tab==='odontograma') renderOdontograma();
  if(tab==='historial')   renderHistorial();
  if(tab==='imagenes')    renderGallery();
  if(tab==='resumen')     renderResumen();
}

/* ══════════════════════════════════
   9. ODONTOGRAMA
══════════════════════════════════ */
function renderOdontograma() {
  const p = getActive();
  if(!p) return;
  const wrap = $('odontogramaContainer');
  wrap.innerHTML = '';

  ['upper','lower'].forEach(arch => {
    const sec = document.createElement('div');
    sec.className = 'odonto-arch';

    const lbl = document.createElement('div');
    lbl.className = 'arch-label';
    lbl.textContent = arch==='upper' ? 'Arcada Superior' : 'Arcada Inferior';
    sec.appendChild(lbl);

    const row  = document.createElement('div');
    row.className = 'arch-row';

    const left  = document.createElement('div');
    left.className = 'arch-quad';
    const mid   = document.createElement('div');
    mid.className = 'arch-midline';
    mid.setAttribute('aria-hidden','true');
    const right = document.createElement('div');
    right.className = 'arch-quad';

    ARCHES[arch].forEach((num, i) => {
      const w = document.createElement('div');
      w.className = 'tooth-wrapper';
      w.setAttribute('tabindex','0');
      w.setAttribute('role','button');
      w.setAttribute('aria-label', `Diente ${num}`);

      const color = toothColor(p, num);
      const numEl = `<span class="tooth-num">${num}</span>`;
      w.innerHTML = arch==='upper'
        ? numEl + toothSVG(num, color)
        : toothSVG(num, color) + numEl;

      w.addEventListener('click',   () => openToothModal(num));
      w.addEventListener('keydown', e => { if(e.key==='Enter'||e.key===' '){ e.preventDefault(); openToothModal(num); }});

      (i < 8 ? left : right).appendChild(w);
    });

    row.appendChild(left);
    row.appendChild(mid);
    row.appendChild(right);
    sec.appendChild(row);
    wrap.appendChild(sec);

    if(arch==='upper') {
      const div = document.createElement('div');
      div.className = 'arch-divider';
      wrap.appendChild(div);
    }
  });

  // Leyenda FDI
  const fdi = document.createElement('div');
  fdi.className = 'fdi-legend';
  fdi.innerHTML = `
    <span>2 ←</span><span class="fdi-label">Sup. Izq.</span>
    <span class="fdi-sep">|</span>
    <span class="fdi-label">Sup. Der.</span><span>→ 1</span>
    <span class="fdi-spacer"></span>
    <span>3 ←</span><span class="fdi-label">Inf. Izq.</span>
    <span class="fdi-sep">|</span>
    <span class="fdi-label">Inf. Der.</span><span>→ 4</span>`;
  wrap.appendChild(fdi);
}

/* ══════════════════════════════════
   10. MODAL DIENTE
══════════════════════════════════ */
function openToothModal(num) {
  const p = getActive();
  if(!p) return;
  currentTooth = String(num);
  const tp = (TOOTH_TYPE[num]||'molar');
  $('toothModalTitle').textContent =
    `Diente ${num} — ${tp.charAt(0).toUpperCase()+tp.slice(1)}`;

  switchModalTab('patologia');
  $('patologiaForm').reset();
  $('intervencionForm').reset();
  $('pFecha').value = today();
  $('iFecha').value = today();
  renderToothHistory(p, currentTooth);

  const modal = $('toothModal');
  modal.hidden = false;
  modal.querySelector('.modal').focus();
}

function closeToothModal() {
  $('toothModal').hidden = true;
  currentTooth = null;
}

function switchModalTab(tab) {
  document.querySelectorAll('.modal-tab').forEach(b => {
    const on = b.dataset.mtab === tab;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', String(on));
  });
  document.querySelectorAll('.modal-tab-content').forEach(c => {
    c.classList.toggle('active', c.id === `mtab-${tab}`);
  });
}

function renderToothHistory(p, num) {
  const d   = p.dientes[num];
  const el  = $('toothHistory');
  if(!d || (!d.patologias.length && !d.intervenciones.length)) {
    el.innerHTML = `<div class="th-empty">Sin registros para la pieza ${num}</div>`;
    return;
  }
  const items = [
    ...(d.patologias||[]).map((x,i)  => ({...x, _t:'patologia',    _i:i})),
    ...(d.intervenciones||[]).map((x,i) => ({...x, _t:'intervencion', _i:i})),
  ].sort((a,b) => (b.fecha||'').localeCompare(a.fecha||''));

  el.innerHTML = items.map(it => `
    <div class="th-item">
      <div class="th-row">
        <span class="th-badge ${it._t}">${it._t==='patologia'?'Patología':'Intervención'}</span>
        <span class="th-date">${fmtDate(it.fecha)}</span>
        <button class="btn-del-hist" data-t="${it._t}" data-i="${it._i}" aria-label="Eliminar">
          <svg viewBox="0 0 12 12" fill="none"><path d="M2 3h8M4 3V2h4v1M3 3l.7 7h4.6L9 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
      <div class="th-title">${esc(it.tipo)}</div>
      <div class="th-meta">
        ${it.estado?`<span>${esc(it.estado)}</span>`:''}
        ${it.gravedad?`<span>${esc(it.gravedad)}</span>`:''}
        ${it.profesional?`<span>Dr. ${esc(it.profesional)}</span>`:''}
        ${it.material?`<span>${esc(it.material)}</span>`:''}
      </div>
      ${it.nota||it.descripcion?`<div class="th-note">${esc(it.nota||it.descripcion)}</div>`:''}
    </div>`).join('');

  el.querySelectorAll('.btn-del-hist').forEach(btn => {
    btn.addEventListener('click', () => {
      if(!confirm('¿Eliminar este registro?')) return;
      const p2 = getActive();
      if(!p2) return;
      const dd = p2.dientes[currentTooth];
      if(btn.dataset.t === 'patologia')    dd.patologias.splice(+btn.dataset.i, 1);
      if(btn.dataset.t === 'intervencion') dd.intervenciones.splice(+btn.dataset.i, 1);
      save();
      renderToothHistory(p2, currentTooth);
      renderOdontograma();
      renderHistorial();
      renderResumen();
      showToast('Registro eliminado', 'info');
    });
  });
}

/* ══════════════════════════════════
   11. HISTORIAL CLÍNICO
══════════════════════════════════ */
function getAllEvents(p) {
  const evs = [];
  Object.entries(p.dientes||{}).forEach(([num,d]) => {
    (d.patologias||[]).forEach(x => evs.push({...x, _pieza:num, _t:'patologia'}));
    (d.intervenciones||[]).forEach(x => evs.push({...x, _pieza:num, _t:'intervencion'}));
  });
  return evs.sort((a,b) => (b.fecha||'').localeCompare(a.fecha||''));
}

function renderHistorial(filtered=null) {
  const p = getActive();
  if(!p) return;
  const evs = filtered !== null ? filtered : getAllEvents(p);
  const tl  = $('timeline');

  if(!evs.length) {
    tl.innerHTML = `<div class="timeline-empty">Sin registros clínicos. Usa el odontograma para añadir patologías e intervenciones.</div>`;
    return;
  }

  tl.innerHTML = evs.map((ev, i) => `
    <div class="timeline-item">
      <div class="tl-dot-col">
        <div class="tl-dot ${ev._t}"></div>
        ${i < evs.length-1 ? '<div class="tl-line"></div>' : ''}
      </div>
      <div class="tl-card">
        <div class="tl-card-hd">
          <span class="tl-type ${ev._t}">${ev._t==='patologia'?'Patología':'Intervención'}</span>
          <span class="tl-date">${fmtDate(ev.fecha)}</span>
        </div>
        <div class="tl-title">${esc(ev.tipo)}</div>
        <div class="tl-tags">
          <span class="tl-tag">🦷 ${esc(ev._pieza)}</span>
          ${ev.estado?`<span class="tl-tag">${esc(ev.estado)}</span>`:''}
          ${ev.gravedad?`<span class="tl-tag">${esc(ev.gravedad)}</span>`:''}
          ${ev.profesional?`<span class="tl-tag">Dr. ${esc(ev.profesional)}</span>`:''}
          ${ev.material?`<span class="tl-tag">${esc(ev.material)}</span>`:''}
        </div>
        ${ev.nota||ev.descripcion?`<div class="tl-note">${esc(ev.nota||ev.descripcion)}</div>`:''}
      </div>
    </div>`).join('');
}

function applyFilters() {
  const p = getActive(); if(!p) return;
  const desde = $('filtFechaDesde').value;
  const hasta = $('filtFechaHasta').value;
  const pieza = $('filtPieza').value.trim();
  const tipo  = $('filtTipo').value;
  let evs = getAllEvents(p);
  if(desde) evs = evs.filter(e => (e.fecha||'') >= desde);
  if(hasta) evs = evs.filter(e => (e.fecha||'') <= hasta);
  if(pieza) evs = evs.filter(e => e._pieza === pieza);
  if(tipo)  evs = evs.filter(e => e._t === tipo);
  renderHistorial(evs);
}

/* ══════════════════════════════════
   12. GALERÍA
══════════════════════════════════ */
function renderGallery() {
  const p = getActive(); if(!p) return;
  const gal = $('gallery');
  gal.innerHTML = '';
  const imgs = p.imagenes || [];
  if(!imgs.length) {
    gal.innerHTML = `<div class="gallery-empty">Sin imágenes añadidas aún.</div>`;
    return;
  }
  imgs.forEach(img => {
    const item = document.createElement('div');
    item.className = 'gallery-item';
    item.innerHTML = `
      <img src="${img.data}" alt="${esc(img.name)}" loading="lazy"/>
      <div class="gallery-overlay">
        <button class="gallery-btn gallery-view" data-id="${img.id}" aria-label="Ver ${esc(img.name)}">
          <svg viewBox="0 0 16 16" fill="none"><circle cx="6.5" cy="6.5" r="4" stroke="currentColor" stroke-width="1.4"/><path d="M10 10L14 14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
        </button>
        <button class="gallery-btn gallery-del" data-id="${img.id}" aria-label="Eliminar ${esc(img.name)}">
          <svg viewBox="0 0 14 14" fill="none"><path d="M2 3.5h10M4.5 3.5V2.5h5v1M3.5 3.5l.8 8h5.4l.8-8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
      <div class="gallery-name">${esc(img.name)}</div>`;
    item.querySelector('.gallery-view').addEventListener('click', () => openLightbox(img.id));
    item.querySelector('.gallery-del').addEventListener('click',  () => deleteImage(img.id));
    gal.appendChild(item);
  });
}

function addImages(files) {
  const p = getActive(); if(!p) return;
  const valid = Array.from(files).filter(f => f.type.startsWith('image/'));
  if(!valid.length) { showToast('Solo se admiten imágenes', 'error'); return; }
  let done = 0;
  valid.forEach(file => {
    const process = b64 => {
      (p.imagenes = p.imagenes||[]).push({ id:uuid(), name:file.name, data:b64 });
      if(++done === valid.length) { save(); renderGallery(); showToast(`${done} imagen(es) añadida(s)`, 'success'); }
    };
    if(file.size > 1048576) {
      const cv = document.createElement('canvas');
      const im = new Image();
      im.onload = () => {
        const MAX=1200; let w=im.width, h=im.height;
        if(w>MAX){ h=Math.round(h*MAX/w); w=MAX; }
        cv.width=w; cv.height=h;
        cv.getContext('2d').drawImage(im,0,0,w,h);
        URL.revokeObjectURL(im.src);
        process(cv.toDataURL('image/jpeg', .82));
      };
      im.src = URL.createObjectURL(file);
    } else {
      const r = new FileReader();
      r.onload = e => process(e.target.result);
      r.readAsDataURL(file);
    }
  });
}

function deleteImage(id) {
  const p = getActive();
  if(!p || !confirm('¿Eliminar esta imagen?')) return;
  p.imagenes = (p.imagenes||[]).filter(i => i.id !== id);
  save(); renderGallery(); showToast('Imagen eliminada', 'info');
}

function openLightbox(id) {
  const p = getActive(); if(!p) return;
  const img = (p.imagenes||[]).find(i => i.id===id); if(!img) return;
  lbImgId = id;
  $('lightboxImg').src  = img.data;
  $('lightboxName').textContent = img.name;
  $('lightboxModal').hidden = false;
}

function closeLightbox() {
  $('lightboxModal').hidden = true; lbImgId = null;
}

function lbNav(dir) {
  const p = getActive(); if(!p || !lbImgId) return;
  const imgs = p.imagenes||[];
  const idx  = imgs.findIndex(i => i.id===lbImgId);
  const next = ((idx+dir)+imgs.length) % imgs.length;
  lbImgId = imgs[next].id;
  $('lightboxImg').src = imgs[next].data;
  $('lightboxName').textContent = imgs[next].name;
}

/* ══════════════════════════════════
   13. RESUMEN
══════════════════════════════════ */
function renderResumen() {
  const p = getActive(); if(!p) return;
  let caries=0, implantes=0, extracciones=0, endodoncias=0, coronas=0, activas=0, total=0, last='';

  Object.values(p.dientes||{}).forEach(d => {
    (d.patologias||[]).forEach(x => {
      total++;
      if(['Caries','Caries recurrente'].includes(x.tipo)) caries++;
      if(x.estado==='Activo') activas++;
      if(x.fecha>last) last=x.fecha;
    });
    (d.intervenciones||[]).forEach(x => {
      total++;
      if(x.tipo==='Implante')   implantes++;
      if(x.tipo==='Extracción') extracciones++;
      if(x.tipo==='Endodoncia') endodoncias++;
      if(x.tipo==='Corona')     coronas++;
      if(x.fecha>last) last=x.fecha;
    });
  });

  const stats = [
    {label:'Patologías activas', val:activas,     bg:'var(--danger-lt)',   c:'var(--danger)',
     ico:`<circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.5"/><path d="M10 7v3.5M10 12.5v.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`},
    {label:'Caries',             val:caries,      bg:'#ffebee',            c:'#e53935',
     ico:`<path d="M7 3C5 3 3 6 3 9C3 12 5 15 7.5 15C9 15 9.5 13.5 10 12C10.5 13.5 11 15 12.5 15C15 15 17 12 17 9C17 6 15 3 13 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/>`},
    {label:'Implantes',          val:implantes,   bg:'#e3f2fd',            c:'var(--c-implante)',
     ico:`<rect x="8" y="3" width="4" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M6 5.5h8M6 10h8M6 14.5h8" stroke="currentColor" stroke-width=".9" stroke-linecap="round"/>`},
    {label:'Extracciones',       val:extracciones,bg:'var(--warning-lt)',  c:'var(--warning)',
     ico:`<path d="M6 4h8C16 4 17 6 17 9S15 15 10.5 15C6 15 3 12 3 9S4 4 6 4Z M8 4V6.5M12 4V6.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/>`},
    {label:'Endodoncias',        val:endodoncias, bg:'#f3e5f5',            c:'#8e24aa',
     ico:`<path d="M10 3C8 3 6 5 6 8V17H14V8C14 5 12 3 10 3Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/>`},
    {label:'Coronas',            val:coronas,     bg:'#fff8e1',            c:'#f57c00',
     ico:`<path d="M4 14L5.5 5L10 9L14.5 4L19 9L20.5 5L22 14Z M4 14H22" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none" transform="scale(0.85) translate(1,1)"/>`},
    {label:'Total registros',    val:total,       bg:'var(--accent-lt)',   c:'var(--accent)',
     ico:`<path d="M4 4h12M4 8h9M4 12h11M4 16h7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`},
  ];

  $('statsGrid').innerHTML = stats.map(s => `
    <div class="stat-card">
      <div class="stat-icon" style="background:${s.bg};color:${s.c}">
        <svg viewBox="0 0 20 20" fill="none">${s.ico}</svg>
      </div>
      <div class="stat-value">${s.val}</div>
      <div class="stat-label">${s.label}</div>
    </div>`).join('');

  const alergiaBadge = p.alergias
    ? `<span class="alert-badge">⚠ ${esc(p.alergias.substring(0,60))}${p.alergias.length>60?'…':''}</span>` : '';

  $('lastVisitBar').innerHTML = `
    <div class="lv-inner">
      <div class="lv-info">
        <svg viewBox="0 0 20 20" fill="none"><rect x="3" y="4" width="14" height="13" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M7 2v3M13 2v3M3 9h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        Última actividad: <strong>${last ? fmtDate(last) : 'Sin registros'}</strong>
      </div>
      ${alergiaBadge}
    </div>`;
}

/* ══════════════════════════════════
   14. EXPORTAR PDF
══════════════════════════════════ */
function exportPDF() {
  const p = getActive();
  if(!p) { showToast('Selecciona un paciente primero', 'error'); return; }
  if(!window.jspdf) { showToast('Biblioteca PDF no disponible', 'error'); return; }

  const {jsPDF} = window.jspdf;
  const doc = new jsPDF({unit:'mm', format:'a4'});
  const W=210, M=18;
  let y=0;
  const BL=[29,110,222], DB=[13,60,140], GR=[75,85,99], LG=[245,247,250], WH=[255,255,255];

  // Cabecera
  doc.setFillColor(...BL); doc.rect(0,0,W,34,'F');
  doc.setFillColor(...DB); doc.rect(0,27,W,7,'F');
  doc.setTextColor(...WH);
  doc.setFont('helvetica','bold'); doc.setFontSize(20); doc.text('OdontoHC',M,14);
  doc.setFont('helvetica','normal'); doc.setFontSize(8.5);
  doc.text('Historia Clínica Dental Digital',M,20);
  doc.text(`Fecha: ${fmtDate(today())}`,W-M,20,{align:'right'});
  doc.setFont('helvetica','bold'); doc.setFontSize(11);
  doc.text(`${p.nombre||''} ${p.apellidos||''}`,M,32);
  doc.setFont('helvetica','normal'); doc.setFontSize(8.5);
  doc.text(`NHC: ${p.nhc||'—'}  ·  DNI: ${p.dni||'—'}`,W-M,32,{align:'right'});

  y=44;

  // Datos paciente
  doc.setFillColor(...LG);
  doc.roundedRect(M,y,W-2*M,50,3,3,'F');
  doc.setTextColor(...DB); doc.setFont('helvetica','bold'); doc.setFontSize(9);
  doc.text('DATOS DEL PACIENTE',M+4,y+7);
  doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(...GR);
  const rows=[
    ['Nombre completo',`${p.nombre||''} ${p.apellidos||''}`, 'Sexo', p.sexo==='M'?'Masculino':p.sexo==='F'?'Femenino':p.sexo||'—'],
    ['Fecha nacimiento',`${fmtDate(p.fechaNacimiento)} ${p.fechaNacimiento?'('+calcAge(p.fechaNacimiento)+')':''}`, 'Teléfono',p.telefono||'—'],
    ['Dirección',(p.direccion||'—').substring(0,40),'Email',p.email||'—'],
  ];
  let ry=y+14;
  rows.forEach(([l1,v1,l2,v2])=>{
    doc.setFont('helvetica','bold'); doc.text(l1+':',M+4,ry);
    doc.setFont('helvetica','normal'); doc.text(String(v1).substring(0,40),M+32,ry);
    if(l2){ doc.setFont('helvetica','bold'); doc.text(l2+':',M+95,ry);
            doc.setFont('helvetica','normal'); doc.text(String(v2).substring(0,28),M+113,ry); }
    ry+=9;
  });
  y+=56;

  // Datos médicos
  if(p.alergias||p.medicacion||p.enfermedades){
    doc.setFillColor(255,245,245);
    doc.roundedRect(M,y,W-2*M,36,3,3,'F');
    doc.setFillColor(220,38,38); doc.rect(M,y,3,36,'F');
    doc.setFont('helvetica','bold'); doc.setTextColor(180,30,30); doc.setFontSize(9);
    doc.text('⚠  DATOS MÉDICOS RELEVANTES',M+6,y+7);
    doc.setFont('helvetica','normal'); doc.setTextColor(...GR); doc.setFontSize(8.5);
    let my=y+14;
    if(p.alergias){ doc.setFont('helvetica','bold'); doc.text('Alergias:',M+6,my); doc.setFont('helvetica','normal'); doc.text(p.alergias.substring(0,100),M+24,my); my+=7; }
    if(p.medicacion){ doc.setFont('helvetica','bold'); doc.text('Medicación:',M+6,my); doc.setFont('helvetica','normal'); doc.text(p.medicacion.substring(0,90),M+28,my); my+=7; }
    if(p.enfermedades){ doc.setFont('helvetica','bold'); doc.text('Enfermedades:',M+6,my); doc.setFont('helvetica','normal'); doc.text(p.enfermedades.substring(0,90),M+32,my); }
    y+=42;
  }

  // Odontograma esquemático
  y+=4;
  doc.setFillColor(...BL); doc.roundedRect(M,y,W-2*M,7,2,2,'F');
  doc.setTextColor(...WH); doc.setFont('helvetica','bold'); doc.setFontSize(9);
  doc.text('ODONTOGRAMA',M+4,y+5); y+=12;

  const legItems=[['Sano',[200,230,201]],['Patología',[239,83,80]],['Seguimiento',[255,179,0]],['Tratado',[102,187,106]],['Implante',[66,165,250]],['Ausente',[189,189,189]]];
  let lx=M;
  legItems.forEach(([lbl,col])=>{
    doc.setFillColor(...col); doc.roundedRect(lx,y,3,3,.5,.5,'F');
    doc.setTextColor(...GR); doc.setFont('helvetica','normal'); doc.setFontSize(7);
    doc.text(lbl,lx+4.5,y+2.5); lx+=28;
  });
  y+=8;

  const fills={null:[220,237,220],ausente:[224,224,224],patologia:[239,83,80],seguimiento:[255,224,102],tratado:[165,214,167],implante:[187,222,251]};
  const cw=8, ch=7;
  [['S →',ARCHES.upper],['I →',ARCHES.lower]].forEach(([lbl,nums])=>{
    doc.setTextColor(...GR); doc.setFont('helvetica','bold'); doc.setFontSize(7); doc.text(lbl,M,y+4);
    nums.forEach((num,i)=>{
      const x=M+16+i*cw, cl=toothColor(p,num);
      doc.setFillColor(...(fills[cl]||fills[null]));
      doc.roundedRect(x,y,cw-1,ch,1,1,'F');
      doc.setDrawColor(180,180,180); doc.roundedRect(x,y,cw-1,ch,1,1,'S');
      doc.setTextColor(50,50,50); doc.setFont('helvetica','normal'); doc.setFontSize(5);
      doc.text(String(num),x+.8,y+ch-1.2);
    });
    y+=ch+4;
  });
  y+=4;

  // Historial
  const evs=getAllEvents(p);
  if(evs.length){
    if(y>205){ doc.addPage(); y=20; }
    doc.setFillColor(...BL); doc.roundedRect(M,y,W-2*M,7,2,2,'F');
    doc.setTextColor(...WH); doc.setFont('helvetica','bold'); doc.setFontSize(9);
    doc.text('HISTORIAL CLÍNICO',M+4,y+5); y+=12;
    doc.autoTable({
      startY:y,
      head:[['Fecha','Tipo','Pieza','Procedimiento','Estado/Prof.','Obs.']],
      body:evs.slice(0,60).map(ev=>[
        fmtDate(ev.fecha), ev._t==='patologia'?'Patología':'Intervención', ev._pieza,
        (ev.tipo||'').substring(0,28), (ev.estado||ev.profesional||'—').substring(0,18),
        (ev.nota||ev.descripcion||ev.observaciones||'').substring(0,22),
      ]),
      margin:{left:M,right:M},
      styles:{fontSize:7.5,cellPadding:2},
      headStyles:{fillColor:BL,textColor:WH,fontStyle:'bold'},
      alternateRowStyles:{fillColor:LG},
      columnStyles:{0:{cellWidth:20},1:{cellWidth:20},2:{cellWidth:11},3:{cellWidth:55},4:{cellWidth:32},5:{cellWidth:36}},
    });
    y=doc.lastAutoTable.finalY+8;
  }

  // Observaciones
  if(p.observaciones){
    if(y>245){ doc.addPage(); y=20; }
    doc.setFillColor(...LG); doc.roundedRect(M,y,W-2*M,28,3,3,'F');
    doc.setTextColor(...DB); doc.setFont('helvetica','bold'); doc.setFontSize(9);
    doc.text('OBSERVACIONES',M+4,y+7);
    doc.setFont('helvetica','normal'); doc.setTextColor(...GR); doc.setFontSize(8.5);
    doc.text(doc.splitTextToSize(p.observaciones.substring(0,300),W-2*M-10),M+4,y+14);
    y+=32;
  }

  // Firma
  if(y<244){
    doc.setDrawColor(200,200,200);
    doc.line(M,256,M+54,256);
    doc.setFont('helvetica','normal'); doc.setTextColor(160,160,160); doc.setFontSize(7.5);
    doc.text('Firma del profesional',M,261);
    doc.line(W-M-54,256,W-M,256);
    doc.text('Fecha y sello',W-M-54,261);
  }

  // Pie de página
  const pages=doc.internal.getNumberOfPages();
  for(let i=1;i<=pages;i++){
    doc.setPage(i);
    doc.setFillColor(...DB); doc.rect(0,285,W,12,'F');
    doc.setTextColor(...WH); doc.setFont('helvetica','normal'); doc.setFontSize(7.5);
    doc.text('OdontoHC — Historia Clínica Dental Digital  |  José Manuel Fernández Carreira',M,291);
    doc.text(`Página ${i} de ${pages}`,W-M,291,{align:'right'});
  }

  doc.save(`HC_${(p.apellidos||'paciente').replace(/\s+/g,'_')}_${(p.nombre||'').replace(/\s+/g,'_')}.pdf`);
  showToast('PDF generado correctamente', 'success');
}

/* ══════════════════════════════════
   15. JSON IMPORT / EXPORT
══════════════════════════════════ */
function exportJSON() {
  const p = getActive();
  if(!p) { showToast('Selecciona un paciente primero', 'error'); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(p,null,2)], {type:'application/json'}));
  a.download = `HC_${(p.apellidos||'').replace(/\s+/g,'_')}_${(p.nombre||'').replace(/\s+/g,'_')}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  showToast('JSON exportado', 'success');
}

function importJSON(file) {
  if(!file) return;
  const r = new FileReader();
  r.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if(!data.nombre && !data.apellidos) throw new Error('Sin nombre');
      data.id      = data.id      || uuid();
      data.dientes  = data.dientes  || {};
      data.imagenes = data.imagenes || [];
      const idx = patients.findIndex(p => p.id===data.id);
      if(idx >= 0) {
        if(!confirm(`"${data.nombre} ${data.apellidos}" ya existe. ¿Sobrescribir?`)) return;
        patients[idx] = data;
      } else {
        patients.push(data);
      }
      save(); renderSidebar(); selectPatient(data.id);
      showToast('Datos importados', 'success');
    } catch { showToast('JSON inválido o corrupto', 'error'); }
  };
  r.readAsText(file);
}

/* ══════════════════════════════════
   16. BÚSQUEDA
══════════════════════════════════ */
function renderSearch(query) {
  const dd = $('searchDropdown');
  const q  = query.trim().toLowerCase();
  if(!q) { dd.classList.remove('open'); return; }
  const res = patients.filter(p =>
    `${p.nombre} ${p.apellidos} ${p.dni||''} ${p.nhc||''}`.toLowerCase().includes(q)
  ).slice(0,6);
  dd.innerHTML = res.length
    ? res.map(p => `<div class="search-result-item" data-id="${p.id}"><strong>${esc(p.apellidos)}, ${esc(p.nombre)}</strong><span style="float:right;color:var(--tx-3);font-size:11px">${esc(p.nhc||p.dni||'')}</span></div>`).join('')
    : `<div class="search-result-item" style="color:var(--tx-3)">Sin resultados</div>`;
  dd.classList.add('open');
  dd.querySelectorAll('[data-id]').forEach(el => {
    el.addEventListener('click', () => {
      selectPatient(el.dataset.id);
      $('searchInput').value = '';
      dd.classList.remove('open');
    });
  });
}

/* ══════════════════════════════════
   17. TEMA
══════════════════════════════════ */
function applyTheme(mode) {
  document.body.classList.toggle('day-mode',   mode==='day');
  document.body.classList.toggle('night-mode', mode==='night');
  localStorage.setItem(LS_THEME, mode);
}

/* ══════════════════════════════════
   18. SIDEBAR MOBILE
══════════════════════════════════ */
function openMobileSidebar()  { $('sidebar').classList.add('open');    $('sidebarOverlay').classList.add('visible'); }
function closeMobileSidebar() { $('sidebar').classList.remove('open'); $('sidebarOverlay').classList.remove('visible'); }

/* ══════════════════════════════════
   19. EVENT LISTENERS
══════════════════════════════════ */
function initEvents() {

  // Nuevo paciente
  const openNew = () => { $('newPatientModal').hidden=false; $('npNombre').focus(); };
  $('btnNuevoPaciente').addEventListener('click', openNew);
  $('btnNuevoPacienteEmpty').addEventListener('click', openNew);
  $('closeNewPatient').addEventListener('click', () => $('newPatientModal').hidden=true);
  $('cancelNewPatient').addEventListener('click', () => $('newPatientModal').hidden=true);
  $('newPatientModal').addEventListener('click', e => { if(e.target===$('newPatientModal')) $('newPatientModal').hidden=true; });

  $('newPatientForm').addEventListener('submit', e => {
    e.preventDefault();
    const f  = e.target;
    const n  = f.elements.nombre.value.trim();
    const ap = f.elements.apellidos.value.trim();
    if(!n||!ap) { showToast('Nombre y apellidos son obligatorios', 'error'); return; }
    const newId = uuid();
    const nhc   = `HC-${String(patients.length+1).padStart(3,'0')}`;
    const p = {
      id:newId, nhc, nombre:n, apellidos:ap,
      dni:(f.elements.dni.value||'').trim(),
      fechaNacimiento:'', sexo:'', direccion:'', telefono:'', email:'',
      alergias:'', medicacion:'', enfermedades:'', observaciones:'',
      dientes:{}, imagenes:[], createdAt:today(),
    };
    patients.push(p);
    save(); renderSidebar(); selectPatient(newId);
    $('newPatientModal').hidden=true; f.reset();
    showToast('Paciente creado', 'success');
  });

  // Formulario datos
  $('fFechaNac').addEventListener('change', updateAge);
  $('patientForm').addEventListener('submit', e => {
    e.preventDefault();
    const p = getActive(); if(!p) return;
    const f = e.target;
    ['nhc','dni','nombre','apellidos','fechaNacimiento','sexo','direccion',
     'telefono','email','alergias','medicacion','enfermedades','observaciones']
      .forEach(k => { const el=f.elements[k]; if(el) p[k]=el.value; });
    save(); renderSidebar(); renderPatientView();
    showToast('Datos guardados', 'success');
  });

  // Eliminar paciente
  $('btnDeletePatient').addEventListener('click', () => {
    const p = getActive(); if(!p) return;
    if(!confirm(`¿Eliminar definitivamente a ${p.nombre} ${p.apellidos}?`)) return;
    patients = patients.filter(x => x.id !== p.id);
    activeId = patients.length ? patients[0].id : null;
    save(); renderSidebar(); renderPatientView();
    showToast('Paciente eliminado', 'info');
  });

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(b =>
    b.addEventListener('click', () => activateTab(b.dataset.tab))
  );

  // Modal diente
  $('closeToothModal').addEventListener('click', closeToothModal);
  $('toothModal').addEventListener('click', e => { if(e.target===$('toothModal')) closeToothModal(); });
  document.querySelectorAll('.modal-tab').forEach(b =>
    b.addEventListener('click', () => switchModalTab(b.dataset.mtab))
  );

  // Patología
  $('patologiaForm').addEventListener('submit', e => {
    e.preventDefault();
    const p = getActive(); if(!p||!currentTooth) return;
    const f = e.target;
    if(!f.elements.tipo.value) { showToast('Selecciona una patología', 'error'); return; }
    ensureTooth(p, currentTooth).patologias.push({
      tipo:f.elements.tipo.value, estado:f.elements.estado.value,
      gravedad:f.elements.gravedad.value, fecha:f.elements.fecha.value,
      nota:f.elements.nota.value.trim(),
    });
    save(); renderOdontograma(); renderHistorial(); renderResumen(); renderToothHistory(p, currentTooth);
    f.reset(); $('pFecha').value=today();
    showToast('Patología registrada', 'success');
  });

  // Intervención
  $('intervencionForm').addEventListener('submit', e => {
    e.preventDefault();
    const p = getActive(); if(!p||!currentTooth) return;
    const f = e.target;
    if(!f.elements.tipo.value) { showToast('Selecciona una intervención', 'error'); return; }
    ensureTooth(p, currentTooth).intervenciones.push({
      tipo:f.elements.tipo.value, fecha:f.elements.fecha.value,
      profesional:f.elements.profesional.value.trim(),
      material:f.elements.material.value.trim(),
      descripcion:f.elements.descripcion.value.trim(),
      observaciones:f.elements.observaciones.value.trim(),
    });
    save(); renderOdontograma(); renderHistorial(); renderResumen(); renderToothHistory(p, currentTooth);
    f.reset(); $('iFecha').value=today();
    showToast('Intervención registrada', 'success');
  });

  // PDF / JSON
  $('btnExportPDF').addEventListener('click', exportPDF);
  $('btnExportJSON').addEventListener('click', exportJSON);
  $('btnImportJSON').addEventListener('click', () => $('importFileInput').click());
  $('importFileInput').addEventListener('change', e => { importJSON(e.target.files[0]); e.target.value=''; });

  // Filtros historial
  $('btnFiltrar').addEventListener('click', applyFilters);
  $('btnResetFiltros').addEventListener('click', () => {
    ['filtFechaDesde','filtFechaHasta','filtPieza'].forEach(id => $(id).value='');
    $('filtTipo').value='';
    renderHistorial();
  });

  // Galería
  const dz = $('dropzone'), fi = $('fileInput');
  dz.addEventListener('click', () => fi.click());
  dz.addEventListener('keydown', e => { if(e.key==='Enter'||e.key===' ') fi.click(); });
  fi.addEventListener('change', e => { addImages(e.target.files); e.target.value=''; });
  dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('dragging'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('dragging'));
  dz.addEventListener('drop',      e => { e.preventDefault(); dz.classList.remove('dragging'); addImages(e.dataTransfer.files); });

  // Lightbox
  $('closeLightbox').addEventListener('click', closeLightbox);
  $('lightboxModal').addEventListener('click', e => { if(e.target===$('lightboxModal')) closeLightbox(); });
  $('lightboxPrev').addEventListener('click', () => lbNav(-1));
  $('lightboxNext').addEventListener('click', () => lbNav(1));

  // Tema
  $('btnTheme').addEventListener('click', () =>
    applyTheme(document.body.classList.contains('day-mode') ? 'night' : 'day')
  );

  // Acerca de
  $('btnAbout').addEventListener('click',  () => $('aboutModal').hidden=false);
  $('closeAbout').addEventListener('click',() => $('aboutModal').hidden=true);
  $('aboutModal').addEventListener('click',e => { if(e.target===$('aboutModal')) $('aboutModal').hidden=true; });

  // Búsqueda
  $('searchInput').addEventListener('input', e => renderSearch(e.target.value));
  $('searchInput').addEventListener('blur',  () => setTimeout(() => $('searchDropdown').classList.remove('open'), 200));
  document.addEventListener('click', e => {
    if(!$('searchInput').closest('.topbar-search')?.contains(e.target))
      $('searchDropdown').classList.remove('open');
  });

  // Hamburguesa
  $('menuBtn').addEventListener('click', () => {
    $('sidebar').classList.contains('open') ? closeMobileSidebar() : openMobileSidebar();
  });
  $('sidebarOverlay').addEventListener('click', closeMobileSidebar);

  // Escape
  document.addEventListener('keydown', e => {
    if(e.key !== 'Escape') return;
    if(!$('lightboxModal').hidden)    { closeLightbox(); return; }
    if(!$('toothModal').hidden)       { closeToothModal(); return; }
    if(!$('aboutModal').hidden)       { $('aboutModal').hidden=true; return; }
    if(!$('newPatientModal').hidden)  { $('newPatientModal').hidden=true; return; }
  });

  // Lightbox teclado
  document.addEventListener('keydown', e => {
    if($('lightboxModal').hidden) return;
    if(e.key==='ArrowLeft')  lbNav(-1);
    if(e.key==='ArrowRight') lbNav(1);
  });
}

/* ══════════════════════════════════
   20. INIT
══════════════════════════════════ */
function init() {
  applyTheme(localStorage.getItem(LS_THEME) || 'day');
  load();
  renderSidebar();

  // Mostrar o vacío
  if(patients.length) {
    selectPatient(patients[0].id);
  } else {
    $('emptyState').style.display  = 'flex';
    $('patientView').style.display = 'none';
  }

  initEvents();
  console.log(`%cOdontoHC v1.2 — ${patients.length} paciente(s)`, 'color:#1d6ede;font-weight:700');
}

document.addEventListener('DOMContentLoaded', init);
