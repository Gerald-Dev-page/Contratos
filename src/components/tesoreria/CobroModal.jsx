import { useState, useMemo } from 'react';
import { X, DollarSign, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { liquidarCuota } from '../../utils/finance';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { registrarMovimiento } from '../../utils/logger';
import { comprimirImagen } from '../../utils/fileCompressor';
export default function CobroModal({ cuota, onClose, onPagoRegistrado }) {
  const { user } = useAuth();
  const { mostrarToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [comprobanteFile, setComprobanteFile] = useState(null);
  const [metodoPago, setMetodoPago] = useState('Transferencia Bancaria');
  const [observaciones, setObservaciones] = useState('');
  const [cobrarMoraAhora, setCobrarMoraAhora] = useState(true);

  // Liquidación considerando si la cuota ya tiene la mora saldada previamente
  const liquidacion = useMemo(() => {
    if (!cuota) return { subtotal: 0, recargoMora: 0, totalExigible: 0, enMora: false };
    
    // Si la cuota ya tiene un subtotal calculado con IPC desde la vista de caja, lo usamos
    const ipc = cuota.monto_ipc_vigente || 0;
    const res = liquidarCuota(cuota, new Date(), ipc);

    if (cuota.mora_saldada) {
      return {
        ...res,
        recargoMora: 0,
        totalExigible: res.subtotal,
        enMora: false
      };
    }
    return res;
  }, [cuota]);

  if (!cuota) return null;

  const montoFinalCobro = liquidacion.enMora && !cobrarMoraAhora
    ? liquidacion.subtotal
    : liquidacion.totalExigible;

const handleSubmit = async (e) => {
  e.preventDefault();
  if (!comprobanteFile) {
    mostrarToast('Debes adjuntar el comprobante emitido.', 'error');
    return;
  }

  setLoading(true);
  try {
    // 1. Procesamiento y compresión en el cliente antes de subir
    let archivoListo = comprobanteFile;

    if (comprobanteFile.type.startsWith('image/')) {
      archivoListo = await comprimirImagen(comprobanteFile);
    } else if (comprobanteFile.type === 'application/pdf') {
      archivoListo = await optimizarPdf(comprobanteFile);
    }

    // 2. Extraer la extensión del archivo ya procesado (si era imagen ahora es .webp)
    const extension = archivoListo.name.split('.').pop();
    const path = `comprobantes/${cuota.contratos?.numero_expediente}_cuota_${cuota.numero_cuota}_${Date.now()}.${extension}`;

    // 3. Subir el archivo optimizado
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('comprobantes-pago')
      .upload(path, archivoListo, { upsert: true });

    if (uploadError) throw uploadError;

    const moraCobradaEfectiva = liquidacion.enMora && cobrarMoraAhora ? liquidacion.recargoMora : 0;

    // 4. Asentar el pago de capital
    const { error: pagoError } = await supabase.from('pagos').insert([{
      cuota_id: cuota.id,
      fecha_pago: new Date().toISOString().split('T')[0],
      monto_abonado: montoFinalCobro,
      pago_fuera_termino: liquidacion.enMora,
      interes_mora_cobrado: moraCobradaEfectiva,
      metodo_pago: metodoPago,
      comprobante_url: uploadData.path,
      observaciones: observaciones.trim() + (!cobrarMoraAhora && liquidacion.enMora ? ' [Mora diferida]' : ''),
      es_saldo_mora: false,
      registrado_por: user.id
    }]);

    if (pagoError) throw pagoError;

      // 2. Marcar cuota como pagada
     const { error: cuotaError } = await supabase
        .from('cuotas')
        .update({
          estado: 'pagada',
          monto_ajuste_ipc: liquidacion.montoIpc,
          valor_indice_aplicado: liquidacion.montoIpc,
          monto_recargo_mora: moraCobradaEfectiva,
          monto_total_exigible: montoFinalCobro,
          fecha_fijacion_ipc: cuota.numero_cuota > 12 ? new Date().toISOString() : null,
          mora_saldada: true
        })
        .eq('id', cuota.id);

      if (cuotaError) throw cuotaError;

      // 3. REGISTRAR EN AUDITORÍA (Aquí va)
     await registrarMovimiento({
  usuario: user,
  modulo: 'TESORERIA',
  accion: 'COBRO_CUOTA',
  descripcion: `Cobro de Cuota #${cuota.numero_cuota} ($${montoFinalCobro.toLocaleString('es-AR')}) del Exp. ${cuota.contratos?.numero_expediente}`,
  expedienteId: cuota.contratos?.id,
  detalles: { cuota_id: cuota.id, monto: montoFinalCobro, metodo: metodoPago }
});

      mostrarToast(`Pago de Cuota #${cuota.numero_cuota} registrado con éxito.`);
      onPagoRegistrado();
      onClose();
    } catch (err) {
      mostrarToast(`Error al registrar cobro: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
      <div className="card-ergonomica w-full max-w-lg bg-white overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-warm)] bg-[var(--color-bg-surface)]">
          <div>
            <h3 className="font-bold text-sm text-[var(--color-text-primary)]">Registrar Cobranza</h3>
            <p className="text-[11px] text-[var(--color-text-secondary)]">
              Exp: {cuota.contratos?.numero_expediente} • Cuota #{cuota.numero_cuota}
            </p>
          </div>
          <button onClick={onClose} className="btn-icono text-xs">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Si ya saldó la mora previamente */}
          {cuota.mora_saldada && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle2 size={15} className="shrink-0" />
              <span>La mora de esta cuota ya fue cancelada previamente. Se cobra únicamente el capital base.</span>
            </div>
          )}

          {liquidacion.enMora && !cuota.mora_saldada && (
            <div className="p-3 rounded-lg bg-[var(--color-status-danger-bg)] border border-rose-200 text-xs text-[var(--color-status-danger)] space-y-2">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle size={15} />
                <span>Cuota Vencida (+{liquidacion.porcentajeMora}% de Mora)</span>
              </div>
              <div className="flex items-center gap-2 pt-1 border-t border-rose-200/60">
                <input
                  type="checkbox"
                  id="chkMora"
                  checked={cobrarMoraAhora}
                  onChange={(e) => setCobrarMoraAhora(e.target.checked)}
                  className="rounded text-indigo-600 cursor-pointer"
                />
                <label htmlFor="chkMora" className="text-[11px] text-slate-800 cursor-pointer">
                  Cobrar recargo de mora en este acto (${liquidacion.recargoMora.toLocaleString('es-AR')})
                </label>
              </div>
            </div>
          )}

          <div className="p-4 rounded-lg bg-[var(--color-bg-egg)] border border-[var(--color-border-warm)] text-xs space-y-2">
            <div className="flex justify-between text-slate-600">
              <span>Monto Base Cuota:</span>
              <span className="font-semibold">${Number(cuota.monto_base).toLocaleString('es-AR')}</span>
            </div>
            {liquidacion.enMora && cobrarMoraAhora && !cuota.mora_saldada && (
              <div className="flex justify-between text-rose-600 font-semibold">
                <span>Interés de Mora:</span>
                <span>+${liquidacion.recargoMora.toLocaleString('es-AR')}</span>
              </div>
            )}
            <div className="pt-2 border-t border-[var(--color-border-warm)] flex justify-between text-sm font-bold text-slate-900">
              <span>Total Percibido:</span>
              <span className="text-indigo-600">${montoFinalCobro.toLocaleString('es-AR')}</span>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1">Medio de Pago</label>
              <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)} className="input-ergonomico text-xs">
                <option value="Transferencia Bancaria">Transferencia Bancaria</option>
                <option value="Depósito en Cuenta">Depósito en Cuenta</option>
                <option value="Efectivo / Caja">Efectivo / Caja</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1">Comprobante de Caja</label>
              <input
                required
                type="file"
                accept="image/*,application/pdf"
                className="text-xs file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-indigo-50 file:text-indigo-700 file:font-semibold hover:file:bg-indigo-100 cursor-pointer"
                onChange={(e) => setComprobanteFile(e.target.files[0])}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1">Observaciones</label>
              <input
                type="text"
                placeholder="Referencia de pago o nota..."
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                className="input-ergonomico text-xs"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--color-border-warm)]">
            <button type="button" onClick={onClose} className="btn-icono px-4 text-xs font-medium">Cancelar</button>
            <button type="submit" disabled={loading} className="btn-primario text-xs">
              {loading ? <Loader2 size={14} className="animate-spin" /> : <DollarSign size={14} />} Confirmar Cobro
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}