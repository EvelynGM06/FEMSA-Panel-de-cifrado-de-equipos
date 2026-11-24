/* reportes.js · Integrante 4 (T3): pestaña «Reportes» y base de impresión a PDF.
 * Se incrusta después de app.js, así que ya existen kpi, card, tabla, fmt, pct, esc, contar, filtrados(), ESTADO, VISTAS, PESTANAS…
 *
 * CONTRATO:
 *   REPORTES.ejecutivo = (R, ctx) => '<html>'    ← reporte_ejecutivo.js
 *   REPORTES.tecnico   = (R, ctx) => '<html>'    ← reporte_tecnico.js
 *   R   = equipos del alcance elegido (todos, o los de filtrados())
 *   ctx = {alcance: 'general'|'filtros', R, n, total, filtros: [{et, valores}], corte, tope}
 * Aquí viven la pestaña, el selector de alcance, la cabecera/franja/pie comunes y la llamada a window.print().
 * El PDF sale del navegador (Imprimir → Guardar como PDF): los filtros viven en JavaScript, el panel no usa servidor
 * ni librerías, y así el PDF respeta exactamente lo que el analista tiene filtrado.
 */
const REPORTES = {};
const REP = {alcance: 'general', tope: 500};
const REP_TOPES = [200, 500, 1000, 2000];             // máximo de filas del listado general del reporte técnico
const REP_POR_INCIDENCIA = 50;                        // filas por incidencia en el reporte técnico

/* ---------- utilidades comunes a los dos reportes ---------- */
function repFiltrosActivos() {
  return FILTROS.filter(x => Array.isArray(ESTADO.filtros[x.id]) && ESTADO.filtros[x.id].length)
                .map(x => ({et: x.et, valores: ESTADO.filtros[x.id]}));
}

function repContexto() {
  const activos = repFiltrosActivos(), filtrado = REP.alcance === 'filtros' && activos.length > 0;
  const R = filtrado ? filtrados() : EQUIPOS;
  return {alcance: filtrado ? 'filtros' : 'general', R, n: R.length, total: EQUIPOS.length, filtros: filtrado ? activos : [], corte: META.corte, tope: REP.tope};
}

/* Tabla estática (sin paginación ni botones) para imprimir. columnas = {et, n, v, html}, igual que tabla(). */
function repTabla(columnas, filas, {vacio = 'Sin registros.', max = null, corta = false} = {}) {
  if (!filas.length) return `<div class="vacio">${vacio}</div>`;
  const vis = max ? filas.slice(0, max) : filas;
  return `<table class="rep-tabla${corta ? ' rep-corta' : ''}"><thead><tr>${columnas.map(c => `<th class="${c.n ? 'n' : ''}">${c.et}</th>`).join('')}</tr></thead><tbody>` +
    vis.map(f => `<tr>${columnas.map(c => `<td class="${c.n ? 'n' : ''}">${c.html ? c.html(f) : esc(c.v(f))}</td>`).join('')}</tr>`).join('') + `</tbody></table>` +
    (vis.length < filas.length ? `<p class="rep-aviso">Se muestran ${fmt(vis.length)} de ${fmt(filas.length)} registros. El resto está en la pestaña «Detalle y descarga» (CSV).</p>` : '');
}

/* Incidencias del catálogo con equipos afectados en R y variación contra el corte anterior (totales de cada corte completo). */
function repIncidencias(R) {
  const HI = DATOS.historico || {}, catalogo = HI.catalogo_incidencias || [], filas = HI.filas || [];
  const act = filas[filas.length - 1], prev = filas[filas.length - 2], orden = {Alto: 0, Medio: 1, Bajo: 2};
  return catalogo.map(it => {
    const a = act ? _num(act['inc_' + it.id]) : null, b = prev ? _num(prev['inc_' + it.id]) : null;
    return {...it, cantidad: R.filter(f => f[it.columna] === true).length, variacion: a === null || b === null ? null : a - b};
  }).sort((x, y) => (orden[x.nivel] ?? 9) - (orden[y.nivel] ?? 9) || y.cantidad - x.cantidad);
}
const repFvarInc = v => v === null ? '—' : v === 0 ? '= sin cambio' : `${v > 0 ? '▲ +' : '▼ −'}${fmt(Math.abs(v))}`;
const repFval = (x, pctj) => x === null ? '—' : pctj ? x.toFixed(1) + '%' : fmt(x);
const repFvar = (v, pctj) => v === null ? '—' : `${_flecha(v)} ${_signo(v)}${pctj ? v.toFixed(1) + ' pp' : fmt(v)}`;

/* ---------- estructura común del PDF: cabecera, franja de incidencias y pie ---------- */
const REP_TITULOS = {ejecutivo: 'Reporte ejecutivo', tecnico: 'Reporte técnico'};

function repCabecera(tipo, ctx) {
  const filtros = ctx.filtros.length ? `<div class="rep-filtros-impresos"><b>Filtros aplicados:</b> ${ctx.filtros.map(f => `${esc(f.et)}: ${f.valores.map(esc).join(', ')}`).join(' · ')}</div>` : '';
  return `<header class="rep-cab"><div class="rep-marca">Panel de cifrado de equipos${META.dummy ? ' · <span class="rep-dummy">DATOS DUMMY</span>' : ''}</div>
    <h1>${REP_TITULOS[tipo]}</h1>
    <div class="rep-meta"><span>Corte: <b>${esc(ctx.corte)}-01</b></span><span>Archivo: <b>${esc(META.archivo)}</b></span><span>Generado: <b>${esc(META.generado)}</b></span>
      <span>Alcance: <b>${ctx.alcance === 'filtros' ? 'Con filtros activos' : 'General (todo el corte)'}</b> · <b class="num">${fmt(ctx.n)}</b> de ${fmt(ctx.total)} equipos${ctx.alcance === 'filtros' ? ` (${pct(ctx.n, ctx.total)})` : ''}</span></div>
    ${filtros}</header>`;
}

/* Misma franja que la de la pantalla (FEMSA pidió que las incidencias siempre estén visibles) */
function repFranja(R) {
  return `<div class="rep-franja"><b>⚠ Incidencias abiertas</b>
    <span><b class="num">${fmt(contar(R, f => f.cif === 'noc'))}</b> sin cifrar</span>
    <span><b class="num">${fmt(contar(R, f => f.cif === 'sd'))}</b> sin dato de cifrado</span>
    <span><b class="num">${fmt(contar(R, f => f.flag_compliant_sin_cifrar))}</b> Compliant sin cifrar</span>
    <span><b class="num">${fmt(contar(R, f => f.windows10_fuera_de_soporte && f.cif === 'noc'))}</b> con Windows 10 sin cifrar</span></div>`;
}

function repPie() {
  return `<footer class="rep-pie">Fin del reporte · Confidencial — uso interno · Generado por panel.py el ${esc(META.generado)} a partir de ${esc(META.archivo)} · Corte ${esc(META.corte)}</footer>`;
}

/* Arma el reporte dentro de #reporte (oculto en pantalla; solo se ve al imprimir). Devuelve el contexto usado. */
function repMontar(tipo) {
  repDesmontar();
  const ctx = repContexto(), cont = document.createElement('div');
  cont.id = 'reporte'; cont.className = `rep rep-${tipo}`;
  cont.innerHTML = repCabecera(tipo, ctx) + repFranja(ctx.R) + `<div class="rep-cuerpo">${REPORTES[tipo](ctx.R, ctx)}</div>` + repPie();
  document.body.appendChild(cont); document.body.classList.add('imprimiendo');
  return ctx;
}
function repDesmontar() {
  const viejo = document.getElementById('reporte'); if (viejo) viejo.remove();
  document.body.classList.remove('imprimiendo');
}

function repImprimir(tipo) {
  const ctx = repMontar(tipo), titulo = document.title;
  document.title = `Reporte_${tipo}_${META.corte}${ctx.alcance === 'filtros' ? '_filtrado' : ''}`;     // nombre sugerido del PDF
  const limpiar = () => { repDesmontar(); document.title = titulo; window.removeEventListener('afterprint', limpiar); };
  window.addEventListener('afterprint', limpiar);
  setTimeout(() => window.print(), 60);
}

/* ---------- pestaña «Reportes» ---------- */
VISTAS.reportes = R => {
  const activos = repFiltrosActivos(), hay = activos.length > 0;
  if (!hay && REP.alcance === 'filtros') REP.alcance = 'general';
  const sobre = REP.alcance === 'filtros' ? R : EQUIPOS, vacio = sobre.length === 0;
  const radio = (v, marcado, desactivado, txt) => `<label class="rep-opcion"><input type="radio" name="rep-alcance" value="${v}" ${marcado ? 'checked' : ''} ${desactivado ? 'disabled' : ''}> ${txt}</label>`;
  const boton = tipo => `<button class="btn rep-boton" data-rep="${tipo}" ${vacio ? 'disabled' : ''}>Generar PDF ${tipo === 'ejecutivo' ? 'ejecutivo' : 'técnico'}</button>`;
  return `<div class="grid g2">
      ${card('1. Elige el alcance', `<fieldset class="rep-alcance"><legend class="sr-only">Alcance del reporte</legend>
          ${radio('general', REP.alcance === 'general', false, `<b>General</b>: todo el corte (${fmt(EQUIPOS.length)} equipos)`)}
          ${radio('filtros', REP.alcance === 'filtros', !hay, `<b>Con los filtros activos</b>: ${fmt(R.length)} de ${fmt(EQUIPOS.length)} equipos`)}</fieldset>` +
        (hay ? `<ul class="rep-lista-filtros">${activos.map(f => `<li><b>${esc(f.et)}:</b> ${f.valores.map(esc).join(', ')}</li>`).join('')}</ul>`
             : `<div class="nota">No hay filtros activos. Elígelos arriba (país, región, fuente…) para generar un reporte solo con esos equipos.</div>`) +
        (vacio ? `<div class="vacio">Ningún equipo cumple los filtros actuales: no hay nada que reportar.</div>` : ''))}
      ${card('2. Guarda el PDF', `<ol class="rep-pasos"><li>Pulsa el botón del reporte que necesitas.</li>
          <li>En el cuadro de impresión, en «Destino», elige <b>Guardar como PDF</b>.</li>
          <li>Activa <b>Gráficos de fondo</b> (en «Más ajustes») para que salgan los colores y las tramas.</li><li>Guarda el archivo.</li></ol>
        <div class="nota">El PDF se genera en este equipo; los datos no salen del navegador. Trae datos del NDA: trátalo como confidencial.</div>`)}
    </div>
    <div class="grid g2 mt">
      ${card('Reporte ejecutivo (para dirección)', `<p>Lectura rápida del estado del cifrado: indicadores clave, barra, dona de cifrado, cifrado por recencia y por país, las 3 alertas más urgentes, incidencias por atender y cambio contra el corte anterior.</p>
        <p class="nota">Cerca de 2 páginas. Respeta el alcance elegido.</p><div class="acciones">${boton('ejecutivo')}</div>`)}
      ${card('Reporte técnico (datos de detalle)', `<p>Parámetros y filtros, indicadores, cifrado efectivo por país, catálogo de incidencias con su criterio, reglas de limpieza, comparación de cortes y listados de equipos (${REP_POR_INCIDENCIA} por incidencia y un listado general).</p>
        <div class="acciones"><label>Filas del listado general <select id="rep-tope">${REP_TOPES.map(t => `<option value="${t}" ${t === REP.tope ? 'selected' : ''}>${fmt(t)}</option>`).join('')}</select></label>${boton('tecnico')}</div>
        <p class="nota">Imprimir miles de filas es lento, por eso hay un tope. El listado completo está en «Detalle y descarga» (CSV).</p>`)}
    </div>`;
};

document.addEventListener('click', e => {
  const b = e.target.closest('button[data-rep]'); if (b && !b.disabled) repImprimir(b.dataset.rep);
});
document.addEventListener('change', e => {
  if (e.target.name === 'rep-alcance') { REP.alcance = e.target.value; pintar(); }
  else if (e.target.id === 'rep-tope') { REP.tope = Number(e.target.value); pintar(); }
});
