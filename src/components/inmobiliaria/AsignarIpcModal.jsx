import { useState } from 'react';
import { X, TrendingUp, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { registrarMovimiento } from '../../utils/logger';

export default function AsignarIpcModal({ contrato, bloque, onClose, onActualizado }) {
  const { user } = useAuth();
  const { mostrarToast } = useToast();
  const [nuevoMontoIpc, setNuevoMontoIpc] = useState('');
  const [loading, setLoading] = useState(false);

  if (!contrato) return null;

  const cuotaInicio = (bloque - 1) * 12 + 1;
  const cuotaFin = Math.min(bloque * 12, contrato.cantidad_cuotas);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const valorIpc = Number(nuevoMontoIpc);

    if (isNaN(valorIpc) || valorIpc < 0) {
      mostrarToast('Ingrese un valor de IPC válido.', 'error');
      return;
    }

    setLoading(true);
    try {
      // 1. Obtener las cuotas del bloque
      const { data: cuotasBloque, error: fetchErr } = await supabase
        .from('cuotas')
        .select('id, numero_cuota, monto_base, estado')
        .eq('contrato_id', contrato.id)
        .gte('numero_cuota', cuotaInicio)
        .lte('numero_cuota', cuotaFin);

      if (fetchErr) throw fetchErr;

      // 2. Actualizar monto_ajuste_ipc y monto_total_exigible en cada cuota pendiente del bloque
      for (const q of cuotasBloque) {
        const nuevoTotal = Number(q.monto_base) + valorIpc;
        await supabase
          .from('cuotas')
          .update({
            monto_ajuste_ipc: valorIpc,
            monto_total_exigible: nuevoTotal,
            fecha_fijacion_ipc: new Date().toISOString()
          })
          .eq('id', q.id);
      }

      // 3. Auditoría
      await registrarMovimiento({
        usuario: user,
        modulo: 'INMOBILIARIA',
        accion: 'AJUSTE_IPC_CONTRATO',
        descripcion: `Fijación IPC Bloque Año ${bloque} ($${valorIpc.toLocaleString('es-AR')}) para Exp. ${contrato.numero_expediente} (Cuotas ${cuotaInicio} a ${cuotaFin})`,
        expedienteId: contrato.id,
        detalles: { bloque, valorIpc, cuotaInicio, cuotaFin }
      });

      mostrarToast(`IPC de $${valorIpc.toLocaleString('es-AR')} aplicado a las cuotas ${cuotaInicio} a ${cuotaFin}.`);
      onActualizado();
      onClose();
    } catch (err) {
      mostrarToast(`Error al aplicar IPC: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
      <div className="card-ergonomica w-full max-w-md bg-white overflow-hidden shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 text-indigo-700 rounded-lg">
              <TrendingUp size={18} />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900">Fijar IPC Anual del Contrato</h3>
              <p className="text-[11px] text-slate-500 font-mono">Exp: {contrato.numero_expediente}</p>
            </div>
          </div>
          <button onClick={onClose} className="btn-icono p-1 text-slate-400 hover:text-slate-600">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 flex gap-2">
            <AlertCircle size={16} className="shrink-0 text-amber-600 mt-0.5" />
            <div>
              <p className="font-semibold">Bloque Año {bloque} (Cuotas {cuotaInicio} a {cuotaFin})</p>
              <p className="text-[11px] text-amber-800 mt-0.5">
                El valor que ingreses se sumará como ajuste fijo a cada cuota de este período.
              </p>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Valor Adicional de IPC a aplicar ($) *
            </label>
            <input
              type="number"
              required
              min="0"
              step="any"
              placeholder="Ej: 45000"
              value={nuevoMontoIpc}
              onChange={(e) => setNuevoMontoIpc(e.target.value)}
              className="input-ergonomico w-full py-2 px-3 text-sm font-bold text-slate-900"
              autoFocus
            />
          </div>

          <div className="pt-2 border-t border-slate-100 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="btn-icono py-2 px-3 text-xs"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-primario py-2 px-4 text-xs font-bold flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700"
            >
              {loading && <Loader2 size={13} className="animate-spin" />}
              {loading ? 'Aplicando...' : 'Confirmar e Impactar Cuotas'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}