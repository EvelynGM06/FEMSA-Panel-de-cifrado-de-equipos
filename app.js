
/* ------------------------------------------------------------------ *
 * 1. Datos: se desempacan las columnas a una lista de equipos
 * ------------------------------------------------------------------ */
const META = DATOS.meta;
const EQUIPOS = (() => {
  const {n, cols} = DATOS.equipos, filas = new Array(n);
  const nombres = Object.keys(cols);
  for (let i = 0; i < n; i++) {
    const f = {};
    for (const c of nombres) {
      const col = cols[c];
      if (col.c) f[c] = col.v[i] < 0 ? null : col.c[col.v[i]];
      else if (col.b) f[c] = col.b[i] === 1;
      else f[c] = col.n[i];
    }
    f.cif = f.estado_cifrado === 'Encrypted' ? 'cif' : f.estado_cifrado === 'Not encrypted' ? 'noc' : 'sd';
    f.inconsistente = f.flag_compliant_sin_cifrar || f.flag_success_sin_cifrar || f.flag_config_incoherente_sin_cifrar
                      || f.flag_not_ready_pero_cifrado || f.flag_ready_pero_no_cifrado;
    f.con_alerta = f.cif !== 'cif' || f.windows10_fuera_de_soporte || f.flag_tpm_obsoleto || f.inactivo_mas_90d;
    filas[i] = f;
  }
  return filas;
})();

/* ------------------------------------------------------------------ *
 * 2. Utilidades
 * ------------------------------------------------------------------ */
const fmt = x => (x ?? 0).toLocaleString('es-MX');
const pl = (n, uno, varios = uno + 's') => n === 1 ? uno : varios;   // pl(1, 'registro') → «registro»
const pct = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : '0.0%';
const pnum = (a, b) => b ? 100 * a / b : 0;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const contar = (lista, fn) => lista.reduce((s, x) => s + (fn(x) ? 1 : 0), 0);
const agrupar = (lista, fn) => { const m = new Map(); for (const x of lista) { const k = fn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; };
const FUENTE = {'MDM + AD':'MDM+AD', 'AD':'Solo AD', 'MDM':'Solo MDM', 'Inventario macOS':'Inventario macOS'};
const fuente = f => FUENTE[f.fuente_datos] || f.fuente_datos;
const soCorto = f => f.version_generica ? f.version_so.replace(' (genérico)', '') : (f.build_so ? `10.0.${f.build_so}.x` : f.version_so);
const kpi = (t, v, s, cls = '') => `<div class="card kpi"><div class="t">${t}</div><div class="v num ${cls}">${v}</div><div class="s">${s}</div></div>`;
const card = (titulo, cuerpo, cls = '') => `<div class="card ${cls}"><h3>${titulo}</h3>${cuerpo}</div>`;

/* Semáforo: sale del puntaje (0 a 100). Los pesos y los cortes viven en META.semaforo (SEMAFORO en panel.py). */
function semaforoDe(puntos) {
  const s = META.semaforo;
  if (puntos >= s.verde_desde) return ['Verde', 'var(--verde)'];
  if (puntos >= s.ambar_desde) return ['Ámbar', 'var(--ambar)'];
  return ['Rojo', 'var(--rojo)'];
}
const NIVEL_SEM = {Rojo: 0, 'Ámbar': 1, Verde: 2};
/* Los cinco conceptos que restan puntos. «txt» completa la frase de «Principal problema». */
const CONCEPTOS = [
  {k: 'sd',  peso: 'sin_dato',        f: f => f.cif === 'sd',                txt: 'sin dato de cifrado'},
  {k: 'nc',  peso: 'sin_cifrar',      f: f => f.cif === 'noc',               txt: 'sin cifrar'},
  {k: 'w',   peso: 'windows10',       f: f => f.windows10_fuera_de_soporte,  txt: 'con Windows 10 sin actualizar'},
  {k: 'ina', peso: 'inactivos',       f: f => f.inactivo_mas_90d,            txt: 'inactivos más de 90 días'},
  {k: 'inc', peso: 'inconsistencias', f: f => f.inconsistente,               txt: 'con datos inconsistentes'},
];
/* Puntaje de un grupo de equipos L: 100 − Σ (peso × % del concepto), sin bajar de 0. Devuelve los % de cada concepto
 * (sd, nc, w, ina, inc), el puntaje, el semáforo y el concepto que más puntos resta («problema», con su cantidad). */
function puntuar(L) {
  const n = L.length, P = META.semaforo.pesos, r = {n};
  let resta = 0, mayor = null;
  for (const c of CONCEPTOS) {
    const cant = contar(L, c.f), p = pnum(cant, n), pts = P[c.peso] * p;
    r[c.k] = p; resta += pts;
    if (cant && (!mayor || pts > mayor.pts)) mayor = {c, cant, pts};
  }
  r.puntos = Math.max(0, Math.round(100 - resta));   // entero: lo que se ve en la tabla es lo que decide el color
  r.sem = semaforoDe(r.puntos);
  r.afectados = mayor ? mayor.cant : 0;
  r.problema = mayor ? `${fmt(mayor.cant)} ${pl(mayor.cant, 'equipo')} ${mayor.c.txt} (${pct(mayor.cant, n)})` : '';
  r.cif = pnum(contar(L, f => f.cif === 'cif'), n);
  r.mac = contar(L, f => f.en_macos);   // equipos macOS del grupo: ya cuentan en «sin dato» y se muestran aparte para que crezcan a la vista
  return r;
}

/* Barras horizontales: items = [{et, v, txt, cls, resaltar, titulo}] */
function hbars(items, max) {
  max = max || Math.max(1, ...items.map(i => i.v));
  return `<div class="hbar">` + items.map(i => `
    <div class="et" title="${esc(i.et)}">${i.resaltar ? '<b>' + esc(i.et) + '</b>' : esc(i.et)}</div>
    <div class="pista ${i.resaltar ? 'resaltada' : ''}" title="${esc(i.titulo || i.et + ': ' + i.txt)}">
      <div class="relleno ${i.cls || 'c-cif'}" style="width:${(100 * i.v / max).toFixed(2)}%"></div></div>
    <div class="val">${i.resaltar ? '<b>' + i.txt + '</b>' : i.txt}</div>`).join('') + `</div>`;
}

/* Las 5 categorías de cifrado efectivo (mutuamente excluyentes). cls = color de leyenda; color = relleno en SVG. */
const CAT_EFECTIVO = [
  {et: 'Cifrado conforme', cls: 'c-cif', color: 'var(--cifrado)'},
  {et: 'Cifrado con desviación', cls: 'c-desv', color: 'var(--naranja)'},
  {et: 'Cifrado sin validar configuración', cls: 'c-sinval', color: 'var(--ambar-grafica)'},
  {et: 'No cifrado', cls: 'c-noc', color: 'var(--sin-cifrar)'},
  {et: 'Sin dato', cls: 'c-sd', trama: true},
];

/* Barra apilada de las 5 categorías de cifrado efectivo (cifrado conforme, con desviación, sin validar, no cifrado, sin dato) */
function barraCifrado(R) {
  const n = R.length;
  const cats = CAT_EFECTIVO.map(c => ({...c, v: contar(R, f => f.cifrado_efectivo === c.et)}));
  const cif = cats[0].v + cats[1].v + cats[2].v;
  const seg = c => c.v ? `<div class="seg ${c.cls}" style="flex:${c.v}" title="${c.et}: ${fmt(c.v)} (${pct(c.v, n)})"></div>` : '';
  return `<div class="barra cinco" role="img" aria-label="${cats.map(c => `${c.et} ${pct(c.v, n)}`).join(', ')}">${cats.map(seg).join('')}</div>
    <div class="leyenda">${cats.map(c => `<span><i class="${c.cls}"></i>${c.et} <b class="num">${fmt(c.v)}</b> · ${pct(c.v, n)}</span>`).join('')}</div>
    <p class="resumen-cifrado">Cifrado en total: <b class="num">${fmt(cif)}</b> · ${pct(cif, n)} (conforme + con desviación + sin validar configuración).</p>`;
}

/* Dona en SVG sin librerías. items = [{et, v, cls, color | trama}]. Devuelve la dona con su leyenda (texto + número,
 * así el color nunca es el único indicador). Con 0 equipos dibuja un anillo vacío. */
let _donaN = 0;
function dona(items, {centro = '', sub = '', etiqueta = '', unidad = ''} = {}) {
  const id = 'dona' + (++_donaN), total = items.reduce((s, i) => s + i.v, 0), r = 46, c = 2 * Math.PI * r;
  let acum = 0, arcos = '';
  if (total) {
    for (const i of items) {
      if (!i.v) continue;
      const largo = Math.max(c * i.v / total - 1.6, 0.8);                    // 1.6 de hueco entre segmentos
      arcos += `<circle cx="60" cy="60" r="${r}" fill="none" stroke-width="18" transform="rotate(-90 60 60)"
        ${i.trama ? `stroke="url(#${id}t)"` : `style="stroke:${i.color}"`} stroke-dasharray="${largo.toFixed(3)} ${(c - largo).toFixed(3)}"
        stroke-dashoffset="${(-acum).toFixed(3)}"><title>${esc(i.et)}: ${fmt(i.v)} (${pct(i.v, total)})</title></circle>`;
      acum += c * i.v / total;
    }
  } else arcos = `<circle cx="60" cy="60" r="${r}" fill="none" stroke-width="18" style="stroke:var(--borde)"/>`;
  const aria = total ? `${etiqueta}: ` + items.map(i => `${i.et} ${fmt(i.v)} (${pct(i.v, total)})`).join(', ') : `${etiqueta}: sin equipos con este filtro`;
  return `<div class="dona-wrap"><svg viewBox="0 0 120 120" role="img" aria-label="${esc(aria)}">
      <defs><pattern id="${id}t" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#d8d8d4"/><rect width="2.4" height="6" fill="#8f8f8b"/></pattern></defs>
      ${arcos}
      <text x="60" y="${sub ? 59 : 65}" text-anchor="middle" font-size="${total ? 17 : 10}" font-weight="700" fill="var(--tinta)">${total ? esc(centro) : 'Sin equipos'}</text>
      ${sub && total ? `<text x="60" y="74" text-anchor="middle" font-size="8.5" fill="var(--tinta2)">${esc(sub)}</text>` : ''}</svg>
    <ul class="dona-leyenda">${items.map(i => `<li><i class="${i.cls}"></i><span>${esc(i.et)} <b class="num">${fmt(i.v)}</b>${unidad ? ' ' + unidad(i.v) : ' · ' + pct(i.v, total)}</span></li>`).join('')}</ul></div>`;
}

/* Matriz de cruce con celdas resaltadas */
function matriz(titFila, titCol, filas, cols, valor, resaltar = {}) {
  let h = `<div class="tabla"><table class="matriz"><thead><tr><th>${titFila} ↓ / ${titCol} →</th>${cols.map(c => `<th class="n">${c.et}</th>`).join('')}</tr></thead><tbody>`;
  for (const f of filas) {
    h += `<tr><td><b>${f.et}</b></td>` + cols.map(c => {
      const k = f.et + '|' + c.et, cls = resaltar[k] ? 'alerta-' + resaltar[k] : '';
      return `<td class="n ${cls}">${fmt(valor(f, c))}</td>`;
    }).join('') + `</tr>`;
  }
  return h + `</tbody></table></div>`;
}

/* Tablas con paginación y descarga CSV */
const TABLAS = {}, PAGINA = {};
function tabla(clave, columnas, filas, {porPagina = 10, csv = null, vacio = 'Sin equipos con este filtro.', nowrap = false} = {}) {
  TABLAS[clave] = {columnas, filas, csv};
  const paginas = Math.max(1, Math.ceil(filas.length / porPagina));
  const p = Math.min(PAGINA[clave] || 0, paginas - 1); PAGINA[clave] = p;
  const vis = filas.slice(p * porPagina, (p + 1) * porPagina);
  let h = csv ? `<div class="acciones">${fmt(filas.length)} ${pl(filas.length, 'registro')}. <button class="btn" data-csv="${clave}" ${filas.length ? '' : 'disabled'}>Descargar CSV (${fmt(filas.length)})</button></div>` : '';
  if (!filas.length) return h + `<div class="vacio">${vacio}</div>`;
  h += `<div class="tabla"><table class="${nowrap ? 'nowrap' : ''}"><thead><tr>${columnas.map(c => `<th class="${c.n ? 'n' : ''}">${c.et}</th>`).join('')}</tr></thead><tbody>`;
  for (const f of vis) h += `<tr>${columnas.map(c => `<td class="${c.n ? 'n' : ''}">${c.html ? c.html(f) : esc(c.v(f))}</td>`).join('')}</tr>`;
  h += `</tbody></table></div>`;
  if (paginas > 1) h += `<div class="paginador"><button data-pag="${clave}" data-d="-1" ${p === 0 ? 'disabled' : ''} aria-label="Anterior">←</button>
     Página ${p + 1} de ${paginas} · ${fmt(filas.length)} registros
     <button data-pag="${clave}" data-d="1" ${p >= paginas - 1 ? 'disabled' : ''} aria-label="Siguiente">→</button></div>`;
  return h;
}
function descargarCSV(nombre, columnas, filas) {
  const q = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const txt = [columnas.map(c => q(c.et)).join(','), ...filas.map(f => columnas.map(c => q(c.v(f))).join(','))].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + txt], {type: 'text/csv;charset=utf-8'}));
  a.download = nombre + '_' + META.corte + '.csv'; document.body.appendChild(a); a.click(); a.remove();
}

/* Columnas reutilizables */
const C = {
  equipo: {et: 'Equipo', v: f => f.equipo_id},
  usuario: {et: 'Usuario', v: f => f.usuario_id ?? 'Sin usuario'},
  pais: {et: 'País', v: f => f.pais},
  region: {et: 'Región', v: f => f.region},
  fuente: {et: 'Fuente', v: fuente},
  so: {et: 'SO', v: soCorto},
  version: {et: 'Versión', v: f => f.version_so},
  tpm: {et: 'TPM', v: f => f.estado_tpm},
  ready: {et: 'Readiness', v: f => f.readiness_cifrado},
  cifrado: {et: 'Cifrado', v: f => f.estado_cifrado},
  tec: {et: 'Tecnología de cifrado', v: f => f.tecnologia_bitlocker},
  efectivo: {et: 'Cifrado efectivo', v: f => f.cifrado_efectivo},
  cum: {et: 'Cumplimiento', v: f => f.estado_cumplimiento},
  mes: {et: 'Mes último logon', v: f => f.mes_ultimo_logon ?? 'Sin dato'},
  meses: {et: 'Meses sin logon', n: 1, v: f => f.meses_desde_logon ?? ''},
  banda: {et: 'Recencia', v: f => f.banda_recencia === 'No disponible' ? 'Sin dato' : f.banda_recencia === '>180 días' ? 'Más de 180 días' : f.banda_recencia},
  cuenta: {et: 'Cuenta', v: f => f.estado_cuenta},
  motivo: {et: 'Motivo del hueco', v: f => f.motivo_sin_dato ?? ''},
};

/* ------------------------------------------------------------------ *
 * 3. Filtros globales
 * ------------------------------------------------------------------ */
const FILTROS = [
  {id: 'pais', et: 'País', v: f => f.pais},
  {id: 'region', et: 'Región', v: f => f.region},
  {id: 'fuente', et: 'Fuente de datos', v: fuente},
  {id: 'familia', et: 'Versión de SO', v: f => f.familia_so},
  {id: 'banda', et: 'Recencia de logon', v: f => C.banda.v(f)},
  {id: 'efectivo', et: 'Estado de cifrado efectivo', v: f => f.cifrado_efectivo},
];
const ESTADO = {filtros: {}, tab: 'resumen', hist: {a: null, b: null}, incidencia: null};
function filtrados() {
  const activos = FILTROS.filter(x =>
    Array.isArray(ESTADO.filtros[x.id]) &&
    ESTADO.filtros[x.id].length > 0
  );
  return EQUIPOS.filter(f =>
    activos.every(x =>
      ESTADO.filtros[x.id].includes(x.v(f))
    )
  );
}

function pintarFiltros() {
  const orden = ['0-30 días', '31-90 días', '91-180 días', 'Más de 180 días', 'Sin dato'];
  // El menú abierto (y su scroll) sobrevive al repintado, así se pueden marcar varias casillas seguidas
  const cont = document.getElementById('filtros');
  const abierto = cont.querySelector('details.filtro[open]');
  const abiertoId = abierto ? abierto.dataset.id : null, scrollLista = abierto ? abierto.querySelector('.opciones').scrollTop : 0;
  cont.innerHTML = FILTROS.map(x => {
  const otrosFiltros = FILTROS.filter(y =>
    y.id !== x.id &&
    Array.isArray(ESTADO.filtros[y.id]) &&
    ESTADO.filtros[y.id].length > 0
);
  const disponibles = EQUIPOS.filter(f =>
    otrosFiltros.every(y =>
      ESTADO.filtros[y.id].includes(y.v(f))
  )
);
let ops = [...new Set([
  ...disponibles.map(x.v),
  ...(ESTADO.filtros[x.id] || [])
])].filter(o => o !== null && o !== undefined && o !== '');
    ops.sort((a, b) => x.id === 'banda' ? orden.indexOf(a) - orden.indexOf(b) : String(a).localeCompare(String(b), 'es'));
    const sel = ESTADO.filtros[x.id] || [];
    const resumen = !sel.length ? 'Todos' : sel.length <= 2 ? sel.join(', ') : `${sel.length} seleccionados`;
    return `<details class="filtro${sel.length ? ' activo' : ''}" data-id="${x.id}"${x.id === abiertoId ? ' open' : ''}>
  <summary><span class="et">${x.et}</span><span class="valor">${esc(resumen)}</span></summary>
  <fieldset class="opciones"><legend class="sr-only">${x.et}</legend>
    ${ops.map(o => `<label><input type="checkbox" data-filtro="${x.id}" value="${esc(o)}"${sel.includes(o) ? ' checked' : ''}> ${esc(o)}</label>`).join('')}
  </fieldset>
</details>`;
  }).join('') + `<button class="btn" id="limpiar">Quitar filtros</button>`;
  if (abiertoId) cont.querySelector(`details[data-id="${abiertoId}"] .opciones`).scrollTop = scrollLista;
}

/* ------------------------------------------------------------------ *
 * 4. Pestañas (las del Entregable 2)
 * ------------------------------------------------------------------ */
const PESTANAS = [
  {id: 'resumen', et: 'Resumen ejecutivo', p: '¿Qué tan protegida está la flota?', g: 1},
  {id: 'visibilidad', et: 'Visibilidad y cobertura', p: '¿Qué equipos no estamos viendo?', g: 2},
  {id: 'riesgo', et: 'Equipos en riesgo', p: '¿Dónde actuamos primero?', g: 2},
  {id: 'cumplimiento', et: 'Cumplimiento de política', p: '¿Lo que dice el sistema es cierto?', g: 2},
  {id: 'usuarios', et: 'Usuarios', p: '¿Quién tiene el problema?', g: 2},
  {id: 'so', et: 'Sistemas operativos', p: '¿Cuántos equipos siguen en Windows 10 y dónde?', g: 2},
  {id: 'actividad', et: 'Actividad e inactivos', p: '¿Qué equipos ya no se usan?', g: 2},
  {id: 'paises', et: 'Países y regiones', p: '¿Cómo se compara cada país?', g: 1},
  {id: 'incidencias', et: 'Incidencias', p: '¿Qué problemas requieren atención?', g: 1},
  {id: 'calidad', et: 'Calidad de datos', p: '¿Qué tan confiable es el archivo y qué se limpió?', g: 2},
  {id: 'historico', et: 'Histórico', p: '¿Cómo cambió la flota entre dos cortes?', g: 1},
  {id: 'corte', et: 'Información del corte', p: '¿De dónde salen estos números y con qué reglas?', g: 1},
  {id: 'reportes', et: 'Reportes', p: '¿Cómo llevo esto a una junta o a una revisión técnica?', g: 1},
  {id: 'detalle', et: 'Detalle y descarga', p: 'Tabla completa para revisar o exportar a Excel', g: 2},
  {id: 'glosario', et: 'Glosario y ayuda', p: 'Términos para quien no es técnico', g: 2},
  {id: 'macos', et: 'Nota sobre macOS', p: '¿Por qué los equipos macOS van aparte?', g: 2},
];
function pintarTabs() {
  const fila = (g, nombre) => `<div class="fila ${g === 2 ? 'sec' : ''}" role="tablist" aria-label="${nombre}"><span class="grupo">${nombre}</span>` +
    PESTANAS.filter(t => t.g === g).map(t => `<button role="tab" aria-selected="${ESTADO.tab === t.id}" aria-controls="vista" data-tab="${t.id}" class="${ESTADO.tab === t.id ? 'activa' : ''}">${t.et}</button>`).join('') + `</div>`;
  document.getElementById('tabs').innerHTML = fila(1, 'Principales') + fila(2, 'Secundarias');
}

const VISTAS = {};
VISTAS.incidencias = R => {
  const HI = DATOS.historico || {}, catalogo = HI.catalogo_incidencias || [];
  // Variación contra el corte anterior: totales de cada corte completo (historial), no dependen de los filtros
  const filas = HI.filas || [], act = filas[filas.length - 1], prev = filas[filas.length - 2];
  const variacion = item => {
    if (!act || !prev) return null;
    const a = _num(act['inc_' + item.id]), b = _num(prev['inc_' + item.id]);
    return a === null || b === null ? null : a - b;
  };
  const fvar = v => v === null ? '—' : v === 0 ? '= sin cambio' : `${v > 0 ? '▲ +' : '▼ −'}${fmt(Math.abs(v))}`;
  // Mayor riesgo arriba: Alto, Medio, Bajo; dentro de cada nivel, más equipos primero
  const orden = {Alto: 0, Medio: 1, Bajo: 2};
  const incidencias = catalogo.map(item => ({...item, cantidad: R.filter(f => f[item.columna] === true).length, variacion: variacion(item)}))
    .sort((x, y) => (orden[x.nivel] ?? 9) - (orden[y.nivel] ?? 9) || y.cantidad - x.cantidad);
  return `
    <div class="card">
      <h3>Incidencias por atender</h3>
      <p>Equipos dentro del filtro: ${fmt(R.length)}</p>
      <div class="tabla"><table class="tabla-inc">
        <thead>
          <tr>
            <th>Incidencia</th>
            <th>Prioridad</th>
            <th>Criterio</th>
            <th>Variación vs corte anterior</th>
            <th>Equipos afectados</th>
          </tr>
        </thead>
      <tbody>
  ${incidencias.map(item => `
    <tr>
      <td>${esc(item.nombre)}</td>
      <td>${esc(item.nivel)}</td>
      <td>${esc(item.criterio)}</td>
      <td class="var-inc">${fvar(item.variacion)}</td>
      <td>
        <button data-ir-incidencia="${esc(item.columna)}">
          Ver ${fmt(item.cantidad)} ${pl(item.cantidad, 'equipo')}
        </button>
      </td>
    </tr>
  `).join('')}
</tbody>
      </table></div>
      <div class="nota">Ordenadas por prioridad (Alto, Medio, Bajo) y, dentro de cada una, por equipos afectados. ${act && prev ? `La variación compara los totales del corte ${esc(act.corte)} contra ${esc(prev.corte)} y no cambia con los filtros.` : 'La variación aparece cuando el historial tiene al menos 2 cortes.'} El nivel de prioridad es provisional (por validar con FEMSA).</div>
    </div>
  `;
};

/* Cálculos que usan el Resumen y el reporte ejecutivo */
const SIN_PAIS = 'Sin país';
function porPaisSemaforo(R) {
  return [...agrupar(R, f => f.pais)].map(([p, L]) => ({p: p === 'No disponible' ? SIN_PAIS : p, ...puntuar(L)}));
}
/* Los 3 hallazgos más urgentes, como tarjetas junto al indicador principal. Ordenados por lo que se puede hacer: lo que
 * se sabe que está mal, lo que no se puede saber y lo que dice cumplir sin estarlo. */
function hallazgos(R, ambito = 'del filtro') {
  const n = R.length, noc = contar(R, f => f.cif === 'noc'), sd = contar(R, f => f.cif === 'sd'), csin = contar(R, f => f.flag_compliant_sin_cifrar);
  const sdSinMdm = contar(R, f => f.cif === 'sd' && !f.en_mdm);
  return [
    {t: 'Equipos sin cifrar', v: fmt(noc), cls: 'rojo', s: `${pct(noc, n)} ${ambito}. Es la exposición confirmada.`},
    {t: 'Equipos sin dato de cifrado', v: fmt(sd), cls: 'gris',
     s: !sd ? 'Todos reportan su estado.' : !sdSinMdm ? `${pct(sd, n)} ${ambito}. No se puede confirmar su estado.`
        : sdSinMdm === sd ? `${pct(sd, n)} ${ambito}. Ninguno está en MDM, que es de donde sale el dato.` : `${pct(sd, n)} ${ambito}. ${fmt(sdSinMdm)} no están en MDM, que es de donde sale el dato.`},
    {t: 'Compliant que no están cifrados', v: fmt(csin), cls: 'ambar', s: 'Figuran como cumplidos, pero el disco no está cifrado.'},
  ];
}
/* Fila de indicadores del Resumen y del PDF ejecutivo: el principal (% cifrado, con su variación contra el corte anterior)
 * y los 3 hallazgos más urgentes. «clase» y «ambito» cambian entre la pantalla y el PDF. */
function indicadoresResumen(R, {clase = 'grid g-hallazgos', ambito = 'del filtro'} = {}) {
  const n = R.length, c = contar(R, f => f.cif === 'cif');
  const C = cambioContraAnterior(), dc = C.filas.find(x => x.et === '% cifrado');
  const delta = dc && dc.v !== null ? `<div class="delta ${dc.mejora === null ? '' : dc.mejora ? 'var-bien' : 'var-mal'}">${dc.v === 0 ? '= sin cambio' : _flecha(dc.v) + ' ' + _signo(dc.v) + dc.v.toFixed(1) + ' pp'} contra ${esc(C.prev.corte)}</div>` : '';
  return `<div class="${clase}">
      <div class="card kpi hero"><div class="t">Equipos cifrados</div><div class="v num">${pct(c, n)}</div><div class="s">${fmt(c)} de ${fmt(n)} equipos</div>${delta}</div>
      ${hallazgos(R, ambito).map(h => `<div class="card kpi hallazgo"><div class="t">${h.t}</div><div class="v num ${h.cls}">${h.v}</div><div class="s">${h.s}</div></div>`).join('')}
    </div>`;
}
const _k = x => x === 1 ? '' : x + '×';
const NOTA_SEMAFORO_CORTA = () => `Criterio de riesgo definido por el equipo, con referencia a ISO/IEC 27001 (cláusula 6.1.2 y control A.8.24). El semáforo sale del puntaje: Verde con ${META.semaforo.verde_desde} o más, Ámbar de ${META.semaforo.ambar_desde} a ${META.semaforo.verde_desde - 1}, Rojo por debajo de ${META.semaforo.ambar_desde}. «Con Windows 10» habla de la versión del sistema, no del cifrado: esos equipos pueden estar cifrados. La fórmula está en «Países y regiones».`;
const NOTA_SEMAFORO = () => {
  const s = META.semaforo, p = s.pesos;
  return `Criterio de riesgo definido por el equipo, con referencia a ISO/IEC 27001 (cláusula 6.1.2, criterios de riesgo, y control A.8.24, uso de criptografía). El semáforo sale del puntaje: Verde con ${s.verde_desde} o más, Ámbar de ${s.ambar_desde} a ${s.verde_desde - 1}, Rojo por debajo de ${s.ambar_desde}. Puntaje = 100 − ${_k(p.sin_dato)}%sin dato − ${_k(p.sin_cifrar)}%sin cifrar − ${_k(p.windows10)}%Windows 10 − ${_k(p.inactivos)}%inactivos − ${_k(p.inconsistencias)}%inconsistencias, sin bajar de 0. Los equipos macOS vienen de un inventario aparte y cuentan como «Sin dato» mientras no estén en MDM; por eso llevan su propia columna. Es una medida descriptiva, no una predicción.`;
};

/* «Dónde actuar primero»: todos los países en Rojo o en Ámbar, del peor color al mejor y, dentro de cada color, por equipos afectados.
 * Va con una dona de cuántos países hay en cada color. */
function dondeActuar(R) {
  const P = porPaisSemaforo(R), n = P.length;
  const cuenta = c => P.filter(x => x.sem[0] === c).length;
  const orden = P.filter(x => x.sem[0] !== 'Verde').sort((a, b) => NIVEL_SEM[a.sem[0]] - NIVEL_SEM[b.sem[0]] || b.afectados - a.afectados);
  const dn = dona([{et: 'Rojo', v: cuenta('Rojo'), cls: 'c-noc', color: 'var(--rojo)'}, {et: 'Ámbar', v: cuenta('Ámbar'), cls: 'c-sem-amb', color: 'var(--ambar)'},
                   {et: 'Verde', v: cuenta('Verde'), cls: 'c-ver', color: 'var(--verde)'}], {centro: String(n), sub: pl(n, 'país', 'países'), etiqueta: 'Países por semáforo', unidad: v => pl(v, 'país', 'países')});
  const cols = [{et: 'País', v: x => x.p}, {et: 'Estado', v: x => x.sem[0], html: x => `<span class="semaforo"><i style="background:${x.sem[1]}"></i>${x.sem[0]}</span>`},
                {et: 'Principal problema', v: x => x.problema}];
  const cuerpo = orden.length ? tabla('actuar', cols, orden, {porPagina: orden.length}) +
      `<div class="acciones"><button class="btn" data-ir-tab="paises">Ver el detalle en Países y regiones</button></div>`
    : `<div class="vacio">Ningún país está en Rojo ni en Ámbar.</div>`;
  return {dona: dn, cuerpo, cols, orden, total: n};
}

/* Cambio contra el corte anterior: totales de cada archivo completo (no dependen de los filtros). Lo usan el Resumen y el PDF ejecutivo. */
const CLAVES_CAMBIO = ['pct_cifrado', 'sin_cifrar', 'sin_dato', 'windows10', 'inactivos_90d'];
const ETIQUETA_CAMBIO = {pct_cifrado: '% cifrado', sin_cifrar: 'Sin cifrar', sin_dato: 'Sin dato', windows10: 'Windows 10', inactivos_90d: 'Inactivos más de 90 días'};
const MEJORA_BAJANDO = {pct_cifrado: false};   // en las demás, bajar es mejorar
function cambioContraAnterior() {
  const HI = DATOS.historico || {}, filas = HI.filas || [], act = filas[filas.length - 1], prev = filas[filas.length - 2];
  if (!act || !prev) return {act, prev, filas: []};
  return {act, prev, filas: (HI.metricas || []).filter(m => CLAVES_CAMBIO.includes(m.columna)).map(m => {
    const a = _num(prev[m.columna]), b = _num(act[m.columna]);
    const v = a === null || b === null ? null : +(b - a).toFixed(m.porcentaje ? 1 : 0);
    const mejora = v === null || v === 0 ? null : (MEJORA_BAJANDO[m.columna] === false ? v > 0 : v < 0);
    return {et: ETIQUETA_CAMBIO[m.columna] || m.etiqueta, a, b, v, pct: m.porcentaje, mejora};
  })};
}
function tablaCambio(C) {
  const fv = (x, p) => x === null ? '—' : p ? x.toFixed(1) + '%' : fmt(x);
  const var_ = x => x.v === null ? '—' : `<span class="${x.mejora === null ? '' : x.mejora ? 'var-bien' : 'var-mal'}">${_flecha(x.v)} ${_signo(x.v)}${x.pct ? x.v.toFixed(1) + ' pp' : fmt(x.v)}${x.mejora === null ? '' : x.mejora ? ' · mejoró' : ' · empeoró'}</span>`;
  return tabla('cambio', [{et: 'Indicador', v: x => x.et}, {et: C.prev.corte, n: 1, v: x => fv(x.a, x.pct)}, {et: C.act.corte, n: 1, v: x => fv(x.b, x.pct)},
    {et: 'Variación', n: 1, v: x => x.v === null ? '' : `${_flecha(x.v)} ${_signo(x.v)}${x.v}`, html: var_}], C.filas);
}
function tarjetaCambio() {
  const C = cambioContraAnterior();
  return C.filas.length ? tablaCambio(C) + `<div class="nota">Compara los totales completos de ${esc(C.act.corte)} contra ${esc(C.prev.corte)}; no cambian con los filtros.</div>`
    : `<div class="vacio">Es el primer corte: todavía no hay uno anterior con el cual comparar. Aparece cuando se procese el siguiente archivo.</div>`;
}

/* Barras apiladas al 100 % de las 5 categorías de cifrado efectivo, una por grupo (país, banda de recencia...).
 * grupos = [{et, L}]  (L = equipos del grupo). Cada barra lleva el total de equipos en la etiqueta y su % cifrado a la derecha;
 * el color nunca es el único indicador: el detalle (cifras) va en el aria-label y en el título de cada tramo. */
function barrasApiladas(grupos, {etiqueta = ''} = {}) {
  if (!grupos.length) return `<div class="vacio">Sin equipos con este filtro.</div>`;
  const filas = grupos.map(({et, L}) => {
    const n = L.length, cats = CAT_EFECTIVO.map(c => ({...c, v: contar(L, f => f.cifrado_efectivo === c.et)})), cif = cats[0].v + cats[1].v + cats[2].v;
    const segs = cats.map(c => c.v ? `<div class="seg ${c.cls}" style="flex:${c.v}" title="${esc(et)} · ${c.et}: ${fmt(c.v)} (${pct(c.v, n)})"></div>` : '').join('');
    const aria = `${et}, ${fmt(n)} equipos: ` + cats.map(c => `${c.et} ${fmt(c.v)} (${pct(c.v, n)})`).join(', ');
    return `<div class="et" title="${esc(et)}">${esc(et)} <span class="sub">${fmt(n)}</span></div>
      <div class="pila" role="img" aria-label="${esc(aria)}">${segs}</div>
      <div class="val">${pct(cif, n)} <span class="sub">cifrado</span></div>`;
  }).join('');
  return `<div class="leyenda leyenda-sup">${CAT_EFECTIVO.map(c => `<span><i class="${c.cls}"></i>${c.et}</span>`).join('')}</div>
    <div class="pilas" role="group" aria-label="${esc(etiqueta)}">${filas}</div>`;
}
const BANDAS_RECENCIA = [['0-30 días', '0-30 días'], ['31-90 días', '31-90 días'], ['91-180 días', '91-180 días'], ['>180 días', 'Más de 180 días'], ['No disponible', 'Sin dato']];
function cifradoPorRecencia(R) {
  return BANDAS_RECENCIA.map(([b, et]) => ({et, L: R.filter(f => f.banda_recencia === b)})).filter(g => g.L.length);
}

VISTAS.resumen = R => {
  const ina = contar(R, f => f.inactivo_mas_90d), A = dondeActuar(R);
  return `${indicadoresResumen(R)}
    <div class="mt">${card('Estado y clasificación del cifrado', barraCifrado(R) +
      `<details class="leer"><summary>Cómo leer esta barra</summary><div class="nota">«Sin cifrar» y «Sin dato» llevan colores distintos a propósito: uno es un incumplimiento y el otro un punto ciego. Las tres primeras categorías desglosan los equipos cifrados; las cinco son mutuamente excluyentes y suman el total de equipos del filtro.</div></details>`)}</div>
    <div class="mt">${card('Dónde actuar primero', `<div class="actuar"><div>${A.dona}</div><div>${A.cuerpo}</div></div>
      <div class="nota">Países que no están en Verde, de peor a mejor. «Principal problema» es lo que más puntos le resta a ese país. ${NOTA_SEMAFORO_CORTA()}</div>`)}</div>
    <div class="grid g2 mt">
      ${card('Cambio contra el corte anterior', tarjetaCambio())}
      ${card('Cifrado por recencia del último logon', barrasApiladas(cifradoPorRecencia(R), {etiqueta: 'Cifrado por recencia del último logon'}) +
        `<div class="nota"><b>${fmt(ina)}</b> ${pl(ina, 'equipo lleva', 'equipos llevan')} más de 90 días sin iniciar sesión: riesgo de inventario obsoleto o de equipos que ya no reportan.</div>`)}
    </div>`;
};

VISTAS.visibilidad = R => {
  const n = R.length;
  const ambos = contar(R, f => f.en_mdm && f.en_ad), soloAD = contar(R, f => f.en_ad && !f.en_mdm),
        soloMDM = contar(R, f => f.en_mdm && !f.en_ad), mac = contar(R, f => f.en_macos && !f.en_mdm);
  const seg = (v, cls, t) => v ? `<div class="seg ${cls}" style="flex:${v}" title="${t}: ${fmt(v)}"></div>` : '';
  const cobertura = [...agrupar(R, f => f.pais)].map(([p, L]) => ({p, n: L.length, m: contar(L, f => f.en_mdm)}))
    .sort((a, b) => a.m / a.n - b.m / b.n);
  const debil = cobertura.find(x => x.n >= 20) || cobertura[0];
  const huerfanos = R.filter(f => f.usuario_sin_asignar && !f.en_mdm);
  return `<div class="grid g2">
    ${card('Fuentes de cada equipo', `<div class="barra" role="img" aria-label="Fuentes de datos">
        ${seg(soloAD + mac, 'c-sd', 'Solo AD / macOS')}${seg(ambos, 'c-cif', 'MDM + AD')}${seg(soloMDM, 'c-mdm', 'Solo MDM')}</div>
      <div class="leyenda" style="flex-direction:column;gap:4px">
        <span>En AD: <b class="num">${fmt(ambos + soloAD)}</b> · En MDM: <b class="num">${fmt(ambos + soloMDM)}</b></span></div>
      <div class="leyenda">
        <span><i class="c-sd"></i>Solo AD <b class="num">${fmt(soloAD)}</b> · ${pct(soloAD, n)}</span>
        <span><i class="c-cif"></i>MDM + AD <b class="num">${fmt(ambos)}</b> · ${pct(ambos, n)}</span>
        <span><i class="c-mdm"></i>Solo MDM <b class="num">${fmt(soloMDM)}</b> · ${pct(soloMDM, n)}</span>
        <span>macOS (inventario aparte) <b class="num">${fmt(mac)}</b></span></div>
      <div class="nota">«Solo AD» no tiene estado de cifrado, TPM ni readiness; «Solo MDM» no tiene país, región ni logon. Por eso los «No disponible» son estructurales, no aleatorios.</div>`)}
    ${card('Cobertura de MDM por país', hbars(cobertura.map(x => ({et: x.p, v: pnum(x.m, x.n), txt: `${pct(x.m, x.n)} (${fmt(x.m)} de ${fmt(x.n)})`,
        cls: x === debil ? 'c-noc' : 'c-cif', resaltar: x === debil}))) + (debil ? `<div class="nota">Resaltado: el país más débil, <b>${esc(debil.p)}</b>.</div>` : ''))}
  </div>
  <div class="mt">${card('Equipos huérfanos: sin usuario y sin MDM', tabla('huerfanos', [C.equipo, C.pais, C.fuente, C.version, C.mes, C.banda], huerfanos, {csv: 'equipos_huerfanos'}))}</div>`;
};

VISTAS.riesgo = R => {
  const rd = f => f.readiness_cifrado === 'Ready' ? 'Ready' : f.readiness_cifrado === 'Not ready' ? 'Not ready' : 'Sin dato';
  const cs = {cif: 'Cifrado', noc: 'Sin cifrar', sd: 'Sin dato'};
  const filas = ['Ready', 'Not ready', 'Sin dato'].map(et => ({et})), cols = ['Cifrado', 'Sin cifrar', 'Sin dato'].map(et => ({et}));
  const tpmOrden = [['TPM 2', 'c-cif'], ['TPM 1.2', 'c-noc'], ['No disponible', 'c-sd'], ['No aplica', 'c-sd']];
  const accion = R.filter(f => f.flag_ready_pero_no_cifrado);
  const t12 = contar(R, f => f.flag_tpm_obsoleto);
  return `<div class="grid g2">
    ${card('Preparación para cifrar contra estado de cifrado', matriz('Readiness', 'Cifrado', filas, cols,
        (fi, co) => contar(R, f => rd(f) === fi.et && cs[f.cif] === co.et), {'Ready|Sin cifrar': 'r', 'Not ready|Cifrado': 'a'}) +
      `<div class="nota">Rojo: listos para cifrar pero sin cifrar (acción inmediata). Ámbar: ya cifrados aunque readiness dice «Not ready» (revisar el dato).</div>`)}
    ${card('Estado del TPM', hbars(tpmOrden.map(([t, cls]) => ({et: t === 'No disponible' ? 'Sin dato' : t, v: contar(R, f => f.estado_tpm === t), txt: fmt(contar(R, f => f.estado_tpm === t)), cls}))) +
      `<div class="nota"><b>${fmt(t12)}</b> ${pl(t12, 'equipo con TPM 1.2 es candidato', 'equipos con TPM 1.2 son candidatos')} a cambio de hardware.</div>`)}
  </div>
  <div class="mt">${card('Tabla de acción: listos para cifrar pero sin cifrar', tabla('accion', [C.equipo, C.pais, C.fuente, C.so, C.tpm, C.cum, C.banda], accion, {csv: 'listos_sin_cifrar'}) +
    `<div class="nota">Se filtra con los controles de arriba (país, fuente, etc.).</div>`)}</div>`;
};

VISTAS.cumplimiento = R => {
  const cm = f => f.estado_cumplimiento === 'Compliant' ? 'Compliant' : f.estado_cumplimiento === 'Unknown' ? 'Unknown' : 'Sin dato';
  const cs = {cif: 'Cifrado', noc: 'Sin cifrar', sd: 'Sin dato'};
  const paises = [...agrupar(R, f => f.pais)].map(([p, L]) => ({p, n: L.length, i: contar(L, f => f.inconsistente)})).sort((a, b) => b.i / b.n - a.i / a.n);
  const top = paises[0];
  return `<div class="grid g4">
      ${kpi('Compliant pero sin cifrar', fmt(contar(R, f => f.flag_compliant_sin_cifrar)), 'la bandera de cumplimiento no es confiable', 'rojo')}
      ${kpi('BitLocker «Success» pero sin cifrar', fmt(contar(R, f => f.flag_success_sin_cifrar)), 'el estado técnico contradice el cifrado')}
      ${kpi('Sin cifrar con mensaje de TPM o método distinto', fmt(contar(R, f => f.flag_config_incoherente_sin_cifrar)), 'mensajes que describen equipos cifrados')}
      ${kpi('Cifrados con cumplimiento Unknown', fmt(contar(R, f => f.flag_cifrado_cumplimiento_unknown)), 'cumplimiento sin evaluar')}
    </div>
    <div class="grid g2 mt">
      ${card('Cumplimiento contra cifrado real', matriz('Cumplimiento', 'Cifrado', ['Compliant', 'Unknown', 'Sin dato'].map(et => ({et})), ['Cifrado', 'Sin cifrar', 'Sin dato'].map(et => ({et})),
          (fi, co) => contar(R, f => cm(f) === fi.et && cs[f.cif] === co.et), {'Compliant|Sin cifrar': 'r', 'Unknown|Cifrado': 'a'}) +
        `<div class="nota">Rojo: dicen cumplir pero no están cifrados. Ámbar: cifrados cuyo cumplimiento nunca se evaluó (Unknown).</div>`)}
      ${card('Países donde la configuración se aparta más de la política', hbars(paises.map(x => ({et: x.p, v: pnum(x.i, x.n), txt: `${pct(x.i, x.n)} (${fmt(x.i)})`, cls: 'c-noc', resaltar: x === top && x.i > 0}))) +
        `<div class="nota">Porcentaje de equipos del país con al menos una inconsistencia entre cifrado, readiness, BitLocker o cumplimiento.</div>`)}
    </div>
    <div class="mt">${card('Equipos Compliant que en realidad incumplen', tabla('compliant', [C.equipo, C.pais, C.fuente, C.so, C.ready, C.tec], R.filter(f => f.flag_compliant_sin_cifrar), {csv: 'compliant_sin_cifrar'}))}</div>`;
};

VISTAS.usuarios = R => {
  const conU = R.filter(f => f.usuario_id);
  const users = [...agrupar(conU, f => f.usuario_id)].map(([u, L]) => ({u, n: L.length, paises: new Set(L.map(f => f.pais)).size,
    fuentes: [...new Set(L.map(fuente))], alerta: contar(L, f => f.con_alerta)}));
  const multi = users.filter(x => x.n >= 2), comp = users.filter(x => x.n >= META.umbral_compartida);
  const multiFuente = users.filter(x => x.fuentes.length > 1).sort((a, b) => b.n - a.n || a.u.localeCompare(b.u));
  const ranking = [...users].sort((a, b) => b.n - a.n || b.alerta - a.alerta || a.u.localeCompare(b.u));
  const cU = {et: 'Usuario', v: x => x.u}, cN = {et: 'Equipos', n: 1, v: x => x.n}, cP = {et: 'Países', n: 1, v: x => x.paises},
        cA = {et: 'Con alerta', n: 1, v: x => x.alerta}, cF = {et: 'Fuentes', v: x => x.fuentes.join(' / ')};
  return `<div class="grid g4">
      ${kpi('Usuarios con equipo asignado', fmt(users.length), `${fmt(conU.length)} equipos con usuario`)}
      ${kpi('Equipos sin usuario', fmt(R.length - conU.length), `${pct(R.length - conU.length, R.length)} del filtro`, 'gris')}
      ${kpi('Usuarios con 2 o más equipos', fmt(multi.length), `${fmt(multi.reduce((s, x) => s + x.n, 0))} equipos`)}
      ${kpi(`Posibles cuentas compartidas (${META.umbral_compartida} o más)`, fmt(comp.length), `${fmt(comp.reduce((s, x) => s + x.n, 0))} equipos, por validar con el cliente`, 'rojo')}
    </div>
    <div class="grid g2 mt">
      ${card('Ranking de usuarios con más equipos', tabla('ranking', [cU, cN, cP, cA], ranking.slice(0, 50)) +
        `<div class="nota">«Con alerta»: equipos del usuario con algún hallazgo (sin cifrar, sin dato, Windows 10, TPM 1.2 o inactivo).</div>`)}
      ${card('Usuarios con equipos en más de una fuente', `<div class="kpi"><div class="v num">${fmt(multiFuente.length)}</div><div class="s">usuarios con equipos en 2 o más fuentes de datos</div></div>` +
        tabla('multifuente', [cU, cN, cF], multiFuente, {porPagina: 6}))}
    </div>
    <div class="mt">${card('Cuentas que parecen compartidas o de servicio', tabla('compartidas', [cU, cN, cP, {et: 'Fuentes', n: 1, v: x => x.fuentes.length}, cA],
        comp.sort((a, b) => b.n - a.n || a.u.localeCompare(b.u)), {porPagina: 8, csv: 'posibles_cuentas_compartidas'}))}</div>`;
};

VISTAS.so = R => {
  const w10 = R.filter(f => f.windows10_fuera_de_soporte);
  const versiones = [...agrupar(R, f => f.version_so)].map(([v, L]) => ({v, n: L.length, w10: L[0].windows10_fuera_de_soporte})).sort((a, b) => b.n - a.n);
  const paises = [...agrupar(R, f => f.pais)].map(([p, L]) => { const W = L.filter(f => f.windows10_fuera_de_soporte);
    return {p, n: L.length, w: W.length, wn: contar(W, f => f.cif === 'noc'), wg: contar(W, f => f.version_generica)}; }).sort((a, b) => b.w - a.w);
  return `<div class="grid g4">
      ${kpi('Equipos con Windows 10', fmt(w10.length), `${pct(w10.length, R.length)} · sin soporte desde oct-2025`, 'rojo')}
      ${kpi('Windows 10 sin cifrar', fmt(contar(w10, f => f.cif === 'noc')), 'doble riesgo: sin parches y sin cifrado', 'rojo')}
      ${kpi('Versiones genéricas', fmt(contar(R, f => f.version_generica)), 'no permiten saber el build exacto', 'gris')}
      ${kpi('Equipos con Windows 11', fmt(contar(R, f => f.familia_so === 'Windows 11')), `${pct(contar(R, f => f.familia_so === 'Windows 11'), R.length)} del filtro`)}
    </div>
    <div class="grid g2 mt">
      ${card('Equipos por versión', hbars(versiones.map(x => ({et: x.v, v: x.n, txt: fmt(x.n), cls: x.w10 ? 'c-noc' : x.v.includes('genérico') || x.v.includes('sin versión') ? 'c-sd' : 'c-cif'}))) +
        `<div class="leyenda"><span><i class="c-noc"></i>Windows 10 (fuera de soporte)</span><span><i class="c-cif"></i>Windows 11 / macOS</span><span><i class="c-sd"></i>Genérico</span></div>`)}
      ${card('Países con más equipos Windows 10', tabla('so_paises', [{et: 'País', v: x => x.p}, {et: 'Windows 10', n: 1, v: x => fmt(x.w)},
        {et: '% del país', n: 1, v: x => pct(x.w, x.n)}, {et: 'Sin cifrar', n: 1, v: x => fmt(x.wn)}, {et: 'Genéricos', n: 1, v: x => fmt(x.wg)}], paises, {porPagina: 12}))}
    </div>`;
};

VISTAS.actividad = R => {
  const orden = ['0-30 días', '31-90 días', '91-180 días', 'Más de 180 días', 'Sin dato'];
  const bandas = orden.map(b => ({b, n: contar(R, f => C.banda.v(f) === b)}));
  const conMes = R.filter(f => f.meses_desde_logon != null);
  const cubos = [...Array(13).keys()].map(m => ({m, n: contar(conMes, f => m === 12 ? f.meses_desde_logon >= 12 : f.meses_desde_logon === m)}));
  const inactivos = R.filter(f => f.inactivo_mas_90d).sort((a, b) => (b.meses_desde_logon ?? 0) - (a.meses_desde_logon ?? 0));
  return `<div class="grid g4">
      ${kpi('Inactivos más de 90 días', fmt(inactivos.length), 'candidatos a limpieza del inventario', 'rojo')}
      ${kpi('Inactivos y además sin cifrar o sin dato', fmt(contar(inactivos, f => f.cif !== 'cif')), 'equipos olvidados y sin protección confirmada')}
      ${kpi('Cuentas deshabilitadas', fmt(contar(R, f => f.estado_cuenta === 'Deshabilitada')), 'equipos cuya cuenta ya no está activa')}
      ${kpi('Sin dato de logon', fmt(R.length - conMes.length), 'equipos que no están en AD', 'gris')}
    </div>
    <div class="grid g2 mt">
      ${card('Bandas de recencia (del archivo)', hbars(bandas.map(x => ({et: x.b, v: x.n, txt: `${fmt(x.n)} · ${pct(x.n, R.length)}`,
        cls: x.b === 'Sin dato' ? 'c-sd' : orden.indexOf(x.b) >= 2 ? 'c-noc' : 'c-cif'}))) +
        `<div class="nota">La banda viene calculada por día en el archivo original; el archivo solo trae el mes, por eso se conserva tal cual.</div>`)}
      ${card('Meses desde el último logon (contra la fecha de corte)', hbars(cubos.map(x => ({et: x.m === 12 ? '12 o más' : x.m + (x.m === 1 ? ' mes' : ' meses'), v: x.n, txt: fmt(x.n), cls: x.m >= 4 ? 'c-noc' : x.m === 3 ? 'c-amb' : 'c-cif'}))) +
        `<div class="nota">Columna calculada en la limpieza: meses entre el mes del último logon y ${META.corte}. Ámbar = 3 meses (puede caer en 31-90 o 91-180 días según el día exacto); rojo = 4 o más.</div>`)}
    </div>
    <div class="mt">${card('Equipos inactivos más de 90 días', tabla('inactivos', [C.equipo, C.usuario, C.pais, C.fuente, C.mes, C.meses, C.banda, C.cuenta, C.cifrado], inactivos, {csv: 'equipos_inactivos'}))}</div>`;
};

/* Tablas de semáforo y puntaje por país y por región: las usan la pestaña Países y regiones y el PDF ejecutivo.
 * «enlace» pone el país como botón que abre su filtro (solo tiene sentido en pantalla). */
function semaforoPaisRegion(R, {enlace = true} = {}) {
  const cols = et => [{et, v: x => x.k, html: x => enlace && et === 'País' ? `<button data-ir-pais="${esc(x.k)}">${esc(x.k)}</button>` : esc(x.k)},
    {et: 'Equipos', n: 1, v: x => fmt(x.n)}, {et: 'Equipos macOS', n: 1, v: x => fmt(x.mac)}, {et: '% cifrado', n: 1, v: x => x.cif.toFixed(1) + '%'},
    {et: '% sin dato', n: 1, v: x => x.sd.toFixed(1) + '%'}, {et: '% sin cifrar', n: 1, v: x => x.nc.toFixed(1) + '%'},
    {et: '% Windows 10', n: 1, v: x => x.w.toFixed(1) + '%'}, {et: '% inactivos', n: 1, v: x => x.ina.toFixed(1) + '%'},
    {et: '% inconsist.', n: 1, v: x => x.inc.toFixed(1) + '%'}, {et: 'Puntaje', n: 1, v: x => x.puntos.toFixed(0)},
    {et: 'Semáforo', v: x => x.sem[0], html: x => `<span class="semaforo"><i style="background:${x.sem[1]}"></i>${x.sem[0]}</span>`}];
  const por = f => [...agrupar(R, f)].map(([k, L]) => ({k, ...puntuar(L)})).sort((a, b) => a.puntos - b.puntos || b.n - a.n);
  return {P: por(f => f.pais), G: por(f => f.region), colsPais: cols('País'), colsRegion: cols('Región')};
}
VISTAS.paises = R => {
  const {P, G, colsPais, colsRegion} = semaforoPaisRegion(R);
  return `<div>${card('Semáforo y puntaje por país', tabla('cal_paises', colsPais, P, {porPagina: 15, csv: 'semaforo_paises'}))}</div>
    <div class="mt">${card('Semáforo y puntaje por región', tabla('cal_regiones', colsRegion, G, {porPagina: 10}))}</div>
     <div class="nota">${NOTA_SEMAFORO()} Las tablas van de menor a mayor puntaje, para ver primero lo que más atención necesita.</div>`;
};

VISTAS.calidad = R => {
  const reglas = DATOS.reglas;
  const motivos = [...agrupar(R.filter(f => f.motivo_sin_dato && f.motivo_sin_dato !== 'Completo'), f => f.motivo_sin_dato)].map(([m, L]) => ({m, n: L.length})).sort((a, b) => b.n - a.n);
  const campos = [['Estado de cifrado', f => f.estado_cifrado === 'No disponible'], ['TPM', f => ['No disponible', 'No aplica'].includes(f.estado_tpm)],
    ['Readiness', f => f.readiness_cifrado === 'No disponible'], ['Cumplimiento', f => f.estado_cumplimiento === 'No disponible'],
    ['País', f => f.pais === 'Sin país'], ['Mes último logon', f => !f.mes_ultimo_logon], ['Usuario', f => f.usuario_sin_asignar]];
  const fuentes = [...agrupar(R, fuente)].sort((a, b) => b[1].length - a[1].length);
  // Texto siempre oscuro: con blanco, el fondo más intenso (≈ #E69393) daba 2.34:1 (WCAG 1.4.3 pide 4.5:1)
  const calor = v => { const a = Math.min(1, v / 100); return `<span class="calor" style="background:rgba(210,59,59,${(a * .55).toFixed(2)})">${v.toFixed(0)}%</span>`; };
  const contradicciones = [['Compliant pero sin cifrar', 'flag_compliant_sin_cifrar'], ['BitLocker «Success» pero sin cifrar', 'flag_success_sin_cifrar'],
    ['Sin cifrar con mensaje de TPM o método distinto', 'flag_config_incoherente_sin_cifrar'], ['Cifrado con cumplimiento Unknown', 'flag_cifrado_cumplimiento_unknown'],
    ['Readiness «Not ready» pero cifrado', 'flag_not_ready_pero_cifrado'], ['Readiness «Ready» pero sin cifrar', 'flag_ready_pero_no_cifrado'], ['TPM 1.2 (obsoleto)', 'flag_tpm_obsoleto']];
  return card(`Reglas de limpieza aplicadas (${reglas.length})`, tabla('reglas', [{et: '#', n: 1, v: r => reglas.indexOf(r) + 1}, {et: 'Regla', v: r => r.regla},
      {et: 'Filas afectadas', n: 1, v: r => fmt(r.filas_afectadas)}, {et: 'Nota', v: r => r.nota || ''}], reglas, {porPagina: 25, csv: 'reglas_aplicadas'}) +
      `<div class="nota">Calculadas por panel.py sobre el archivo completo (${esc(META.archivo)}), sin filtros. Las banderas solo marcan; ningún valor original se corrige.</div>`) +
    `<div class="mt">
      ${card('Valores vacíos por fuente', `<div class="tabla"><table><thead><tr><th>Campo</th>${fuentes.map(([k]) => `<th class="n">${esc(k)}</th>`).join('')}</tr></thead><tbody>` +
        campos.map(([c, fn]) => `<tr><td>${c}</td>${fuentes.map(([, L]) => `<td class="n">${calor(pnum(contar(L, fn), L.length))}</td>`).join('')}</tr>`).join('') +
        `</tbody></table></div><div class="nota">Porcentaje de equipos de cada fuente sin ese dato. Los huecos dependen de la fuente, no del azar.</div>`)}</div>
    <div class="grid g2 mt">
      ${card('Motivo del hueco', motivos.length ? hbars(motivos.map(x => ({et: x.m.split(':')[0], titulo: x.m, v: x.n, txt: fmt(x.n), cls: 'c-sd'}))) +
        `<div class="nota">${motivos.map(x => esc(x.m)).join('<br>')}</div>` : '<div class="vacio">Sin huecos con este filtro.</div>')}
      ${card('Contradicciones entre campos', hbars(contradicciones.map(([et, k]) => ({et, v: contar(R, f => f[k]), txt: fmt(contar(R, f => f[k])), cls: 'c-noc'}))))}
    </div>`;
};

let BUSCAR = '';
VISTAS.detalle = R => {
const catalogo = DATOS.historico?.catalogo_incidencias || [];
  const seleccionada = catalogo.find(item => item.columna === ESTADO.incidencia);
  if (seleccionada) {R = R.filter(f => f[seleccionada.columna] === true);}
  const q = BUSCAR.trim().toLowerCase();
  const L = q ? R.filter(f => [f.equipo_id, f.usuario_id, f.pais, f.version_so, f.estado_cifrado, f.cifrado_efectivo].some(v => String(v ?? '').toLowerCase().includes(q))) : R;
  const columnas = [C.equipo, C.usuario, C.pais, C.region, C.fuente, C.version, C.tpm, C.ready, C.cifrado, C.efectivo, C.cum, C.mes, C.banda];
  const todas = Object.keys(DATOS.equipos.cols).map(k => ({et: k, v: f => f[k] === true ? 'Verdadero' : f[k] === false ? 'Falso' : f[k] ?? ''}));
  TABLAS.completo = {columnas: todas, filas: L, csv: 'dataset_limpio_filtrado'};
  const H = DATOS.historial;
  // Llegada desde Incidencias: la incidencia es un contexto (no un filtro global), así que se muestra aparte y
  // "Quitar filtros" no la borra; se sale con "Ver todos los equipos" o con la ruta.
  const s = seleccionada, nombre = s ? esc(s.nombre) : '';
  const contexto = s ? `<nav class="migas" aria-label="Ruta"><a href="#incidencias">Incidencias</a><span aria-hidden="true">›</span><span aria-current="page">${nombre}</span></nav>` : '';
  const etiqueta = s ? `<div class="contexto-inc"><div><span class="etq">Incidencia activa</span><b>${nombre}</b> · Prioridad ${esc(s.nivel)}
      <div class="crit">Criterio: ${esc(s.criterio)}</div></div><button class="btn" data-quitar-incidencia="1">Ver todos los equipos</button></div>` : '';
  return contexto + card(s ? `Equipos afectados por ${nombre}` : 'Tabla de equipos', etiqueta + `<div class="acciones"><input type="search" id="buscar" placeholder="Buscar equipo, usuario, país, versión…" value="${esc(BUSCAR)}" style="min-width:260px">
      <button class="btn" data-csv="completo" ${L.length ? '' : 'disabled'}>Descargar CSV completo (${fmt(L.length)} ${pl(L.length, 'fila')}, ${todas.length} columnas)</button></div>` +
      tabla('detalle', columnas, L, {porPagina: 15, nowrap: true,
        vacio: s ? `Ningún equipo con la incidencia «${nombre}» dentro de los filtros actuales.` : undefined})) +
    `<div class="mt">${card('Historial de cortes', tabla('historial', [{et: 'Corte', v: h => h.corte}, {et: 'Equipos', n: 1, v: h => fmt(h.equipos)},
      {et: '% cifrado', n: 1, v: h => Number(h.pct_cifrado).toFixed(1) + '%'}, {et: 'Sin cifrar', n: 1, v: h => fmt(h.sin_cifrar)}, {et: 'Sin dato', n: 1, v: h => fmt(h.sin_dato)},
      {et: 'Windows 10', n: 1, v: h => fmt(h.windows10)}, {et: 'Inactivos', n: 1, v: h => fmt(h.inactivos_90d)}, {et: 'Archivo', v: h => h.archivo}], [...H].reverse(), {csv: 'historial'}) +
      `<div class="nota">Cada vez que se procesa un archivo nuevo, panel.py agrega una fila a salidas/historial.csv (re-procesar el mismo corte la reemplaza). Así se comparan los cortes trimestrales sin cargar todos los archivos en memoria.</div>`)}</div>`;
};


/* ------------------------------------------------------------------ *
 * Histórico (T21) e Información del corte (T22): Persona 2
 * Usan DATOS.historico (lo arma historial.py). No dependen de los filtros globales:
 * el historial guarda totales de cada archivo completo.
 * ------------------------------------------------------------------ */
const _num = x => (x === null || x === undefined || x === '') ? null : Number(x);
const _signo = v => v > 0 ? '+' : '';
const _flecha = v => v > 0 ? '▲' : v < 0 ? '▼' : '=';

VISTAS.historico = () => {
  const HI = DATOS.historico, filas = (HI && HI.filas) || [];
  if (filas.length < 2) {
    return card('Se necesitan al menos 2 cortes', `<div class="vacio">El historial tiene ${filas.length} corte${filas.length === 1 ? ' (' + esc(filas[0].corte) + ')' : 's'}.
      Cuando se procese otro archivo con panel.py, aquí aparecerá la comparación entre cortes.</div>`);
  }
  const cortes = HI.cortes, def = HI.comparacion;
  if (!cortes.includes(ESTADO.hist.a) || !cortes.includes(ESTADO.hist.b)) ESTADO.hist = {a: def.base, b: def.nuevo};
  const {a, b} = ESTADO.hist;
  const sel = (k, v) => `<label>${k === 'a' ? 'Corte base (anterior)' : 'Corte nuevo'}<select data-hcorte="${k}">` +
    cortes.map(c => `<option value="${esc(c)}" ${c === v ? 'selected' : ''}>${esc(c)}</option>`).join('') + `</select></label>`;
  const selector = `<div class="filtros">${sel('a', a)}${sel('b', b)}</div>`;
  if (a === b) return card('Comparar cortes', selector + `<div class="vacio">Elige dos cortes distintos.</div>`);

  const fa = filas.find(f => f.corte === a), fb = filas.find(f => f.corte === b);
  const comp = HI.metricas.map(m => {
    const va = _num(fa[m.columna]), vb = _num(fb[m.columna]);
    const ok = va !== null && vb !== null;
    const v = ok ? +(vb - va).toFixed(m.porcentaje ? 1 : 0) : null;
    return {et: m.etiqueta, col: m.columna, pct: m.porcentaje, va, vb, v, vp: ok && !m.porcentaje && va ? 100 * (vb - va) / va : null};
  });
  const por = Object.fromEntries(comp.map(x => [x.col, x]));
  const f1 = x => x === null ? '—' : x.toFixed(1);
  const fval = (x, c) => x === null ? '—' : c.pct ? x.toFixed(1) + '%' : fmt(x);
  const fvar = c => c.v === null ? '—' : `${_flecha(c.v)} ${_signo(c.v)}${c.pct ? c.v.toFixed(1) + ' pp' : fmt(c.v)}`;
  const kp = (t, col, rojo) => { const c = por[col]; return kpi(t, fval(c.vb, c), c.v === null ? 'sin dato en uno de los cortes' : `${fvar(c)} frente a ${esc(a)}`, rojo); };

  const tablaComp = tabla('comparacion', [
      {et: 'Métrica', v: c => c.et},
      {et: a, n: 1, v: c => fval(c.va, c)}, {et: b, n: 1, v: c => fval(c.vb, c)},
      {et: 'Variación', n: 1, v: fvar},
      {et: 'Variación %', n: 1, v: c => c.vp === null ? '' : `${_signo(c.vp)}${c.vp.toFixed(1)}%`}],
    comp, {porPagina: 30, csv: 'comparacion_cortes'});

  const evol = hbars(filas.map(f => ({et: f.corte, v: _num(f.pct_cifrado) ?? 0, txt: f1(_num(f.pct_cifrado)) + '%', cls: 'c-cif', resaltar: f.corte === a || f.corte === b})), 100);

  const M = def.movimientos, mismo = M && a === def.base && b === def.nuevo;
  let mov;
  if (mismo && M.en_ambos === 0) {
    mov = `<div class="vacio"><b>Los dos cortes no tienen ningún equipo en común.</b> Todos aparecen como altas (${fmt(M.altas)}) o bajas (${fmt(M.bajas)}) porque los identificadores de equipo (EquipoID) no coinciden entre ${esc(a)} y ${esc(b)}. Revisa que ambos archivos usen el mismo EquipoID para el mismo equipo; si es así, no hay movimientos que comparar.</div>`;
  } else if (mismo) {
    mov = `<div class="grid g4">${kpi('Equipos en ambos cortes', fmt(M.en_ambos), `${fmt(M.sin_cambio)} sin cambio de cifrado efectivo`)}
        ${kpi('Altas', fmt(M.altas), `equipos que solo están en ${esc(b)}`)}
        ${kpi('Bajas', fmt(M.bajas), `equipos que solo estaban en ${esc(a)}`, 'gris')}
        ${kpi('Equipos que cambiaron de estado', fmt(M.cambios.reduce((s, x) => s + x.equipos, 0)), 'cifrado efectivo distinto entre cortes')}</div>` +
      `<div class="mt">` + tabla('movimientos', [{et: `Cifrado efectivo en ${a}`, v: x => x.de}, {et: `Cifrado efectivo en ${b}`, v: x => x.a}, {et: 'Equipos', n: 1, v: x => fmt(x.equipos)}],
        M.cambios, {csv: 'movimientos_entre_cortes', vacio: 'Ningún equipo cambió de estado de cifrado.'}) + `</div>`;
  } else {
    mov = `<div class="vacio">El detalle equipo por equipo solo se calcula para los dos cortes más recientes (${esc(def.base)} → ${esc(def.nuevo)}).
      ${def.aviso ? esc(def.aviso) : 'Elígelos arriba para verlo.'}</div>`;
  }

  return `<div class="grid g4">
      ${kp('% cifrado (sobre todos los equipos)', 'pct_cifrado')}
      ${kp('Sin cifrar', 'sin_cifrar', 'rojo')}
      ${kp('Sin dato de cifrado', 'sin_dato', 'gris')}
      ${kp('Equipos en el archivo', 'equipos')}
    </div>
    <div class="mt">${card('Corte base contra corte nuevo', selector + tablaComp +
      `<div class="nota">Los porcentajes varían en puntos porcentuales (pp); los conteos, en cantidad y en %. Esta pestaña usa los totales de cada archivo completo: no cambia con los filtros de arriba.
       «% cifrado sobre equipos con dato» excluye los equipos sin dato. Un guion (—) significa que ese corte se procesó antes de que existiera la métrica.</div>`)}</div>
    <div class="grid g2 mt">
      ${card('% cifrado por corte', evol + `<div class="nota">Resaltados: los dos cortes comparados.</div>`)}
      ${card('Cambios equipo por equipo', mov)}
    </div>`;
};

VISTAS.corte = () => {
  const HI = DATOS.historico || {}, cat = HI.catalogo_incidencias || [];
  const fila = (k, v) => `<tr><td><b>${k}</b></td><td>${v}</td></tr>`;
  const s = META.semaforo, c = META.corte;
  const params = `<div class="tabla"><table><tbody>
    ${fila('Archivo de origen', esc(META.archivo))}
    ${fila('Fecha de corte', esc(c) + '-01')}
    ${fila('Panel generado', esc(META.generado))}
    ${fila('Equipos en el archivo', fmt(DATOS.equipos.n))}
    ${fila('Reglas de limpieza aplicadas', fmt(DATOS.reglas.length) + ' (detalle en «Calidad de datos»)')}
    ${fila('Umbral de cuenta compartida', META.umbral_compartida + ' o más equipos por usuario')}
    ${fila('Semáforo (criterio del equipo)', `Sale del puntaje: Verde con ${s.verde_desde} o más, Ámbar de ${s.ambar_desde} a ${s.verde_desde - 1}, Rojo por debajo de ${s.ambar_desde}. Detalle de la fórmula en «Países y regiones»`)}
    ${fila('Cortes en el historial', fmt((HI.cortes || []).length) + (HI.cortes ? ': ' + HI.cortes.map(esc).join(', ') : ''))}
    ${fila('Datos de prueba', META.dummy ? 'Sí (DATOS DUMMY)' : 'No, datos reales')}</tbody></table></div>`;
  const archivos = [`salidas/corte_${c}/dataset_limpio.csv`, `salidas/corte_${c}/reglas_aplicadas.csv`, `salidas/corte_${c}/diccionario_columnas.csv`,
    `salidas/corte_${c}/macos_detalle.csv`, `salidas/historial.csv`, `salidas/panel_cifrado_${c}.html`];
  const incid = cat.length ? tabla('catalogo', [{et: 'Incidencia', v: x => x.nombre}, {et: 'Criterio', v: x => x.criterio}, {et: 'Nivel', v: x => x.nivel},
      {et: 'Columna', v: x => x.columna}, {et: 'Equipos', n: 1, v: x => fmt(contar(EQUIPOS, f => f[x.columna]))}], cat, {porPagina: 10, csv: 'catalogo_incidencias'}) +
    `<div class="nota">Las banderas solo marcan; ningún valor original se corrige. El conteo es del corte completo, sin filtros. El nivel es provisional (por validar con FEMSA).</div>`
    : '<div class="vacio">Sin catálogo de incidencias en este panel.</div>';
  return `<div class="grid g2">
      ${card('Datos del corte', params)}
      ${card('Archivos que generó este corte', `<ul style="margin:0;padding-left:20px">${archivos.map(x => `<li><code>${esc(x)}</code></li>`).join('')}</ul>
        <div class="nota">Todo corre en local: los datos no salen de la computadora.</div>`)}
    </div>
    <div class="mt">${card('Catálogo de incidencias', incid)}</div>
    <div class="mt">${card('Cómo se calcula cada métrica', `<dl class="glosario">
      <dt>% cifrado (sobre todos los equipos)</dt><dd>Equipos con estado «Encrypted» entre todos los equipos del archivo, incluidos los que no tienen dato.</dd>
      <dt>% cifrado (sobre equipos con dato)</dt><dd>Lo mismo, pero sin contar los equipos sin dato de cifrado en el denominador.</dd>
      <dt>Cifrado efectivo</dt><dd>Combina el estado de cifrado con el resultado de BitLocker: conforme, con desviación, sin validar configuración, no cifrado o sin dato.</dd>
      <dt>Variación</dt><dd>Corte nuevo menos corte base. En porcentajes se expresa en puntos porcentuales (pp).</dd></dl>`)}</div>
    <div class="mt">${card('Diccionario de columnas', tabla('diccionario', [{et: 'Columna', v: x => x.columna}, {et: 'Descripción', v: x => x.descripcion}],
      DATOS.diccionario, {porPagina: 15, csv: 'diccionario_columnas'}))}</div>`;
};

VISTAS.glosario = () => card('Glosario', `<dl class="glosario">
  <dt>MDM (Mobile Device Management)</dt><dd>Sistema central que administra los equipos, aplica reglas, activa el cifrado y reporta su estado.</dd>
  <dt>AD (Active Directory)</dt><dd>Directorio de cuentas de Windows. Sabe qué equipos y usuarios existen y cuándo iniciaron sesión, pero no si están cifrados.</dd>
  <dt>Cifrado / BitLocker</dt><dd>BitLocker es la herramienta de Windows que cifra el disco. «Encrypted» = cifrado, «Not encrypted» = sin cifrar.</dd>
  <dt>Tecnología de cifrado (estado de BitLocker)</dt><dd><b>Success</b>: correcto. <b>TPM no usado (política)</b>: cifrado, pero la llave no está en el TPM como exige la política. <b>Método distinto a política</b>: se usó otro algoritmo. <b>Disco fijo sin cifrar</b>: un segundo disco de datos sin cifrar.</dd>
  <dt>Cifrado efectivo</dt><dd>Combina estado y tecnología: conforme, con desviación, sin validar configuración, no cifrado o sin dato.</dd>
  <dt>TPM (Trusted Platform Module)</dt><dd>Chip que guarda la llave del cifrado. TPM 1.2 es una versión obsoleta.</dd>
  <dt>Encryption Readiness</dt><dd>Si el equipo cumple los requisitos para poder cifrarse («Ready» / «Not ready»).</dd>
  <dt>Compliance (cumplimiento)</dt><dd><b>Compliant</b>: cumple la política. <b>Unknown</b>: no se ha evaluado. <b>No disponible</b>: sin dato.</dd>
  <dt>Sin cifrar vs. Sin dato</dt><dd>«Sin cifrar» es un incumplimiento confirmado (rojo). «Sin dato» es un punto ciego: no sabemos (gris con trama).</dd>
  <dt>Build de Windows</dt><dd>19043/19044/19045 = Windows 10; 22631 = Windows 11 23H2; 26100 = 24H2; 26200 = 25H2. Windows 10 dejó de recibir parches de seguridad en octubre de 2025.</dd>
  <dt>Versión genérica</dt><dd>Cuando el archivo solo dice «Windows 10» o «Windows 11» sin build; típico de los equipos que solo están en AD.</dd>
  <dt>Recencia</dt><dd>Qué tan reciente fue el último inicio de sesión, en bandas (0-30, 31-90, 91-180, más de 180 días).</dd>
  <dt>Equipo huérfano</dt><dd>Sin usuario asignado y fuera de MDM: nadie responde por él y no reporta cifrado.</dd>
  <dt>Fecha de corte</dt><dd>Mes de referencia del archivo (${META.corte}). Las cuentas de «meses desde logon» se hacen contra esta fecha.</dd>
  <dt>Incidencias abiertas</dt><dd>La franja roja de arriba no se puede cerrar ni silenciar, porque FEMSA pidió que las incidencias siempre estén visibles.</dd></dl>`);

VISTAS.macos = R => {
  const M = DATOS.macos, cols = M.length ? Object.keys(M[0]) : [];
  return `<div class="grid g2">${card('Por qué van aparte', `<p style="margin:0 0 8px">El archivo trae <b>${fmt(M.length)}</b> equipos macOS que vienen de un inventario propio: no están en MDM ni en AD, así que no tienen estado de cifrado, TPM, readiness ni logon.</p>
      <p style="margin:0 0 8px">Además, <b>6 columnas</b> (categoría de equipo, perfil de privilegio, antigüedad en meses, banda de antigüedad, estado de hardware y tipo de red) solo tienen datos para estos equipos.</p>
      <p style="margin:0">En la limpieza esas columnas se separaron a <code>macos_detalle.csv</code>. Los equipos sí cuentan en el total y aparecen como «Sin dato» de cifrado.</p>`)}
    ${card('En el filtro actual', `<div class="kpi"><div class="v num">${fmt(contar(R, f => f.en_macos))}</div><div class="s">equipos macOS dentro de los filtros seleccionados</div></div>`)}</div>
    <div class="mt">${card('Equipos macOS (tabla aparte)', tabla('macos', cols.map(c => ({et: c, v: r => r[c] ?? ''})), M, {porPagina: 15, csv: 'equipos_macos', nowrap: true}))}</div>`;
};

/* ------------------------------------------------------------------ *
 * 5. Pintar todo
 * ------------------------------------------------------------------ */
/* Accesibilidad (T16): se aplica sobre lo ya pintado, así no hay que tocar cada vista */
function mejorarAccesibilidad() {
  const v = document.getElementById('vista'), titulo = (PESTANAS.find(x => x.id === ESTADO.tab) || {}).et || '';
  v.querySelectorAll('table').forEach(t => {
    if (!t.querySelector('caption')) {
      const h3 = t.closest('.card') && t.closest('.card').querySelector('h3');
      const c = document.createElement('caption'); c.className = 'sr-only';
      c.textContent = (h3 ? h3.textContent : titulo).trim(); t.prepend(c);
    }
    t.querySelectorAll('thead th').forEach(th => th.setAttribute('scope', 'col'));
  });
  v.querySelectorAll('.hbar .pista').forEach(p => { p.setAttribute('role', 'img'); p.setAttribute('aria-label', p.getAttribute('title') || ''); });
  marcarDesplazables();
}

/* WCAG 2.1.1: una tabla con scroll horizontal debe poder enfocarse para desplazarla con las flechas.
   Solo se marcan las que desbordan, para no agregar paradas de tabulación vacías */
function marcarDesplazables() {
  document.querySelectorAll('#vista .tabla').forEach(d => {
    const desborda = d.scrollWidth > d.clientWidth + 1;
    d.classList.toggle('desborda', desborda);
    if (desborda) {
      const t = d.querySelector('caption');
      d.tabIndex = 0; d.setAttribute('role', 'region');
      d.setAttribute('aria-label', `${t ? t.textContent.trim() : 'Tabla'} (desplazable horizontalmente)`);
    } else { d.removeAttribute('tabindex'); d.removeAttribute('role'); d.removeAttribute('aria-label'); }
  });
}
let esperaResize;
window.addEventListener('resize', () => { clearTimeout(esperaResize); esperaResize = setTimeout(marcarDesplazables, 150); });

/* Foco (WCAG 2.4.3): pintar() rehace el HTML, así que se guarda qué control tenía el foco
   y después se enfoca su equivalente; si ya no existe, el título de la vista */
function selectorFoco(el) {
  if (!el || el === document.body) return [];
  const d = el.dataset || {};
  if (d.filtro) return [`input[data-filtro="${d.filtro}"][value="${CSS.escape(el.value)}"]`, `details[data-id="${d.filtro}"] > summary`];
  if (el.tagName === 'SUMMARY') return [`details[data-id="${el.parentElement.dataset.id}"] > summary`];
  if (d.tab && el.closest('#tabs')) return [`#tabs [data-tab="${d.tab}"]`];
  if (d.pag) return [`[data-pag="${d.pag}"][data-d="${d.d}"]:not(:disabled)`, `[data-pag="${d.pag}"]:not(:disabled)`];
  if (d.hcorte) return [`[data-hcorte="${d.hcorte}"]`];
  if (el.id) return ['#' + CSS.escape(el.id)];
  return [];
}
function restaurarFoco(previo, selectores) {
  if (!previo || previo === document.body || document.contains(previo)) return;
  const destino = selectores.map(s => document.querySelector(s)).find(Boolean) || document.querySelector('#vista h2');
  destino.focus({preventScroll: true});
}

function pintar() {
  const R = filtrados(), n = R.length;
  const previo = document.activeElement, foco = selectorFoco(previo);
  pintarFiltros();
  document.getElementById('chips').innerHTML = (META.dummy ? '<span class="chip dummy">DATOS DUMMY</span>' : '') +
    `<span class="chip">Fecha de corte: <b>${META.corte}-01</b></span><span class="chip">Equipos en el filtro: <b class="num">${fmt(n)}</b></span>`;
  document.getElementById('incidencias').innerHTML = `<span><b>⚠ Incidencias abiertas</b></span>
    <span><b class="num">${fmt(contar(R, f => f.cif === 'noc'))}</b> sin cifrar</span>
    <span><b class="num">${fmt(contar(R, f => f.cif === 'sd'))}</b> sin dato de cifrado</span>
    <span><b class="num">${fmt(contar(R, f => f.flag_compliant_sin_cifrar))}</b> Compliant sin cifrar</span>
    <span><b class="num">${fmt(contar(R, f => f.windows10_fuera_de_soporte && f.cif === 'noc'))}</b> con Windows 10 sin cifrar</span>
    <span class="fija">Franja fija: no se puede cerrar ni silenciar</span>`;
  document.getElementById('contador').innerHTML = `Equipos en el filtro: <b class="num">${fmt(n)}</b> de ${fmt(EQUIPOS.length)}`;
  const t = PESTANAS.find(x => x.id === ESTADO.tab);
  document.getElementById('vista').innerHTML = `<h2 tabindex="-1">${t.et}</h2><p class="pregunta">${t.p}</p>` + VISTAS[t.id](R);
  pintarTabs();
  mejorarAccesibilidad();
  restaurarFoco(previo, foco);
}

document.addEventListener('change', e => {
  const hc = e.target.dataset.hcorte;
  if (hc) { ESTADO.hist[hc] = e.target.value; PAGINA.comparacion = 0; pintar(); return; }
  const f = e.target.dataset.filtro;
  if (f) {
    ESTADO.filtros[f] = [...document.querySelectorAll(`input[data-filtro="${f}"]:checked`)].map(i => i.value);

  for (const k in PAGINA) {
    PAGINA[k] = 0;
  }

  pintar();
}

});
document.addEventListener('input', e => {
  if (e.target.id === 'buscar') { BUSCAR = e.target.value; PAGINA.detalle = 0; const pos = e.target.selectionStart; pintar();
    const b = document.getElementById('buscar'); b.focus(); b.setSelectionRange(pos, pos); }
});
document.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.id === 'limpiar') {
    ESTADO.filtros = {};
    for (const k in PAGINA) {
      PAGINA[k] = 0;
    }
    pintar();
  }
    
else if (b.dataset.irPais) {
  ESTADO.filtros.pais = [b.dataset.irPais];
  ESTADO.tab = 'incidencias';
  pintar();
} 
  else if (b.dataset.irIncidencia) {
    ESTADO.incidencia = b.dataset.irIncidencia; ESTADO.tab = 'detalle'; PAGINA.detalle = 0;
    try { history.replaceState(null, '', '#detalle'); } catch (_) { /* vista previa aislada */ }
    pintar(); window.scrollTo({top: document.getElementById('tabs').offsetTop - 10});
  }
  else if (b.dataset.irTab) { ESTADO.tab = b.dataset.irTab; try { history.replaceState(null, '', '#' + b.dataset.irTab); } catch (_) { /* vista previa aislada */ } pintar(); window.scrollTo({top: document.getElementById('tabs').offsetTop - 10}); }
  else if (b.dataset.quitarIncidencia) { ESTADO.incidencia = null; PAGINA.detalle = 0; pintar(); }
  else if (b.dataset.tab) { ESTADO.tab = b.dataset.tab; 
if (ESTADO.tab === 'detalle') ESTADO.incidencia = null;try { history.replaceState(null, '', '#' + b.dataset.tab); } catch (_) { /* vista previa aislada: no se puede cambiar la URL */ } pintar(); window.scrollTo({top: document.getElementById('tabs').offsetTop - 10}); }
  else if (b.dataset.pag) { PAGINA[b.dataset.pag] = (PAGINA[b.dataset.pag] || 0) + Number(b.dataset.d); pintar(); }
  else if (b.dataset.csv) { const T = TABLAS[b.dataset.csv]; descargarCSV(T.csv || b.dataset.csv, T.columnas, T.filas); }
});

// Menús de filtro: uno abierto a la vez; se cierran con Escape o con un clic fuera
document.addEventListener('toggle', e => {
  if (e.target.matches && e.target.matches('details.filtro') && e.target.open)
    document.querySelectorAll('details.filtro[open]').forEach(d => { if (d !== e.target) d.open = false; });
}, true);
document.addEventListener('click', e => {
  if (!e.target.closest('details.filtro')) document.querySelectorAll('details.filtro[open]').forEach(d => { d.open = false; });
});
document.addEventListener('keydown', e => {
  const d = e.key === 'Escape' && e.target.closest && e.target.closest('details.filtro[open]');
  if (d) { d.open = false; d.querySelector('summary').focus(); }
});

