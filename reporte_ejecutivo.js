/* reporte_ejecutivo.js · Integrante 3 (T4): contenido del PDF ejecutivo (para dirección).
 * Se incrusta después de reportes.js. Define REPORTES.ejecutivo = (R, ctx) => html (contrato en reportes.js).
 * Reutiliza el Resumen: kpi(), barraCifrado(), dondeActuar(), cambioContraAnterior(), barrasApiladas() (solo recencia), indicadoresResumen() y las tablas de Países y regiones (semaforoPaisRegion()).
 */
REPORTES.ejecutivo = (R, ctx) => {
  const n = R.length, inc = repIncidencias(R), A = dondeActuar(R), SP = semaforoPaisRegion(R, {enlace: false});
  const HI = DATOS.historico || {}, filas = HI.filas || [], act = filas[filas.length - 1], prev = filas[filas.length - 2];

  const colsInc = [{et: 'Incidencia', v: x => x.nombre}, {et: 'Prioridad', v: x => x.nivel},
    {et: 'Equipos afectados', n: 1, v: x => fmt(x.cantidad), html: x => `<b>${fmt(x.cantidad)}</b> <span class="sub">(${pct(x.cantidad, n)})</span>`},
    {et: 'Variación vs corte anterior', n: 1, v: x => repFvarInc(x.variacion)}];

  const comparacion = cambioContraAnterior().filas;

  return `${indicadoresResumen(R, {clase: 'rep-g4 rep-hallazgos', ambito: 'del alcance'})}
    <section class="rep-sec"><h2>Estado y clasificación del cifrado</h2>${barraCifrado(R)}
      <p class="rep-nota">«Sin cifrar» es un incumplimiento; «Sin dato» es un punto ciego (no se puede confirmar el estado).</p></section>
    <section class="rep-sec"><h2>Dónde actuar primero</h2><div class="rep-g2 rep-actuar"><div>${A.dona}</div>
      <div>${repTabla(A.cols, A.orden, {vacio: 'Ningún país está en Rojo ni en Ámbar.'})}</div></div>
      <p class="rep-nota">${NOTA_SEMAFORO_CORTA()}</p></section>
    <section class="rep-sec"><h2>Países y regiones</h2>
      <h3>Semáforo y puntaje por país</h3>${repTabla(SP.colsPais, SP.P, {vacio: 'Sin equipos en el alcance.'})}
      <h3>Semáforo y puntaje por región</h3>${repTabla(SP.colsRegion, SP.G, {vacio: 'Sin equipos en el alcance.'})}
      <p class="rep-nota">${NOTA_SEMAFORO()} Las tablas van de menor a mayor puntaje.</p></section>
    <section class="rep-sec"><h2>Cambio frente al corte anterior</h2>${comparacion.length
      ? repTabla([{et: 'Indicador', v: x => x.et}, {et: prev.corte, n: 1, v: x => repFval(x.a, x.pct)}, {et: act.corte, n: 1, v: x => repFval(x.b, x.pct)},
                  {et: 'Variación', n: 1, v: x => repFvar(x.v, x.pct)}], comparacion)
      : '<div class="vacio">Primer corte: todavía no hay un corte anterior con el cual comparar.</div>'}</section>
    <section class="rep-sec"><h2>Cifrado por recencia del último logon</h2>${barrasApiladas(cifradoPorRecencia(R), {etiqueta: 'Cifrado por recencia del último logon'})}</section>
    <section class="rep-sec"><h2>Incidencias por atender</h2>${repTabla(colsInc, inc, {vacio: 'No hay catálogo de incidencias en este corte.'})}
      <p class="rep-nota">Ordenadas por prioridad y, dentro de cada una, por equipos afectados. ${act && prev
        ? `La variación compara los totales completos del corte ${esc(act.corte)} contra ${esc(prev.corte)}; no cambia con los filtros.` : 'La variación aparece cuando el historial tiene al menos 2 cortes.'}
        El nivel de prioridad es provisional (por validar con FEMSA).</p></section>`;
};
