/* reporte_tecnico.js · Integrante 2 (T5): contenido del PDF técnico (datos de detalle).
 * Se incrusta después de reportes.js. Define REPORTES.tecnico = (R, ctx) => html (contrato en reportes.js).
 * Volumen: el listado general se limita a ctx.tope filas y cada incidencia a REP_POR_INCIDENCIA, con aviso visible
 * (imprimir decenas de miles de filas congela el navegador). El CSV completo sigue en «Detalle y descarga».
 */
REPORTES.tecnico = (R, ctx) => {
  const n = R.length, HI = DATOS.historico || {}, filas = HI.filas || [], act = filas[filas.length - 1], prev = filas[filas.length - 2];
  const fila = (k, v) => `<tr><td>${k}</td><td>${v}</td></tr>`;

  // 1. Parámetros
  const parametros = `<table class="rep-tabla rep-corta rep-kv"><tbody>
      ${fila('Corte', esc(ctx.corte) + '-01')}${fila('Archivo fuente', esc(META.archivo))}${fila('Generado', esc(META.generado))}
      ${fila('Alcance', ctx.alcance === 'filtros' ? 'Con los filtros activos' : 'General (todo el corte)')}
      ${fila('Equipos en el alcance', `${fmt(n)} de ${fmt(ctx.total)}`)}
      ${fila('Filtros', ctx.filtros.length ? ctx.filtros.map(f => `${esc(f.et)}: ${f.valores.map(esc).join(', ')}`).join('<br>') : 'Ninguno')}
      ${fila('Reglas de limpieza aplicadas', fmt((DATOS.reglas || []).length))}</tbody></table>`;

  // 2. Indicadores
  const ind = [
    ['Equipos', n], ['Cifrados', contar(R, f => f.cif === 'cif')], ['Sin cifrar', contar(R, f => f.cif === 'noc')], ['Sin dato de cifrado', contar(R, f => f.cif === 'sd')],
    ['Compliant', contar(R, f => f.estado_cumplimiento === 'Compliant')], ['Compliant sin cifrar', contar(R, f => f.flag_compliant_sin_cifrar)],
    ['Windows 10 (fuera de soporte)', contar(R, f => f.windows10_fuera_de_soporte)], ['Windows 10 sin cifrar', contar(R, f => f.windows10_fuera_de_soporte && f.cif === 'noc')],
    ['Inactivos más de 90 días', contar(R, f => f.inactivo_mas_90d)], ['Solo en AD', contar(R, f => f.en_ad && !f.en_mdm && !f.en_macos)],
    ['Solo en MDM', contar(R, f => f.en_mdm && !f.en_ad)], ['Sin usuario asignado', contar(R, f => f.usuario_sin_asignar)],
  ].map(([et, v]) => ({et, v}));
  const colsInd = [{et: 'Indicador', v: x => x.et}, {et: 'Equipos', n: 1, v: x => fmt(x.v)}, {et: '% del alcance', n: 1, v: x => pct(x.v, n)}];

  // 3. Cifrado efectivo y por país
  const efectivo = CAT_EFECTIVO.map(c => ({et: c.et, v: contar(R, f => f.cifrado_efectivo === c.et)}));
  const porPais = [...agrupar(R, f => f.pais)].map(([p, L]) => {
    const P = puntuar(L);
    return {p, n: L.length, cat: CAT_EFECTIVO.map(c => contar(L, f => f.cifrado_efectivo === c.et)), puntos: P.puntos, sem: P.sem};
  }).sort((a, b) => b.n - a.n);
  const colsPais = [{et: 'País', v: x => x.p}, {et: 'Equipos', n: 1, v: x => fmt(x.n)},
    ...CAT_EFECTIVO.map((c, i) => ({et: c.et.replace('Cifrado sin validar configuración', 'Sin validar config.').replace('Cifrado ', ''), n: 1, v: x => fmt(x.cat[i])})),
    {et: 'Puntaje', n: 1, v: x => x.puntos.toFixed(0)},
    {et: 'Semáforo', v: x => x.sem[0], html: x => `<span class="semaforo"><i style="background:${x.sem[1]}"></i>${x.sem[0]}</span>`}];

  // 4. Incidencias
  const inc = repIncidencias(R);
  const colsInc = [{et: 'Incidencia', v: x => x.nombre}, {et: 'Criterio', v: x => x.criterio}, {et: 'Prioridad', v: x => x.nivel},
    {et: 'Equipos', n: 1, v: x => fmt(x.cantidad)}, {et: '% del alcance', n: 1, v: x => pct(x.cantidad, n)}, {et: 'Variación vs corte anterior', n: 1, v: x => repFvarInc(x.variacion)}];

  // 5. Calidad: motivo del hueco y reglas
  const motivos = [...agrupar(R.filter(f => f.motivo_sin_dato && f.motivo_sin_dato !== 'Completo'), f => f.motivo_sin_dato)].map(([m, L]) => ({m, v: L.length})).sort((a, b) => b.v - a.v);
  const reglas = (DATOS.reglas || []).map((r, i) => ({i: i + 1, ...r}));

  // 6. Comparación de cortes (todas las métricas)
  const comparacion = act && prev ? (HI.metricas || []).map(m => {
    const a = _num(prev[m.columna]), b = _num(act[m.columna]);
    return {et: m.etiqueta, a, b, v: a === null || b === null ? null : +(b - a).toFixed(m.porcentaje ? 1 : 0), pct: m.porcentaje};
  }) : [];

  // 7. Listados de equipos
  const colsLista = [C.equipo, C.usuario, C.pais, C.fuente, C.version, C.efectivo, C.cum, C.banda];
  const listasInc = inc.filter(x => x.cantidad > 0).map(x => `<div class="rep-sublista"><h3>${esc(x.nombre)} <span class="sub">· ${fmt(x.cantidad)} ${pl(x.cantidad, 'equipo')} · prioridad ${esc(x.nivel)}</span></h3>` +
    repTabla(colsLista, R.filter(f => f[x.columna] === true), {max: REP_POR_INCIDENCIA}) + `</div>`).join('');
  const colsGeneral = [C.equipo, C.usuario, C.pais, C.region, C.fuente, C.version, C.tpm, C.ready, C.efectivo, C.cum, C.mes, C.banda];
  const general = [...R].sort((a, b) => (b.con_alerta ? 1 : 0) - (a.con_alerta ? 1 : 0) || String(a.equipo_id).localeCompare(String(b.equipo_id)));

  return `<section class="rep-sec"><h2>1. Parámetros y alcance</h2>${parametros}</section>
    <section class="rep-sec"><h2>2. Indicadores del alcance</h2>${repTabla(colsInd, ind, {corta: true})}</section>
    <section class="rep-sec"><h2>3. Cifrado efectivo por país</h2>
      ${repTabla([{et: 'Categoría', v: x => x.et}, {et: 'Equipos', n: 1, v: x => fmt(x.v)}, {et: '% del alcance', n: 1, v: x => pct(x.v, n)}], efectivo, {corta: true})}
      <div class="rep-sub-esp"></div>${repTabla(colsPais, porPais, {vacio: 'Sin equipos en el alcance.'})}
      <p class="rep-nota">${NOTA_SEMAFORO()}</p></section>
    <section class="rep-sec"><h2>4. Catálogo de incidencias</h2>${repTabla(colsInc, inc, {vacio: 'No hay catálogo de incidencias en este corte.'})}
      <p class="rep-nota">${act && prev ? `La variación compara los totales completos de ${esc(act.corte)} contra ${esc(prev.corte)}; no cambia con los filtros.` : 'La variación aparece cuando el historial tiene al menos 2 cortes.'}
        Prioridades provisionales (por validar con FEMSA).</p></section>
    <section class="rep-sec"><h2>5. Calidad de datos</h2>
      ${repTabla([{et: 'Motivo del hueco', v: x => x.m}, {et: 'Equipos', n: 1, v: x => fmt(x.v)}], motivos, {vacio: 'Sin huecos en el alcance.', corta: true})}
      <div class="rep-sub-esp"></div><h3>Reglas de limpieza aplicadas (archivo completo)</h3>
      ${repTabla([{et: '#', n: 1, v: x => x.i}, {et: 'Regla', v: x => x.regla}, {et: 'Filas afectadas', n: 1, v: x => fmt(x.filas_afectadas)}, {et: 'Nota', v: x => x.nota || ''}], reglas, {vacio: 'Sin reglas registradas.'})}</section>
    <section class="rep-sec"><h2>6. Comparación con el corte anterior</h2>${comparacion.length
      ? repTabla([{et: 'Métrica', v: x => x.et}, {et: prev.corte, n: 1, v: x => repFval(x.a, x.pct)}, {et: act.corte, n: 1, v: x => repFval(x.b, x.pct)}, {et: 'Variación', n: 1, v: x => repFvar(x.v, x.pct)}], comparacion)
      : '<div class="vacio">Primer corte: todavía no hay un corte anterior con el cual comparar.</div>'}</section>
    <section class="rep-sec rep-saltar"><h2>7. Equipos por incidencia</h2>
      <p class="rep-nota">Primeros ${REP_POR_INCIDENCIA} equipos de cada incidencia con casos en el alcance. Los listados completos están en «Detalle y descarga».</p>${listasInc || '<div class="vacio">Ninguna incidencia tiene casos en el alcance.</div>'}</section>
    <section class="rep-sec rep-saltar"><h2>8. Listado general de equipos</h2>
      <p class="rep-nota">Primero los equipos con alguna alerta (sin cifrar, sin dato, Windows 10, TPM 1.2 o inactivos). Tope de este reporte: ${fmt(ctx.tope)} filas.</p>
      ${repTabla(colsGeneral, general, {max: ctx.tope, vacio: 'Sin equipos en el alcance.'})}</section>`;
};
