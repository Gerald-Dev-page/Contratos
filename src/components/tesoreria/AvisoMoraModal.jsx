import { useState } from 'react';
import { X, Send, AlertTriangle, Loader2 } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { registrarMovimiento } from '../../utils/logger';
export default function AvisoMoraModal({ cuota, onClose, onAvisoEmitido }) {
  const { user } = useAuth();
  const { mostrarToast } = useToast();
  const [mensaje, setMensaje] = useState(
    `Se solicita contacto con el titular por cuota vencida (Período: ${cuota?.periodo}).`
  );
  const [loading, setLoading] = useState(false);

  if (!cuota) return null;

  const targetContratoId = cuota.contrato_id || cuota.contratos?.id;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!targetContratoId) {
      mostrarToast('Error al identificar contrato.', 'error');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from('avisos_mora').insert([{
        contrato_id: targetContratoId,
        cuota_id: cuota.id,
        reportado_por: user.id,
        mensaje_tesoreria: `${mensaje.trim()} (Emitido por Tesorería: ${user.user_metadata?.nombre || user.email})`,
        estado: 'pendiente_envio'
      }]);

      if (error) throw error;

    await registrarMovimiento({
  usuario: user,
  modulo: 'TESORERIA',
  accion: 'AVISO_MORA',
  descripcion: `Alerta de mora emitida para Exp. ${cuota.contratos?.numero_expediente} (Cuota #${cuota.numero_cuota})`,
  expedienteId: targetContratoId
});

      mostrarToast('Aviso formal enviado a Inmobiliaria con éxito.');
      onAvisoEmitido();
      onClose();
    } catch (err) {
      mostrarToast(`Error al emitir aviso: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };
  

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
      <div className="card-ergonomica w-full max-w-md bg-white overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-warm)] bg-[var(--color-bg-surface)]">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-amber-500" />
            <h3 className="font-bold text-sm text-[var(--color-text-primary)]">Reportar Aviso de Mora</h3>
          </div>
          <button onClick={onClose} className="btn-icono text-xs">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1">
            <p><strong>Titular:</strong> {cuota.contratos?.titular_nombre || 'N/A'}</p>
            <p><strong>Teléfono:</strong> {cuota.contratos?.titular_telefono || 'N/A'}</p>
            <p><strong>Expediente:</strong> {cuota.contratos?.numero_expediente || 'N/A'} (Cuota #{cuota.numero_cuota})</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1">
              Indicaciones para Inmobiliaria
            </label>
            <textarea
              required
              rows={3}
              value={mensaje}
              onChange={(e) => setMensaje(e.target.value)}
              className="input-ergonomico text-xs resize-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-[var(--color-border-warm)]">
            <button type="button" onClick={onClose} className="btn-icono px-4 text-xs font-medium">
              Cancelar
            </button>
            <button type="submit" disabled={loading} className="btn-primario text-xs bg-amber-600 hover:bg-amber-700">
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Enviar Alerta a Inmobiliaria
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}