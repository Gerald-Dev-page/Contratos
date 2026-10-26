/**
 * Genera el plan proyectado de cuotas para un contrato.
 * Cuotas 1 a 12: fijas (sin IPC).
 * Cuota 13 en adelante: aplican porcentajeIpc sobre monto base.
 */
export function generarPlanCuotas(
  montoTotal, 
  cantidadCuotas, 
  porcentajeMora = 5.0, 
  porcentajeIpc = 0.0, 
  fechaReferencia = new Date()
) {
  const cuotas = [];
  const montoPorCuota = Number((Number(montoTotal) / Number(cantidadCuotas)).toFixed(2));
  
  const fechaSegura = (fechaReferencia instanceof Date && !isNaN(fechaReferencia))
    ? fechaReferencia 
    : new Date();

  const anioBase = fechaSegura.getFullYear();
  const mesBase = fechaSegura.getMonth();

  for (let i = 1; i <= cantidadCuotas; i++) {
    const fechaVenc = new Date(anioBase, mesBase + i, 10);
    const periodo = `${fechaVenc.getFullYear()}-${String(fechaVenc.getMonth() + 1).padStart(2, '0')}`;
    
    // Regla estricta: sólo a partir de la 13 aplica IPC
    const aplicaIpc = i > 12;
    const ajustePorc = aplicaIpc ? Number(porcentajeIpc) : 0;
    const montoIpc = aplicaIpc ? Number(((montoPorCuota * ajustePorc) / 100).toFixed(2)) : 0;
    const totalExigible = Number((montoPorCuota + montoIpc).toFixed(2));

    cuotas.push({
      numero_cuota: i,
      periodo,
      fecha_vencimiento: fechaVenc.toISOString().split('T')[0],
      monto_base: montoPorCuota,
      aplica_ipc: aplicaIpc,
      ajuste_ipc_porcentaje: ajustePorc,
      monto_ajuste_ipc: montoIpc,
      recargo_mora_porcentaje: Number(porcentajeMora) || 5.0,
      monto_total_exigible: totalExigible,
      estado: 'pendiente'
    });
  }

  return cuotas;
}

/**
 * Liquida el importe exigible de una cuota considerando:
 * - Cuotas 1 a 12: Base fija contractual.
 * - Cuotas 13+: Monto base + Ajuste de IPC publicado para su período.
 * - Mora: 5% aplicado sobre el subtotal resultante (Base + IPC).
 */
export function liquidarCuota(cuota, fechaComparacion = new Date(), ipcPeriodo = 0) {
  const base = Number(cuota.monto_base || 0);
  
  // Si ya tiene un IPC fijado históricamente lo respeta; si no, toma el IPC del período
  let ajusteIpc = 0;
  if (cuota.numero_cuota > 12) {
    if (cuota.monto_ajuste_ipc && Number(cuota.monto_ajuste_ipc) > 0) {
      ajusteIpc = Number(cuota.monto_ajuste_ipc);
    } else if (cuota.valor_indice_aplicado && Number(cuota.valor_indice_aplicado) > 0) {
      ajusteIpc = Number(cuota.valor_indice_aplicado);
    } else {
      ajusteIpc = Number(ipcPeriodo || 0);
    }
  }

  // Subtotal base exigible
  const subtotal = base + ajusteIpc;

  const fechaCalc = (fechaComparacion instanceof Date && !isNaN(fechaComparacion)) 
    ? fechaComparacion 
    : new Date();

  const diaActual = fechaCalc.getDate();
  const fechaVenc = new Date(cuota.fecha_vencimiento);

  // Fuera de término si ya pasó la fecha de vencimiento o si es el mismo mes pasadas las 23:59 del día 10
  const enMora = fechaCalc > fechaVenc || (
    fechaCalc.getMonth() === fechaVenc.getMonth() &&
    fechaCalc.getFullYear() === fechaVenc.getFullYear() &&
    diaActual > 10
  );

  const porcentajeMora = Number(cuota.recargo_mora_porcentaje || 5.0);
  const recargoMora = enMora ? Number(((subtotal * porcentajeMora) / 100).toFixed(2)) : 0;

  return {
    montoBase: base,
    montoIpc: ajusteIpc,
    subtotal,
    porcentajeMora,
    recargoMora,
    totalExigible: subtotal + recargoMora,
    enMora
  };
}