/**
 * OdontoHC — Historia Clínica Dental
 * app.js — Lógica completa v1.1
 * Autor: José Manuel Fernández Carreira
 */
'use strict';

/* ══════════════════════════════════════════
   1. CONSTANTES Y ESTADO GLOBAL
══════════════════════════════════════════ */
const LS_PATIENTS = 'odontohc_patients';
const LS_THEME    = 'odontohc_theme';

/** Cuadrantes FDI: Superior derecho → izquierdo; Inferior izquierdo → derecho */
const ARCHES = {
  upper: [18,17,16,15,14,13,12,11, 21,22,23,24,25,26,27,28],
  lower: [41,42,43,44,45,46,47,48, 31,32,33,34,35,36,37,38],
};

/**
 * Tipo morfológico de cada pieza FDI
 * molar | premolar | canino | incisivo
 */
const TOOTH_TYPE = {
  11:'incisivo',12:'incisivo',21:'incisivo',22:'incisivo',
  31:'incisivo',32:'incisivo',41:'incisivo',42:'incisivo',
  13:'canino',  23:'canino',  33:'canino',  43:'canino',
  14:'premolar',15:'premolar',24:'premolar',25:'premolar',
  34:'premolar',35:'premolar',44:'premolar',45:'premolar',
  16:'molar',17:'molar',18:'molar',
  26:'molar',27:'molar',28:'molar',
  36:'molar',37:'molar',38:'molar',
  46:'molar',47:'molar',48:'molar',
};

let state = {
  patients:  [],
  activeId:  null,
  lightboxId: null, // id imagen en lightbox
};

/* ══════════════════════════════════════════
   2. UTILIDADES GENERALES
══════════════════════════════════════════ */
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{
  const r=Math.random()*16|0, v=c==='x'?r:(r&0x3|0x8); return v.toString(16);
});

const today = () => new Date().toISOString().split('T')[0];

function fmtDate(iso){
  if(!iso) return '—';
  const [y,m,d]=iso.split('-'); return `${d}/${m}/${y}`;
}

function calcAge(dob){
  if(!dob) return '';
  const b=new Date(dob), n=new Date();
  let a=n.getFullYear()-b.getFullYear();
  if(n.getMonth()<b.getMonth()||(n.getMonth()===b.getMonth()&&n.getDate()<b.getDate())) a--;
  return `${a} años`;
}

function esc(s){
  if(s===null||s===undefined) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function initials(p){
  return ((p.nombre||'').charAt(0)+(p.apellidos||'').charAt(0)).toUpperCase()||'?';
}

let _toastTimer;
function showToast(msg, type='info', dur=2800){
  const t=document.getElementById('toast');
  t.textContent=msg;
  t.className=`toast ${type} show`;
  clearTimeout(_toastTimer);
  _toastTimer=setTimeout(()=>{ t.className='toast'; }, dur);
}

/* ══════════════════════════════════════════
   3. PERSISTENCIA
══════════════════════════════════════════ */
function loadData(){
  try {
    const raw=localStorage.getItem(LS_PATIENTS);
    state.patients = raw ? JSON.parse(raw) : [];
    // Migración: asegurar campos nuevos en pacientes viejos
    state.patients.forEach(p => {
      if(!p.imagenes)  p.imagenes=[];
      if(!p.dientes)   p.dientes={};
      if(!p.createdAt) p.createdAt=today();
    });
  } catch(e){ state.patients=[]; }
}

function saveData(){
  try { localStorage.setItem(LS_PATIENTS, JSON.stringify(state.patients)); }
  catch(e){ showToast('Error al guardar. Almacenamiento lleno.','error'); }
}

function getActivePatient(){
  return state.patients.find(p=>p.id===state.activeId)||null;
}

/* ══════════════════════════════════════════
   4. CRUD PACIENTES
══════════════════════════════════════════ */
function createPatient(nombre, apellidos, dni){
  const p = {
    id: uuid(),
    nhc: `HC-${String(state.patients.length+1).padStart(3,'0')}`,
    nombre: nombre.trim(),
    apellidos: apellidos.trim(),
    dni: (dni||'').trim(),
    fechaNacimiento:'', sexo:'', direccion:'',
    telefono:'', email:'',
    alergias:'', medicacion:'', enfermedades:'', observaciones:'',
    dientes: {},
    imagenes: [],
    createdAt: today(),
  };
  state.patients.push(p);
  saveData();
  return p;
}

function deletePatient(id){
  state.patients=state.patients.filter(p=>p.id!==id);
  if(state.activeId===id)
    state.activeId=state.patients.length ? state.patients[0].id : null;
  saveData();
}

function ensureTooth(patient, num){
  const k=String(num);
  if(!patient.dientes[k]) patient.dientes[k]={patologias:[],intervenciones:[]};
  return patient.dientes[k];
}

/* ══════════════════════════════════════════
   5. COLOR DOMINANTE DEL DIENTE
══════════════════════════════════════════ */
function toothColor(patient, num){
  const d=patient.dientes[String(num)];
  if(!d) return null;
  const pats=d.patologias||[], ints=d.intervenciones||[];
  if(pats.some(p=>p.tipo==='Ausencia dental'&&p.estado==='Activo')) return 'ausente';
  if(ints.some(i=>i.tipo==='Implante'))  return 'implante';
  if(pats.some(p=>p.estado==='Activo'))  return 'patologia';
  if(pats.some(p=>p.estado==='Controlado')) return 'seguimiento';
  if(ints.length>0) return 'tratado';
  return null;
}

/* ══════════════════════════════════════════
   6. SVG VECTORIAL DE DIENTE (5 caras, morfología)
══════════════════════════════════════════ */
const TOOTH_COLORS = {
  null:        {oc:'#e8f5e9',vest:'#c8e6c9',mes:'#b2dfdb',dis:'#b2dfdb',ling:'#dcedc8',str:'#78909c'},
  ausente:     {oc:'#eeeeee',vest:'#e0e0e0',mes:'#bdbdbd',dis:'#bdbdbd',ling:'#e0e0e0',str:'#9e9e9e'},
  patologia:   {oc:'#ffcdd2',vest:'#ef9a9a',mes:'#ef5350',dis:'#ef5350',ling:'#ffcdd2',str:'#c62828'},
  seguimiento: {oc:'#fff9c4',vest:'#ffe082',mes:'#ffb300',dis:'#ffb300',ling:'#fff9c4',str:'#e65100'},
  tratado:     {oc:'#c8e6c9',vest:'#81c784',mes:'#43a047',dis:'#43a047',ling:'#c8e6c9',str:'#1b5e20'},
  implante:    {oc:'#bbdefb',vest:'#90caf9',mes:'#1e88e5',dis:'#1e88e5',ling:'#bbdefb',str:'#0d47a1'},
};

function buildToothSVG(num, colorKey){
  const c  = TOOTH_COLORS[colorKey] || TOOTH_COLORS[null];
  const sw = '0.9'; // stroke-width
  const type = TOOTH_TYPE[num] || 'molar';

  // Forma oclusal varía según morfología
  const oclusalShapes = {
    molar:    `<rect x="11" y="13" width="14" height="14" rx="3.5" fill="${c.oc}" stroke="${c.str}" stroke-width="${sw}"/>
               <line x1="18" y1="13" x2="18" y2="27" stroke="${c.str}" stroke-width="0.5" opacity="0.4"/>
               <line x1="11" y1="20" x2="25" y2="20" stroke="${c.str}" stroke-width="0.5" opacity="0.4"/>`,
    premolar: `<rect x="12" y="14" width="12" height="12" rx="3" fill="${c.oc}" stroke="${c.str}" stroke-width="${sw}"/>
               <line x1="18" y1="14" x2="18" y2="26" stroke="${c.str}" stroke-width="0.5" opacity="0.4"/>`,
    canino:   `<ellipse cx="18" cy="20" rx="5" ry="6.5" fill="${c.oc}" stroke="${c.str}" stroke-width="${sw}"/>`,
    incisivo: `<rect x="13" y="15" width="10" height="10" rx="2" fill="${c.oc}" stroke="${c.str}" stroke-width="${sw}"/>`,
  };

  const vestShape = {
    molar:    `M9,2 L27,2 C28.2,2 28.8,2.8 28.2,4.5 L27,13 L9,13 L7.8,4.5 C7.2,2.8 7.8,2 9,2 Z`,
    premolar: `M10,2 L26,2 C27,2 27.5,2.8 27,4.5 L26,13 L10,13 L9,4.5 C8.5,2.8 9,2 10,2 Z`,
    canino:   `M12,2 L24,2 C25,2 25.5,3 25,5 L24,13 L12,13 L11,5 C10.5,3 11,2 12,2 Z`,
    incisivo: `M11,3 L25,3 C26,3 26.5,4 26,6 L25,13 L11,13 L10,6 C9.5,4 10,3 11,3 Z`,
  };
  const lingShape = {
    molar:    `M9,27 L27,27 L28.2,35.5 C28.8,37.2 28.2,38 27,38 L9,38 C7.8,38 7.2,37.2 7.8,35.5 Z`,
    premolar: `M10,27 L26,27 L27,35.5 C27.5,37.2 27,38 26,38 L10,38 C9,38 8.5,37.2 9,35.5 Z`,
    canino:   `M12,27 L24,27 L25,35 C25.5,37 25,38 24,38 L12,38 C11,38 10.5,37 11,35 Z`,
    incisivo: `M11,27 L25,27 L26,34 C26.5,36 26,37 25,37 L11,37 C10,37 9.5,36 10,34 Z`,
  };

  const vPath = vestShape[type] || vestShape.molar;
  const lPath = lingShape[type] || lingShape.molar;
  const oShape = oclusalShapes[type] || oclusalShapes.molar;

  // Símbolo especial para ausente e implante sobre la cara oclusal
  let overlay = '';
  if(colorKey==='ausente'){
    overlay=`<line x1="13" y1="13" x2="23" y2="27" stroke="#757575" stroke-width="1.5" stroke-linecap="round"/>
             <line x1="23" y1="13" x2="13" y2="27" stroke="#757575" stroke-width="1.5" stroke-linecap="round"/>`;
  }
  if(colorKey==='implante'){
    overlay=`<circle cx="18" cy="20" r="4" fill="none" stroke="#0d47a1" stroke-width="1.2"/>
             <line x1="18" y1="14" x2="18" y2="26" stroke="#0d47a1" stroke-width="1" stroke-linecap="round"/>`;
  }

  return `<svg class="tooth-svg" viewBox="0 0 36 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path fill="${c.vest}" stroke="${c.str}" stroke-width="${sw}" d="${vPath}"/>
  <path fill="${c.ling}" stroke="${c.str}" stroke-width="${sw}" d="${lPath}"/>
  <path fill="${c.mes}"  stroke="${c.str}" stroke-width="${sw}"
    d="M1.5,11 L11,13 L11,27 L1.5,29 C0.5,28.5 0.2,28 0.2,27 L0.2,13 C0.2,12 0.5,11.5 1.5,11 Z"/>
  <path fill="${c.dis}"  stroke="${c.str}" stroke-width="${sw}"
    d="M34.5,11 L25,13 L25,27 L34.5,29 C35.5,28.5 35.8,28 35.8,27 L35.8,13 C35.8,12 35.5,11.5 34.5,11 Z"/>
  ${oShape}
  ${overlay}
</svg>`;
}

/* ══════════════════════════════════════════
   7. RENDER SIDEBAR
══════════════════════════════════════════ */
function renderSidebar(){
  const list  = document.getElementById('patientList');
  const badge = document.getElementById('patientCount');
  badge.textContent = state.patients.length;
  list.innerHTML = '';

  if(!state.patients.length){
    list.innerHTML=`<li style="padding:24px 16px;text-align:center;font-size:13px;color:var(--text-muted)">Sin pacientes registrados</li>`;
    return;
  }

  // Ordenar alfabéticamente
  const sorted = [...state.patients].sort((a,b)=>
    `${a.apellidos} ${a.nombre}`.localeCompare(`${b.apellidos} ${b.nombre}`)
  );

  sorted.forEach(p=>{
    const li=document.createElement('li');
    li.className='patient-item'+(p.id===state.activeId?' active':'');
    li.setAttribute('role','listitem');
    li.setAttribute('tabindex','0');
    li.setAttribute('aria-label',`${p.nombre} ${p.apellidos}`);

    // Calcular nº alertas activas
    let alerts=0;
    Object.values(p.dientes||{}).forEach(d=>{
      alerts+=(d.patologias||[]).filter(x=>x.estado==='Activo').length;
    });

    li.innerHTML=`
      <div class="patient-avatar" aria-hidden="true">${initials(p)}</div>
      <div class="patient-info">
        <div class="patient-name">${esc(p.apellidos)}, ${esc(p.nombre)}</div>
        <div class="patient-meta">${esc(p.nhc)}${p.fechaNacimiento?' · '+calcAge(p.fechaNacimiento):(p.dni?' · '+esc(p.dni):'')}</div>
      </div>
      ${alerts ? `<span class="sidebar-alert" title="${alerts} patología(s) activa(s)">${alerts}</span>` : ''}`;

    li.addEventListener('click', ()=>selectPatient(p.id));
    li.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' ') selectPatient(p.id); });
    list.appendChild(li);
  });
}

/* ══════════════════════════════════════════
   8. SELECCIÓN Y VISTA DE PACIENTE
══════════════════════════════════════════ */
function selectPatient(id){
  state.activeId=id;
  renderSidebar();
  showPatientView();
  // Resetear a tab "datos" al cambiar de paciente
  switchTab('datos');
  closeMobileSidebar();
}

function showPatientView(){
  const p=getActivePatient();
  document.getElementById('emptyState').hidden=!!p;
  document.getElementById('patientView').hidden=!p;
  if(!p) return;
  fillPatientForm(p);
  // Actualizar título de sección con nombre del paciente
  document.getElementById('patientNameHeader').textContent=`${p.nombre} ${p.apellidos}`;
}

function fillPatientForm(p){
  const fields=['nhc','dni','nombre','apellidos','fechaNacimiento','sexo','direccion','telefono','email','alergias','medicacion','enfermedades','observaciones'];
  const f=document.getElementById('patientForm');
  fields.forEach(k=>{ const el=f.elements[k]; if(el) el.value=p[k]||''; });
  updateAgeDisplay();
}

function updateAgeDisplay(){
  const dob=document.getElementById('fFechaNac').value;
  document.getElementById('fEdad').value=dob?calcAge(dob):'';
}

/* ══════════════════════════════════════════
   9. ODONTOGRAMA
══════════════════════════════════════════ */
function renderOdontograma(){
  const p=getActivePatient();
  if(!p) return;
  const container=document.getElementById('odontogramaContainer');
  container.innerHTML='';

  ['upper','lower'].forEach(arch=>{
    const section=document.createElement('div');
    section.className='odonto-arch';

    const label=document.createElement('div');
    label.className='arch-label';
    label.textContent=arch==='upper'?'Arcada Superior ↑':'Arcada Inferior ↓';
    section.appendChild(label);

    const row=document.createElement('div');
    row.className='arch-row';

    // Separador de línea media
    const mid=document.createElement('div');
    mid.className='arch-midline';
    mid.setAttribute('aria-hidden','true');

    const left=document.createElement('div');
    left.className='arch-quad';
    const right=document.createElement('div');
    right.className='arch-quad arch-quad-right';

    const nums=ARCHES[arch]; // 16 dientes
    nums.forEach((num,i)=>{
      const w=document.createElement('div');
      w.className='tooth-wrapper';
      w.setAttribute('tabindex','0');
      w.setAttribute('role','button');
      w.setAttribute('aria-label',`Diente ${num}. Pulsa para ver o registrar`);

      const color=toothColor(p,num);
      const numEl=`<span class="tooth-num">${num}</span>`;
      w.innerHTML = arch==='upper'
        ? numEl+buildToothSVG(num, color)
        : buildToothSVG(num, color)+numEl;

      w.addEventListener('click',  ()=>openToothModal(num));
      w.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); openToothModal(num); }});

      // Cuadrantes: primeros 8 = derecho paciente (izq pantalla), últimos 8 = izquierdo
      if(i<8) left.appendChild(w);
      else    right.appendChild(w);
    });

    row.appendChild(left);
    row.appendChild(mid);
    row.appendChild(right);
    section.appendChild(row);
    container.appendChild(section);

    if(arch==='upper'){
      const sep=document.createElement('div');
      sep.className='arch-divider';
      container.appendChild(sep);
    }
  });

  // Leyenda cuadrantes FDI
  const fdiLegend=document.createElement('div');
  fdiLegend.className='fdi-legend';
  fdiLegend.innerHTML=`
    <span>2 ←</span><span class="fdi-label">Sup. Izq.</span>
    <span class="fdi-sep">|</span>
    <span class="fdi-label">Sup. Der.</span><span>→ 1</span>
    <span class="fdi-spacer"></span>
    <span>3 ←</span><span class="fdi-label">Inf. Izq.</span>
    <span class="fdi-sep">|</span>
    <span class="fdi-label">Inf. Der.</span><span>→ 4</span>`;
  container.appendChild(fdiLegend);
}

/* ══════════════════════════════════════════
   10. MODAL DEL DIENTE
══════════════════════════════════════════ */
let currentTooth=null;

function openToothModal(num){
  const p=getActivePatient();
  if(!p) return;
  currentTooth=String(num);

  document.getElementById('toothModalTitle').textContent=
    `Diente ${num} — ${(TOOTH_TYPE[num]||'molar').charAt(0).toUpperCase()+(TOOTH_TYPE[num]||'molar').slice(1)}`;

  switchModalTab('patologia');
  document.getElementById('patologiaForm').reset();
  document.getElementById('intervencionForm').reset();
  document.getElementById('pFecha').value=today();
  document.getElementById('iFecha').value=today();
  renderToothHistory(p, currentTooth);

  const modal=document.getElementById('toothModal');
  modal.hidden=false;
  modal.querySelector('.modal').focus();
}

function closeToothModal(){
  document.getElementById('toothModal').hidden=true;
  currentTooth=null;
}

function switchModalTab(tab){
  document.querySelectorAll('.modal-tab').forEach(b=>{
    b.classList.toggle('active',b.dataset.mtab===tab);
    b.setAttribute('aria-selected',String(b.dataset.mtab===tab));
  });
  document.querySelectorAll('.modal-tab-content').forEach(c=>{
    c.classList.toggle('active',c.id===`mtab-${tab}`);
  });
}

function renderToothHistory(patient, num){
  const d=patient.dientes[num];
  const el=document.getElementById('toothHistory');
  if(!d||(!d.patologias.length&&!d.intervenciones.length)){
    el.innerHTML=`<div class="tooth-hist-empty">Sin registros para la pieza ${num}</div>`;
    return;
  }
  const items=[
    ...(d.patologias||[]).map((x,i)=>({...x,_tipo:'patologia',_idx:i})),
    ...(d.intervenciones||[]).map((x,i)=>({...x,_tipo:'intervencion',_idx:i})),
  ].sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||''));

  el.innerHTML=items.map(it=>`
    <div class="tooth-hist-item">
      <div class="tooth-hist-row">
        <span class="tooth-hist-badge ${it._tipo}">${it._tipo==='patologia'?'Patología':'Intervención'}</span>
        <span class="tooth-hist-date">${fmtDate(it.fecha)}</span>
        <button class="btn-hist-delete" data-tipo="${it._tipo}" data-idx="${it._idx}" title="Eliminar registro"
          aria-label="Eliminar ${it._tipo}">
          <svg viewBox="0 0 16 16" fill="none"><path d="M3 4h10M5 4V3h6v1M4 4l1 9h6l1-9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
      <div class="tooth-hist-title">${esc(it.tipo)}</div>
      <div class="tooth-hist-meta">
        ${it.estado  ?`<span>${esc(it.estado)}</span>`:''}
        ${it.gravedad?`<span>${esc(it.gravedad)}</span>`:''}
        ${it.profesional?`<span>Dr. ${esc(it.profesional)}</span>`:''}
        ${it.material?`<span>${esc(it.material)}</span>`:''}
      </div>
      ${it.nota||it.descripcion?`<div class="tooth-hist-note">${esc(it.nota||it.descripcion)}</div>`:''}
    </div>`).join('');

  // Listeners de borrado
  el.querySelectorAll('.btn-hist-delete').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const tipo=btn.dataset.tipo;
      const idx=parseInt(btn.dataset.idx);
      if(!confirm('¿Eliminar este registro clínico?')) return;
      const p=getActivePatient();
      if(!p) return;
      const d=p.dientes[currentTooth];
      if(tipo==='patologia')    d.patologias.splice(idx,1);
      if(tipo==='intervencion') d.intervenciones.splice(idx,1);
      saveData();
      renderToothHistory(p,currentTooth);
      renderOdontograma();
      renderHistorial();
      renderResumen();
      showToast('Registro eliminado','info');
    });
  });
}

/* ══════════════════════════════════════════
   11. HISTORIAL CLÍNICO GLOBAL
══════════════════════════════════════════ */
function getAllEvents(patient){
  const events=[];
  Object.entries(patient.dientes||{}).forEach(([num,d])=>{
    (d.patologias||[]).forEach(p=>events.push({...p,_pieza:num,_tipo:'patologia'}));
    (d.intervenciones||[]).forEach(i=>events.push({...i,_pieza:num,_tipo:'intervencion'}));
  });
  return events.sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||''));
}

function renderHistorial(filtered=null){
  const p=getActivePatient();
  if(!p) return;
  const events=filtered!==null?filtered:getAllEvents(p);
  const tl=document.getElementById('timeline');

  if(!events.length){
    tl.innerHTML=`<div class="timeline-empty">Sin registros clínicos. Use el odontograma para registrar patologías e intervenciones.</div>`;
    return;
  }

  tl.innerHTML=events.map((ev,i)=>{
    const isLast=i===events.length-1;
    return `
    <div class="timeline-item">
      <div class="timeline-dot-col">
        <div class="timeline-dot ${ev._tipo}"></div>
        ${!isLast?'<div class="timeline-line"></div>':''}
      </div>
      <div class="timeline-card">
        <div class="timeline-card-header">
          <span class="timeline-type ${ev._tipo}">${ev._tipo==='patologia'?'Patología':'Intervención'}</span>
          <span class="timeline-date">${fmtDate(ev.fecha)}</span>
        </div>
        <div class="timeline-title">${esc(ev.tipo)}</div>
        <div class="timeline-meta">
          <span class="timeline-tag">🦷 ${esc(ev._pieza)}</span>
          ${ev.estado   ?`<span class="timeline-tag">${esc(ev.estado)}</span>`:''}
          ${ev.gravedad ?`<span class="timeline-tag">${esc(ev.gravedad)}</span>`:''}
          ${ev.profesional?`<span class="timeline-tag">Dr. ${esc(ev.profesional)}</span>`:''}
          ${ev.material ?`<span class="timeline-tag">${esc(ev.material)}</span>`:''}
        </div>
        ${ev.nota||ev.descripcion?`<div class="timeline-note">${esc(ev.nota||ev.descripcion)}</div>`:''}
      </div>
    </div>`;
  }).join('');
}

function applyFilters(){
  const p=getActivePatient();
  if(!p) return;
  const desde=document.getElementById('filtFechaDesde').value;
  const hasta=document.getElementById('filtFechaHasta').value;
  const pieza=document.getElementById('filtPieza').value.trim();
  const tipo =document.getElementById('filtTipo').value;
  let events=getAllEvents(p);
  if(desde) events=events.filter(e=>(e.fecha||'')>=desde);
  if(hasta) events=events.filter(e=>(e.fecha||'')<=hasta);
  if(pieza) events=events.filter(e=>e._pieza===pieza);
  if(tipo)  events=events.filter(e=>e._tipo===tipo);
  renderHistorial(events);
}

/* ══════════════════════════════════════════
   12. GALERÍA DE IMÁGENES (con Lightbox)
══════════════════════════════════════════ */
function renderGallery(){
  const p=getActivePatient();
  if(!p) return;
  const gallery=document.getElementById('gallery');
  gallery.innerHTML='';
  if(!(p.imagenes||[]).length){
    gallery.innerHTML=`<div class="gallery-empty">Sin imágenes añadidas aún.</div>`;
    return;
  }
  p.imagenes.forEach(img=>{
    const item=document.createElement('div');
    item.className='gallery-item';
    item.innerHTML=`
      <img src="${img.data}" alt="${esc(img.name)}" loading="lazy"/>
      <div class="gallery-overlay">
        <button class="gallery-btn gallery-view"  aria-label="Ver imagen ${esc(img.name)}" data-id="${img.id}">
          <svg viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4.5" stroke="currentColor" stroke-width="1.5"/><path d="M10.5 10.5 L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        </button>
        <button class="gallery-btn gallery-delete" aria-label="Eliminar imagen ${esc(img.name)}" data-id="${img.id}">
          <svg viewBox="0 0 16 16" fill="none"><path d="M3 4h10M5 4V3h6v1M4 4l1 9h6l1-9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
      <div class="gallery-name">${esc(img.name)}</div>`;
    item.querySelector('.gallery-view').addEventListener('click',  ()=>openLightbox(img.id));
    item.querySelector('.gallery-delete').addEventListener('click',()=>deleteImage(img.id));
    gallery.appendChild(item);
  });
}

function addImages(files){
  const p=getActivePatient();
  if(!p) return;
  if(!files.length) return;
  let count=0;
  const total=Array.from(files).filter(f=>f.type.startsWith('image/')).length;
  if(!total){ showToast('Solo se admiten imágenes','error'); return; }
  Array.from(files).forEach(file=>{
    if(!file.type.startsWith('image/')) return;
    // Comprimir si supera 1MB
    if(file.size>1048576){
      compressImage(file, b64=>{ pushImage(p,file.name,b64); count++; if(count===total){ saveData(); renderGallery(); showToast(`${count} imagen(es) añadida(s)`,'success'); }});
    } else {
      const reader=new FileReader();
      reader.onload=e=>{ pushImage(p,file.name,e.target.result); count++; if(count===total){ saveData(); renderGallery(); showToast(`${count} imagen(es) añadida(s)`,'success'); }};
      reader.readAsDataURL(file);
    }
  });
}

function compressImage(file, callback){
  const canvas=document.createElement('canvas');
  const img=new Image();
  const url=URL.createObjectURL(file);
  img.onload=()=>{
    const MAX=1200;
    let w=img.width, h=img.height;
    if(w>MAX){ h=Math.round(h*MAX/w); w=MAX; }
    canvas.width=w; canvas.height=h;
    canvas.getContext('2d').drawImage(img,0,0,w,h);
    URL.revokeObjectURL(url);
    callback(canvas.toDataURL('image/jpeg',0.82));
  };
  img.src=url;
}

function pushImage(p, name, data){
  if(!p.imagenes) p.imagenes=[];
  p.imagenes.push({id:uuid(), name, data});
}

function deleteImage(imgId){
  const p=getActivePatient();
  if(!p||!confirm('¿Eliminar esta imagen?')) return;
  p.imagenes=(p.imagenes||[]).filter(i=>i.id!==imgId);
  saveData();
  renderGallery();
  showToast('Imagen eliminada','info');
}

/* ── Lightbox ── */
function openLightbox(imgId){
  const p=getActivePatient();
  if(!p) return;
  const img=p.imagenes.find(i=>i.id===imgId);
  if(!img) return;
  state.lightboxId=imgId;
  document.getElementById('lightboxImg').src=img.data;
  document.getElementById('lightboxName').textContent=img.name;
  document.getElementById('lightboxModal').hidden=false;
}

function closeLightbox(){
  document.getElementById('lightboxModal').hidden=true;
  state.lightboxId=null;
}

function lightboxNavigate(dir){
  const p=getActivePatient();
  if(!p||!state.lightboxId) return;
  const imgs=p.imagenes;
  const idx=imgs.findIndex(i=>i.id===state.lightboxId);
  const next=((idx+dir)+imgs.length)%imgs.length;
  state.lightboxId=imgs[next].id;
  document.getElementById('lightboxImg').src=imgs[next].data;
  document.getElementById('lightboxName').textContent=imgs[next].name;
}

/* ══════════════════════════════════════════
   13. PANEL RESUMEN CLÍNICO
══════════════════════════════════════════ */
function renderResumen(){
  const p=getActivePatient();
  if(!p) return;
  let caries=0,implantes=0,extracciones=0,endodoncias=0,coronas=0,patActivas=0,total=0;
  let lastDate='';

  Object.values(p.dientes||{}).forEach(d=>{
    (d.patologias||[]).forEach(pat=>{
      total++;
      if(['Caries','Caries recurrente'].includes(pat.tipo)) caries++;
      if(pat.estado==='Activo') patActivas++;
      if(pat.fecha>lastDate) lastDate=pat.fecha;
    });
    (d.intervenciones||[]).forEach(inv=>{
      total++;
      if(inv.tipo==='Implante')   implantes++;
      if(inv.tipo==='Extracción') extracciones++;
      if(inv.tipo==='Endodoncia') endodoncias++;
      if(inv.tipo==='Corona')     coronas++;
      if(inv.fecha>lastDate) lastDate=inv.fecha;
    });
  });

  const stats=[
    {label:'Patologías activas', value:patActivas, color:'var(--danger)',         bg:'var(--danger-light)',
     icon:`<circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.5"/><path d="M10 7v3.5M10 13h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`},
    {label:'Caries',             value:caries,     color:'#e53935',               bg:'#ffebee',
     icon:`<path d="M8 3C6 3 4 6 4 9C4 12 6 15 8.5 15C10 15 10.5 13.5 11 12C11.5 13.5 12 15 13.5 15C16 15 18 12 18 9C18 6 16 3 14 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/>`},
    {label:'Implantes',          value:implantes,  color:'var(--color-implante)',  bg:'#e3f2fd',
     icon:`<rect x="8" y="3" width="4" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M6 5.5h8M6 10h8M6 14.5h8" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>`},
    {label:'Extracciones',       value:extracciones,color:'var(--warning)',        bg:'var(--warning-light)',
     icon:`<path d="M7 4L13 4C15 4 17 6 17 9C17 12 15 16 10 16C5 16 3 12 3 9C3 6 5 4 7 4Z M9 4V7M13 4V7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/>`},
    {label:'Endodoncias',        value:endodoncias, color:'#8e24aa',               bg:'#f3e5f5',
     icon:`<path d="M10 3C8 3 6 5 6 8V17H14V8C14 5 12 3 10 3Z M10 10V17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/>`},
    {label:'Coronas',            value:coronas,     color:'#f57c00',               bg:'#fff8e1',
     icon:`<path d="M4 15L6 5L10 9L14 4L18 9L20 5L22 15Z M4 15H20" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none" transform="scale(0.85) translate(1,1)"/>`},
    {label:'Total registros',    value:total,       color:'var(--accent)',          bg:'var(--accent-light)',
     icon:`<path d="M4 5h12M4 9h8M4 13h10M4 17h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`},
  ];

  const grid=document.getElementById('statsGrid');
  grid.innerHTML=stats.map(s=>`
    <div class="stat-card">
      <div class="stat-icon" style="background:${s.bg};color:${s.color}">
        <svg viewBox="0 0 20 20" fill="none">${s.icon}</svg>
      </div>
      <div class="stat-value" style="color:${s.color==='var(--danger)'?s.color:'var(--text-primary)'}">${s.value}</div>
      <div class="stat-label">${s.label}</div>
    </div>`).join('');

  const alergiasBadge=p.alergias
    ?`<span class="alert-badge">⚠ ${esc(p.alergias.substring(0,60))}${p.alergias.length>60?'…':''}</span>`:'';

  document.getElementById('lastVisitBar').innerHTML=`
    <div class="last-visit-inner">
      <div class="last-visit-info">
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" style="width:18px;height:18px;flex-shrink:0;color:var(--accent)">
          <rect x="3" y="4" width="14" height="13" rx="2" stroke="currentColor" stroke-width="1.5"/>
          <path d="M7 2v3M13 2v3M3 9h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        <span>Última actividad: <strong>${lastDate?fmtDate(lastDate):'Sin registros'}</strong></span>
      </div>
      ${alergiasBadge}
    </div>`;
}

/* ══════════════════════════════════════════
   14. EXPORTAR PDF (mejorado)
══════════════════════════════════════════ */
function exportPDF(){
  const p=getActivePatient();
  if(!p){ showToast('Selecciona un paciente primero','error'); return; }
  if(!window.jspdf){ showToast('Biblioteca PDF no disponible (sin conexión)','error'); return; }

  const {jsPDF}=window.jspdf;
  const doc=new jsPDF({unit:'mm',format:'a4',orientation:'portrait'});
  const W=210, M=18;
  let y=0;

  const BLUE=[29,110,222], DBLUE=[13,60,140], GREY=[75,85,99];
  const LGREY=[245,247,250], WHITE=[255,255,255], RED=[220,38,38];

  // ── Cabecera con degradado simulado ──
  doc.setFillColor(...BLUE);
  doc.rect(0,0,W,36,'F');
  // Franja oscura inferior de la cabecera
  doc.setFillColor(...DBLUE);
  doc.rect(0,28,W,8,'F');

  doc.setTextColor(...WHITE);
  doc.setFont('helvetica','bold');
  doc.setFontSize(22);
  doc.text('OdontoHC',M,15);
  doc.setFont('helvetica','normal');
  doc.setFontSize(9);
  doc.text('Historia Clínica Dental Digital',M,21);
  doc.setFontSize(8);
  doc.text(`Fecha: ${fmtDate(today())}`, W-M, 21,{align:'right'});
  doc.setFont('helvetica','bold');
  doc.setFontSize(11);
  doc.text(`${p.nombre} ${p.apellidos}`,M,33);
  doc.setFont('helvetica','normal');
  doc.setFontSize(9);
  doc.text(`NHC: ${p.nhc||'—'}  ·  DNI: ${p.dni||'—'}`, W-M, 33,{align:'right'});

  y=46;

  // ── Datos administrativos ──
  doc.setFillColor(...LGREY);
  doc.roundedRect(M,y,W-2*M,52,3,3,'F');

  doc.setTextColor(...DBLUE);
  doc.setFont('helvetica','bold');
  doc.setFontSize(9);
  doc.text('DATOS DEL PACIENTE',M+4,y+7);

  const rows=[
    ['Nombre completo',`${p.nombre||''} ${p.apellidos||''}`,'Sexo',p.sexo==='M'?'Masculino':p.sexo==='F'?'Femenino':p.sexo||'—'],
    ['Fecha nacimiento',`${fmtDate(p.fechaNacimiento)} ${p.fechaNacimiento?'('+calcAge(p.fechaNacimiento)+')':''}`, 'Teléfono',p.telefono||'—'],
    ['Dirección',p.direccion||'—','Email',p.email||'—'],
  ];
  doc.setFontSize(8.5);
  let ry=y+13;
  rows.forEach(row=>{
    const [l1,v1,l2,v2]=row;
    doc.setFont('helvetica','bold'); doc.setTextColor(...GREY); doc.text(l1+':',M+4,ry);
    doc.setFont('helvetica','normal'); doc.text(String(v1).substring(0,45),M+33,ry);
    if(l2){ doc.setFont('helvetica','bold'); doc.text(l2+':',M+95,ry);
            doc.setFont('helvetica','normal'); doc.text(String(v2).substring(0,28),M+113,ry); }
    ry+=8;
  });
  y+=58;

  // ── Datos médicos ──
  if(p.alergias||p.medicacion||p.enfermedades){
    doc.setFillColor(255,232,232);
    doc.roundedRect(M,y,W-2*M,1,'F');// línea roja
    doc.setFillColor(255,245,245);
    doc.roundedRect(M,y,W-2*M,34,3,3,'F');
    doc.setFillColor(RED[0],RED[1],RED[2]);
    doc.rect(M,y,3,34,'F');

    doc.setFont('helvetica','bold');
    doc.setTextColor(...RED);
    doc.setFontSize(9);
    doc.text('⚠  DATOS MÉDICOS RELEVANTES',M+6,y+7);
    doc.setFont('helvetica','normal');
    doc.setTextColor(...GREY);
    doc.setFontSize(8.5);
    let my=y+13;
    if(p.alergias){
      doc.setFont('helvetica','bold'); doc.text('Alergias:',M+6,my);
      doc.setFont('helvetica','normal');
      const lines=doc.splitTextToSize(p.alergias.substring(0,120),W-2*M-40);
      doc.text(lines,M+26,my); my+=lines.length*4.5+2;
    }
    if(p.medicacion){
      doc.setFont('helvetica','bold'); doc.text('Medicación:',M+6,my);
      doc.setFont('helvetica','normal');
      doc.text(p.medicacion.substring(0,100),M+30,my); my+=7;
    }
    if(p.enfermedades){
      doc.setFont('helvetica','bold'); doc.text('Enfermedades:',M+6,my);
      doc.setFont('helvetica','normal');
      doc.text(p.enfermedades.substring(0,100),M+34,my);
    }
    y+=40;
  }

  // ── Odontograma codificado en texto ──
  y+=4;
  doc.setFillColor(...BLUE);
  doc.setTextColor(...WHITE);
  doc.setFont('helvetica','bold');
  doc.setFontSize(9);
  doc.roundedRect(M,y,W-2*M,7,2,2,'F');
  doc.text('ODONTOGRAMA',M+4,y+5);
  y+=12;

  // Leyenda colores
  const legItems=[
    ['Sano',[200,230,201]],['Patología activa',[239,83,80]],['Seguimiento',[255,179,0]],
    ['Tratado',[102,187,106]],['Implante',[66,165,250]],['Ausente',[189,189,189]],
  ];
  let lx=M;
  legItems.forEach(([label,col])=>{
    doc.setFillColor(...col);
    doc.roundedRect(lx,y,3,3,0.5,0.5,'F');
    doc.setTextColor(...GREY);
    doc.setFont('helvetica','normal');
    doc.setFontSize(7);
    doc.text(label,lx+4.5,y+2.5);
    lx+=28;
  });
  y+=8;

  // Representación cuadrícula de dientes
  const buildOdontRow = (nums, archLabel) => {
    doc.setTextColor(...GREY);
    doc.setFontSize(7);
    doc.setFont('helvetica','bold');
    doc.text(archLabel, M, y+3);
    const cellW=8, cellH=7, startX=M+24;
    nums.forEach((num,i)=>{
      const x=startX+i*cellW;
      const col=toothColor(p,num);
      const fills={null:[220,237,220],ausente:[224,224,224],patologia:[239,83,80],seguimiento:[255,224,102],tratado:[165,214,167],implante:[187,222,251]};
      doc.setFillColor(...(fills[col]||fills[null]));
      doc.roundedRect(x,y,cellW-1,cellH,1,1,'F');
      doc.setDrawColor(180,180,180);
      doc.roundedRect(x,y,cellW-1,cellH,1,1,'S');
      doc.setTextColor(50,50,50);
      doc.setFont('helvetica','normal');
      doc.setFontSize(5.5);
      doc.text(String(num),x+1.2,y+cellH-1.5);
    });
    y+=cellH+3;
  };

  buildOdontRow(ARCHES.upper,'S →');
  buildOdontRow(ARCHES.lower,'I →');
  y+=4;

  // ── Historial clínico ──
  const events=getAllEvents(p);
  if(events.length){
    if(y>200){ doc.addPage(); y=20; }
    doc.setFillColor(...BLUE);
    doc.setTextColor(...WHITE);
    doc.setFont('helvetica','bold');
    doc.setFontSize(9);
    doc.roundedRect(M,y,W-2*M,7,2,2,'F');
    doc.text('HISTORIAL CLÍNICO',M+4,y+5);
    y+=12;

    const head=[['Fecha','Tipo','Pieza','Procedimiento','Estado/Prof.','Obs.']];
    const body=events.slice(0,60).map(ev=>[
      fmtDate(ev.fecha),
      ev._tipo==='patologia'?'Patología':'Intervención',
      ev._pieza,
      (ev.tipo||'').substring(0,28),
      (ev.estado||ev.profesional||'—').substring(0,18),
      (ev.nota||ev.descripcion||ev.observaciones||'').substring(0,22),
    ]);

    doc.autoTable({
      startY:y, head, body,
      margin:{left:M,right:M},
      styles:{fontSize:7.5,cellPadding:2,font:'helvetica'},
      headStyles:{fillColor:BLUE,textColor:WHITE,fontStyle:'bold'},
      alternateRowStyles:{fillColor:LGREY},
      columnStyles:{0:{cellWidth:20},1:{cellWidth:20},2:{cellWidth:11},3:{cellWidth:55},4:{cellWidth:32},5:{cellWidth:36}},
    });
    y=doc.lastAutoTable.finalY+8;
  }

  // ── Observaciones ──
  if(p.observaciones){
    if(y>245){ doc.addPage(); y=20; }
    doc.setFillColor(...LGREY);
    doc.roundedRect(M,y,W-2*M,28,3,3,'F');
    doc.setTextColor(...DBLUE);
    doc.setFont('helvetica','bold');
    doc.setFontSize(9);
    doc.text('OBSERVACIONES',M+4,y+7);
    doc.setFont('helvetica','normal');
    doc.setTextColor(...GREY);
    doc.setFontSize(8.5);
    const obsLines=doc.splitTextToSize(p.observaciones.substring(0,300),W-2*M-10);
    doc.text(obsLines,M+4,y+14);
    y+=32;
  }

  // ── Firma / pie ──
  if(y<240){
    doc.setDrawColor(200,200,200);
    doc.line(M,258,M+55,258);
    doc.setTextColor(150,150,150);
    doc.setFont('helvetica','normal');
    doc.setFontSize(7.5);
    doc.text('Firma del profesional',M,263);
    doc.line(W-M-55,258,W-M,258);
    doc.text('Fecha y sello',W-M-55,263);
  }

  // ── Pies de página ──
  const pages=doc.internal.getNumberOfPages();
  for(let i=1;i<=pages;i++){
    doc.setPage(i);
    doc.setFillColor(...DBLUE);
    doc.rect(0,286,W,11,'F');
    doc.setTextColor(...WHITE);
    doc.setFontSize(7);
    doc.setFont('helvetica','normal');
    doc.text('OdontoHC — Historia Clínica Dental Digital  |  José Manuel Fernández Carreira',M,292);
    doc.text(`Página ${i} de ${pages}`,W-M,292,{align:'right'});
  }

  doc.save(`HC_${(p.apellidos||'paciente').replace(/\s+/g,'_')}_${(p.nombre||'').replace(/\s+/g,'_')}.pdf`);
  showToast('PDF generado correctamente','success');
}

/* ══════════════════════════════════════════
   15. EXPORTAR / IMPORTAR JSON
══════════════════════════════════════════ */
function exportJSON(){
  const p=getActivePatient();
  if(!p){ showToast('Selecciona un paciente primero','error'); return; }
  const blob=new Blob([JSON.stringify(p,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=`HC_${(p.apellidos||'').replace(/\s+/g,'_')}_${(p.nombre||'').replace(/\s+/g,'_')}.json`;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),5000);
  showToast('Datos exportados en JSON','success');
}

function importJSON(file){
  if(!file) return;
  const reader=new FileReader();
  reader.onload=e=>{
    try {
      const data=JSON.parse(e.target.result);
      if(!data.nombre&&!data.apellidos) throw new Error('Sin nombre');
      const idx=state.patients.findIndex(p=>p.id===data.id);
      if(idx>=0){
        if(!confirm(`El paciente "${data.nombre} ${data.apellidos}" ya existe. ¿Sobrescribir sus datos?`)) return;
        state.patients[idx]=data;
      } else {
        if(!data.id) data.id=uuid();
        if(!data.imagenes) data.imagenes=[];
        if(!data.dientes)  data.dientes={};
        state.patients.push(data);
      }
      saveData(); renderSidebar(); selectPatient(data.id);
      showToast('Datos importados correctamente','success');
    } catch(err){ showToast('JSON inválido o corrupto','error'); }
  };
  reader.readAsText(file);
}

/* ══════════════════════════════════════════
   16. TEMA DÍA / NOCHE
══════════════════════════════════════════ */
function applyTheme(mode){
  document.body.classList.toggle('day-mode',  mode==='day');
  document.body.classList.toggle('night-mode',mode==='night');
  localStorage.setItem(LS_THEME, mode);
}
function toggleTheme(){
  applyTheme(document.body.classList.contains('day-mode')?'night':'day');
}

/* ══════════════════════════════════════════
   17. BÚSQUEDA GLOBAL
══════════════════════════════════════════ */
function renderSearchDropdown(query){
  const dd=document.getElementById('searchDropdown');
  const q=query.trim().toLowerCase();
  if(!q){ dd.innerHTML=''; dd.classList.remove('open'); return; }
  const results=state.patients.filter(p=>
    `${p.nombre} ${p.apellidos} ${p.dni||''} ${p.nhc||''}`.toLowerCase().includes(q)
  ).slice(0,7);
  if(!results.length){
    dd.innerHTML=`<div class="search-result-item" style="color:var(--text-muted)">Sin resultados</div>`;
    dd.classList.add('open');
    return;
  }
  dd.innerHTML=results.map(p=>
    `<div class="search-result-item" data-id="${p.id}" role="option">
       <strong>${esc(p.apellidos)}, ${esc(p.nombre)}</strong>
       <span style="float:right;color:var(--text-muted);font-size:11px">${esc(p.nhc||p.dni||'')}</span>
     </div>`
  ).join('');
  dd.classList.add('open');
  dd.querySelectorAll('[data-id]').forEach(el=>{
    el.addEventListener('click',()=>{
      selectPatient(el.dataset.id);
      document.getElementById('searchInput').value='';
      dd.classList.remove('open');
    });
  });
}

/* ══════════════════════════════════════════
   18. SIDEBAR MOBILE
══════════════════════════════════════════ */
function openMobileSidebar(){
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebarOverlay').classList.add('visible');
}
function closeMobileSidebar(){
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('visible');
}

/* ══════════════════════════════════════════
   19. TABS PRINCIPALES
══════════════════════════════════════════ */
function switchTab(tab){
  document.querySelectorAll('.tab-btn').forEach(b=>{
    b.classList.toggle('active',b.dataset.tab===tab);
    b.setAttribute('aria-selected',String(b.dataset.tab===tab));
  });
  document.querySelectorAll('.tab-content').forEach(c=>{
    c.classList.toggle('active',c.id===`tab-${tab}`);
  });
  if(tab==='odontograma') renderOdontograma();
  if(tab==='historial')   renderHistorial();
  if(tab==='imagenes')    renderGallery();
  if(tab==='resumen')     renderResumen();
}

/* ══════════════════════════════════════════
   20. EVENT LISTENERS
══════════════════════════════════════════ */
function initEventListeners(){

  // Nuevo paciente
  const openNew=()=>{
    document.getElementById('newPatientModal').hidden=false;
    document.getElementById('npNombre').focus();
  };
  document.getElementById('btnNuevoPaciente').addEventListener('click',openNew);
  document.getElementById('btnNuevoPacienteEmpty').addEventListener('click',openNew);
  document.getElementById('closeNewPatient').addEventListener('click',()=>{ document.getElementById('newPatientModal').hidden=true; });
  document.getElementById('cancelNewPatient').addEventListener('click',()=>{ document.getElementById('newPatientModal').hidden=true; });
  document.getElementById('newPatientModal').addEventListener('click',e=>{ if(e.target===document.getElementById('newPatientModal')) document.getElementById('newPatientModal').hidden=true; });

  document.getElementById('newPatientForm').addEventListener('submit',e=>{
    e.preventDefault();
    const f=e.target;
    const n=f.elements.nombre.value.trim();
    const ap=f.elements.apellidos.value.trim();
    if(!n||!ap){ showToast('Nombre y apellidos son obligatorios','error'); return; }
    const p=createPatient(n,ap,f.elements.dni.value);
    renderSidebar(); selectPatient(p.id);
    document.getElementById('newPatientModal').hidden=true;
    f.reset();
    showToast('Paciente creado','success');
  });

  // Formulario datos
  document.getElementById('fFechaNac').addEventListener('change',updateAgeDisplay);
  document.getElementById('patientForm').addEventListener('submit',e=>{
    e.preventDefault();
    const p=getActivePatient(); if(!p) return;
    const f=e.target;
    ['nhc','dni','nombre','apellidos','fechaNacimiento','sexo','direccion','telefono','email','alergias','medicacion','enfermedades','observaciones']
      .forEach(k=>{ const el=f.elements[k]; if(el) p[k]=el.value; });
    saveData(); renderSidebar(); showPatientView();
    showToast('Datos guardados','success');
  });

  // Eliminar paciente
  document.getElementById('btnDeletePatient').addEventListener('click',()=>{
    const p=getActivePatient(); if(!p) return;
    if(!confirm(`¿Eliminar definitivamente a ${p.nombre} ${p.apellidos}?\nNo se puede deshacer.`)) return;
    deletePatient(p.id); renderSidebar(); showPatientView();
    showToast('Paciente eliminado','info');
  });

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(b=>{
    b.addEventListener('click',()=>switchTab(b.dataset.tab));
  });

  // Modal diente
  document.getElementById('closeToothModal').addEventListener('click',closeToothModal);
  document.getElementById('toothModal').addEventListener('click',e=>{ if(e.target===document.getElementById('toothModal')) closeToothModal(); });
  document.querySelectorAll('.modal-tab').forEach(b=>{ b.addEventListener('click',()=>switchModalTab(b.dataset.mtab)); });

  // Patología submit
  document.getElementById('patologiaForm').addEventListener('submit',e=>{
    e.preventDefault();
    const p=getActivePatient(); if(!p||!currentTooth) return;
    const f=e.target;
    if(!f.elements.tipo.value){ showToast('Selecciona una patología','error'); return; }
    ensureTooth(p,currentTooth);
    p.dientes[currentTooth].patologias.push({
      tipo:f.elements.tipo.value, estado:f.elements.estado.value,
      gravedad:f.elements.gravedad.value, fecha:f.elements.fecha.value,
      nota:f.elements.nota.value.trim(),
    });
    saveData(); renderOdontograma(); renderHistorial(); renderResumen(); renderToothHistory(p,currentTooth);
    f.reset(); document.getElementById('pFecha').value=today();
    showToast('Patología registrada','success');
  });

  // Intervención submit
  document.getElementById('intervencionForm').addEventListener('submit',e=>{
    e.preventDefault();
    const p=getActivePatient(); if(!p||!currentTooth) return;
    const f=e.target;
    if(!f.elements.tipo.value){ showToast('Selecciona una intervención','error'); return; }
    ensureTooth(p,currentTooth);
    p.dientes[currentTooth].intervenciones.push({
      tipo:f.elements.tipo.value, fecha:f.elements.fecha.value,
      profesional:f.elements.profesional.value.trim(),
      material:f.elements.material.value.trim(),
      descripcion:f.elements.descripcion.value.trim(),
      observaciones:f.elements.observaciones.value.trim(),
    });
    saveData(); renderOdontograma(); renderHistorial(); renderResumen(); renderToothHistory(p,currentTooth);
    f.reset(); document.getElementById('iFecha').value=today();
    showToast('Intervención registrada','success');
  });

  // PDF / JSON
  document.getElementById('btnExportPDF').addEventListener('click',exportPDF);
  document.getElementById('btnExportJSON').addEventListener('click',exportJSON);
  document.getElementById('btnImportJSON').addEventListener('click',()=>document.getElementById('importFileInput').click());
  document.getElementById('importFileInput').addEventListener('change',e=>{ importJSON(e.target.files[0]); e.target.value=''; });

  // Filtros historial
  document.getElementById('btnFiltrar').addEventListener('click',applyFilters);
  document.getElementById('btnResetFiltros').addEventListener('click',()=>{
    ['filtFechaDesde','filtFechaHasta','filtPieza'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('filtTipo').value='';
    renderHistorial();
  });

  // Galería
  const dropzone=document.getElementById('dropzone');
  const fileInput=document.getElementById('fileInput');
  dropzone.addEventListener('click',()=>fileInput.click());
  dropzone.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' ') fileInput.click(); });
  fileInput.addEventListener('change',e=>{ addImages(e.target.files); e.target.value=''; });
  dropzone.addEventListener('dragover', e=>{ e.preventDefault(); dropzone.classList.add('dragging'); });
  dropzone.addEventListener('dragleave',()=>dropzone.classList.remove('dragging'));
  dropzone.addEventListener('drop',     e=>{ e.preventDefault(); dropzone.classList.remove('dragging'); addImages(e.dataTransfer.files); });

  // Lightbox
  document.getElementById('closeLightbox').addEventListener('click',closeLightbox);
  document.getElementById('lightboxModal').addEventListener('click',e=>{ if(e.target===document.getElementById('lightboxModal')) closeLightbox(); });
  document.getElementById('lightboxPrev').addEventListener('click',()=>lightboxNavigate(-1));
  document.getElementById('lightboxNext').addEventListener('click',()=>lightboxNavigate(1));

  // Tema
  document.getElementById('btnTheme').addEventListener('click',toggleTheme);

  // Acerca de
  document.getElementById('btnAbout').addEventListener('click',()=>{ document.getElementById('aboutModal').hidden=false; });
  document.getElementById('closeAbout').addEventListener('click',()=>{ document.getElementById('aboutModal').hidden=true; });
  document.getElementById('aboutModal').addEventListener('click',e=>{ if(e.target===document.getElementById('aboutModal')) document.getElementById('aboutModal').hidden=true; });

  // Búsqueda
  const si=document.getElementById('searchInput');
  si.addEventListener('input', e=>renderSearchDropdown(e.target.value));
  si.addEventListener('blur',  ()=>setTimeout(()=>document.getElementById('searchDropdown').classList.remove('open'),200));
  document.addEventListener('click',e=>{
    if(!document.querySelector('.topbar-search').contains(e.target))
      document.getElementById('searchDropdown').classList.remove('open');
  });

  // Hamburguesa mobile
  document.getElementById('menuBtn').addEventListener('click',()=>{
    const open=document.getElementById('sidebar').classList.contains('open');
    open?closeMobileSidebar():openMobileSidebar();
  });
  document.getElementById('sidebarOverlay').addEventListener('click',closeMobileSidebar);

  // Escape global
  document.addEventListener('keydown',e=>{
    if(e.key!=='Escape') return;
    if(!document.getElementById('lightboxModal').hidden) closeLightbox();
    else if(!document.getElementById('toothModal').hidden) closeToothModal();
    else if(!document.getElementById('aboutModal').hidden) document.getElementById('aboutModal').hidden=true;
    else if(!document.getElementById('newPatientModal').hidden) document.getElementById('newPatientModal').hidden=true;
  });

  // Lightbox: teclado
  document.addEventListener('keydown',e=>{
    if(document.getElementById('lightboxModal').hidden) return;
    if(e.key==='ArrowLeft')  lightboxNavigate(-1);
    if(e.key==='ArrowRight') lightboxNavigate(1);
  });
}

/* ══════════════════════════════════════════
   21. INICIALIZACIÓN
══════════════════════════════════════════ */
function init(){
  applyTheme(localStorage.getItem(LS_THEME)||'day');
  loadData();
  renderSidebar();

  if(state.patients.length){
    selectPatient(state.patients[0].id);
  } else {
    document.getElementById('emptyState').hidden=false;
    document.getElementById('patientView').hidden=true;
  }

  initEventListeners();
  console.log(`%cOdontoHC v1.1 listo — ${state.patients.length} paciente(s)`,
    'color:#1d6ede;font-weight:bold;font-size:13px');
}

document.addEventListener('DOMContentLoaded', init);
