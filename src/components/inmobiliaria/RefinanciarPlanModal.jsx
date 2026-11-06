import { useState, useMemo } from 'react';
import { X, RefreshCw, AlertTriangle, CheckCircle2, Loader2, Calendar } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { registrarMovimiento } from '../../utils/logger';

export default function RefinanciarPlanModal({ contrato, cuotas, onClose, onPlanActualizado }) {
  const { user } = useAuth();
  const { mostrarToast } = useToast();
  const [loading, setLoading] = useState(false);

  // Cuotas pendientes que se van a reestructurar
  const cuotasImpagas = useMemo(() => {
    return (cuotas || []).filter(q => q.estado === 'pendiente');
  }, [cuotas]);

  // Cálculos de saldo deudor
  const capitalAdeudado = useMemo(() => {
    return cuotasImpagas.reduce((acc, q) => acc + Number(q.monto_base || 0) + Number(q.monto_ajuste_ipc || 0), 0);
  }, [cuotasImpagas]);

  const moraAcumulada = useMemo(() => {
    return cuotasImpagas.reduce((acc, q) => acc + Number(q.monto_recargo_mora || 0), 0);
  }, [cuotasImpagas]);

  // Formulario de refinanciación
  const [incluirMora, setIncluirMora] = useState(false);
  const [cantidadNuevasCuotas, setCantidadNuevasCuotas] = useState('6');
  const [fechaPrimerVencimiento, setFechaPrimerVencimiento] = useState(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [observaciones, setObservaciones] = useState('');

  const saldoTotalARefinanciar = capitalAdeudado + (incluirMora ? moraAcumulada : 0);
  const cantCuotasNum = Math.max(1, Number(cantidadNuevasCuotas) || 1);
  const valorNuevaCuota = saldoTotalARefinanciar / cantCuotasNum;

  const handleRefinanciar = async (e) => {
    e.preventDefault();
    if (cuotasImpagas.length === 0) {
      mostrarToast('El contrato no tiene cuotas pendientes para refinanciar.', 'error');
      return;
    }

    setLoading(true);
    try {
      // 1. Cancelar las cuotas viejas pendientes
      const idsImpagas = cuotasImpagas.map(q => q.id);
      const { error: cancelError } = await supabase
        .from('cuotas')
        .update({ 
          estado: 'refinanciada',
          observaciones: `Refinanciada en nuevo plan de ${cantCuotasNum} cuotas.`
        })
        .in('id', idsImpagas);

      if (cancelError) throw cancelError;

      // 2. Determinar la numeración de inicio (continúa correlativa o nuevo ciclo)
      const maxCuotaActual = Math.max(...(cuotas || []).map(q => q.numero_cuota), 0);
      const [anioBase, mesBase, diaBase] = fechaPrimerVencimiento.split('-').map(Number);

      const nuevasCuotas = [];
      for (let i = 1; i <= cantCuotasNum; i++) {
        const fechaCuota = new Date(anioBase, (mesBase - 1) + (i - 1), diaBase);
        const yyyy = fechaCuota.getFullYear();
        const mm = String(fechaCuota.getMonth() + 1).padStart(2, '0');
        const dd = String(fechaCuota.getDate()).padStart(2, '0');

        nuevasCuotas.push({
          contrato_id: contrato.id,
          numero_cuota: maxCuotaActual + i,
          bloque_anual: Math.ceil((maxCuotaActual + i) / 12),
          periodo: `${yyyy}-${mm}`,
          fecha_vencimiento: `${yyyy}-${mm}-${dd}`,
          monto_base: valorNuevaCuota,
          monto_ajuste_ipc: 0,
          recargo_mora_porcentaje: contrato.aplica_mora ? 5 : 0,
          monto_recargo_mora: 0,
          monto_total_exigible: valorNuevaCuota,
          estado: 'pendiente',
          mora_saldada: false,
          aplica_ipc: false
        });
      }

      const { error: insertError } = await supabase.from('cuotas').insert(nuevasCuotas);
      if (insertError) throw insertError;

      // 3. Actualizar la cantidad total de cuotas en el contrato
      await supabase
        .from('contratos')
        .update({ cantidad_cuotas: maxCuotaActual + cantCuotasNum })
        .eq('id', contrato.id);

      // 4. Auditoría
      await registrarMovimiento({
        usuario: user,
        modulo: 'INMOBILIARIA',
        accion: 'REFINANCIACION_PLAN',
        descripcion: `Refinanciación de deuda Exp. ${contrato.numero_expediente} (${contrato.titular_nombre}). Se anularon ${cuotasImpagas.length} cuotas viejas y se crearon ${cantCuotasNum} nuevas por $${valorNuevaCuota.toLocaleString('es-AR')} c/u.`,
        expedienteId: contrato.id,
        detalles: { saldoRefinanciado: saldoTotalARefinanciar, cuotasNuevas: cantCuotasNum }
      });

      mostrarToast('Plan de pago reestructurado con éxito.');
      onPlanActualizado();
      onClose();
    } catch (err) {
      mostrarToast(`Error al refinanciar: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
      <div className="card-ergonomica w-full max-w-lg bg-white overflow-hidden shadow-2xl border border-slate-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2">
            <RefreshCw size={18} className="text-indigo-600" />
            <div>
              <h3 className="font-bold text-sm text-slate-900">Reestructurar / Nuevo Plan de Pago</h3>
              <p className="text-[11px] text-slate-500">Exp. {contrato.numero_expediente} • {contrato.titular_nombre}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-200 text-slate-500 cursor-pointer">
            <X size={16} />
          </button>
        </div>

        {/* Contenido */}
        <form onSubmit={handleRefinanciar} className="p-6 space-y-4">
          
          {/* Resumen Deuda Actual */}
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs space-y-1.5">
            <div className="flex justify-between text-amber-950 font-medium">
              <span>Cuotas Pendientes a Cancelar:</span>
              <span className="font-bold">{cuotasImpagas.length} cuotas</span>
            </div>
            <div className="flex justify-between text-amber-900">
              <span>Capital Base Adeudado:</span>
              <span className="font-bold">${capitalAdeudado.toLocaleString('es-AR', { maximumFractionDigits: 2 })}</span>
            </div>
            {moraAcumulada > 0 && (
              <div className="flex justify-between text-rose-700">
                <span>Mora Acumulada:</span>
                <span className="font-bold">${moraAcumulada.toLocaleString('es-AR', { maximumFractionDigits: 2 })}</span>
              </div>
            )}
          </div>

          {/* Opciones de la refinanciación */}
          <div className="space-y-3">
            {moraAcumulada > 0 && (
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <input
                  type="checkbox"
                  checked={incluirMora}
                  onChange={(e) => setIncluirMora(e.target.checked)}
                  className="rounded text-indigo-600 cursor-pointer"
                />
                <span>¿Sumar la mora acumulada al nuevo saldo a financiar?</span>
              </label>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Cantidad de Cuotas *</label>
                <input
                  type="number"
                  min="1"
                  max="72"
                  required
                  value={cantidadNuevasCuotas}
                  onChange={(e) => setCantidadNuevasCuotas(e.target.value)}
                  className="input-ergonomico w-full text-xs font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">1° Nuevo Vencimiento *</label>
                <input
                  type="date"
                  required
                  value={fechaPrimerVencimiento}
                  onChange={(e) => setFechaPrimerVencimiento(e.target.value)}
                  className="input-ergonomico w-full text-xs font-bold"
                />
              </div>
            </div>

            {/* Proyección de la nueva cuota */}
            <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-xs flex justify-between items-center">
              <div>
                <span className="text-indigo-900 font-semibold block">Nueva Cuota Mensual</span>
                <span className="text-[11px] text-indigo-700">{cantCuotasNum} cuotas fijas de:</span>
              </div>
              <span className="text-base font-extrabold text-indigo-950">
                ${valorNuevaCuota.toLocaleString('es-AR', { maximumFractionDigits: 2 })}
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Motivo / Observaciones</label>
              <input
                type="text"
                placeholder="Ej: Acuerdo de prórroga por finalización de contrato..."
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                className="input-ergonomico w-full text-xs"
              />
            </div>
          </div>

          {/* Acciones */}
          <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={loading} className="btn-icono px-4 text-xs font-medium cursor-pointer">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || cuotasImpagas.length === 0}
              className="btn-primario py-2 px-5 text-xs font-bold flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-xs cursor-pointer disabled:opacity-50"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              {loading ? 'Aplicando Plan...' : 'Confirmar Reestructuración'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}