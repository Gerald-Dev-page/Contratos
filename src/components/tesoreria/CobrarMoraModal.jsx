import { useState } from 'react';
import { X, DollarSign, Loader2 } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { registrarMovimiento } from '../../utils/logger';
export default function CobrarMoraModal({ contrato, montoMora, cuotasAfectadas, onClose, onMoraCobrada }) {
  const { user } = useAuth();
  const { mostrarToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [comprobanteFile, setComprobanteFile] = useState(null);
  const [metodoPago, setMetodoPago] = useState('Transferencia Bancaria');

  if (!contrato || montoMora <= 0) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!comprobanteFile) {
      mostrarToast('Debes adjuntar el comprobante emitido.', 'error');
      return;
    }

    setLoading(true);
    try {
      const ext = comprobanteFile.name.split('.').pop();
      const path = `comprobantes/mora_${contrato.numero_expediente}_${Date.now()}.${ext}`;

      // 1. Subir comprobante a Storage
      const { data: upData, error: upError } = await supabase.storage
        .from('comprobantes-pago')
        .upload(path, comprobanteFile, { upsert: true });

      if (upError) throw upError;

      const cuotaRefId = cuotasAfectadas[0]?.id;

      // 2. Registrar el pago en la tabla pagos
      const { error: pagoError } = await supabase.from('pagos').insert([{
        cuota_id: cuotaRefId,
        fecha_pago: new Date().toISOString().split('T')[0],
        monto_abonado: montoMora,
        pago_fuera_termino: true,
        interes_mora_cobrado: montoMora,
        metodo_pago: metodoPago,
        comprobante_url: upData.path,
        observaciones: `Cancelación directa de mora acumulada ($${montoMora.toLocaleString('es-AR')})`,
        es_saldo_mora: true,
        registrado_por: user.id
      }]);

      if (pagoError) throw pagoError;

      // 3. Actualizar TODAS las cuotas afectadas a mora_saldada = true
      const idsCuotas = cuotasAfectadas.map((q) => q.id);
      const { error: cuotasError } = await supabase
        .from('cuotas')
        .update({
          mora_saldada: true,
          monto_recargo_mora: 0
        })
        .in('id', idsCuotas);

      if (cuotasError) throw cuotasError;

      mostrarToast(`Mora saldada con éxito ($${montoMora.toLocaleString('es-AR')}).`);
      onMoraCobrada();
      onClose();
    } catch (err) {
      mostrarToast(`Error al saldar mora: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
    await registrarMovimiento({
  usuario: user,
  modulo: 'TESORERIA',
  accion: 'SALDO_MORA',
  descripcion: `Cancelación aislada de mora por $${montoMora.toLocaleString('es-AR')} del Exp. ${contrato.numero_expediente}`,
  expedienteId: contrato.id,
  detalles: { monto: montoMora }
});
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
      <div className="card-ergonomica w-full max-w-md bg-white overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-warm)] bg-[var(--color-bg-surface)]">
          <div>
            <h3 className="font-bold text-sm text-[var(--color-text-primary)]">Saldar Mora Acumulada</h3>
            <p className="text-[11px] text-[var(--color-text-secondary)]">Titular: {contrato.titular_nombre}</p>
          </div>
          <button onClick={onClose} className="btn-icono text-xs">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
            <span className="text-[11px] text-amber-700 block font-semibold">Total Mora a Cancelar:</span>
            <span className="text-xl font-bold text-amber-900">${montoMora.toLocaleString('es-AR')}</span>
            <p className="text-[10px] text-amber-600 mt-1">
              Se cancela la mora de {cuotasAfectadas.length} cuota(s). El capital base seguirá pendiente sin recargos.
            </p>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Medio de Pago</label>
            <select
              value={metodoPago}
              onChange={(e) => setMetodoPago(e.target.value)}
              className="input-ergonomico"
            >
              <option value="Transferencia Bancaria">Transferencia Bancaria</option>
              <option value="Efectivo / Caja">Efectivo / Caja</option>
              <option value="Depósito en Cuenta">Depósito en Cuenta</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Comprobante de Cancelación</label>
            <input
              required
              type="file"
              accept="image/*,application/pdf"
              className="text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-amber-100 file:text-amber-800 font-semibold cursor-pointer"
              onChange={(e) => setComprobanteFile(e.target.files[0])}
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-[var(--color-border-warm)]">
            <button type="button" onClick={onClose} className="btn-icono px-3">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-primario bg-amber-600 hover:bg-amber-700 text-xs"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <DollarSign size={14} />} Confirmar Saldo de Mora
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}