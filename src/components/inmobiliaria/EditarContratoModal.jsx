import { useState } from 'react';
import { X, Save, Lock, Loader2, Edit3 } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { registrarMovimiento } from '../../utils/logger';

export default function EditarContratoModal({ contrato, onClose, onActualizado }) {
  const { user } = useAuth();
  const { mostrarToast } = useToast();
  const [loading, setLoading] = useState(false);

  // Campos editables permitidos
  const [telefono, setTelefono] = useState(contrato?.titular_telefono || '');
  const [email, setEmail] = useState(contrato?.titular_email || '');
  const [manzana, setManzana] = useState(contrato?.manzana || '');
  const [parcela, setParcela] = useState(contrato?.parcela || '');
  const [padron, setPadron] = useState(contrato?.padron || '');

  if (!contrato) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase
        .from('contratos')
        .update({
          titular_telefono: telefono.trim(),
          titular_email: email.trim(),
          manzana: manzana.trim(),
          parcela: parcela.trim(),
          padron: padron.trim(),
          updated_at: new Date().toISOString()
        })
        .eq('id', contrato.id);

      if (error) throw error;

      await registrarMovimiento({
        usuario: user,
        modulo: 'INMOBILIARIA',
        accion: 'EDICION_CONTRATO',
        descripcion: `Edición de datos catastrales/contacto en Exp. ${contrato.numero_expediente}`,
        expedienteId: contrato.id,
        detalles: {
          telefono_anterior: contrato.titular_telefono,
          telefono_nuevo: telefono,
          manzana,
          parcela,
          padron
        }
      });

      mostrarToast('Datos del contrato actualizados correctamente.');
      onActualizado();
      onClose();
    } catch (err) {
      mostrarToast(`Error al actualizar: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-4">
      <div className="card-ergonomica w-full max-w-3xl bg-white overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-8 py-5 border-b border-[var(--color-border-warm)] bg-[var(--color-bg-surface)]">
          <div className="flex items-center gap-2.5">
            <Edit3 size={20} className="text-indigo-600" />
            <div>
              <h3 className="font-bold text-base text-[var(--color-text-primary)]">
                Modificar Datos del Contrato
              </h3>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Expediente: {contrato.numero_expediente}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn-icono text-sm">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6 text-sm">
          {/* Bloque de datos protegidos (Solo Lectura) */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <Lock size={14} className="text-slate-400" /> Campos Jurídicos Inmutables
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <span className="text-slate-400 block font-semibold">Titular:</span>
                <span className="font-bold text-slate-800 text-sm">{contrato.titular_nombre}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-semibold">DNI / Identificación:</span>
                <span className="font-bold text-slate-800 text-sm">{contrato.titular_dni}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-semibold">Monto Contratado:</span>
                <span className="font-bold text-slate-800 text-sm">
                  ${Number(contrato.monto_total).toLocaleString('es-AR')} ({contrato.cantidad_cuotas} cuotas)
                </span>
              </div>
            </div>
          </div>

          {/* Bloque de datos editables: Contacto */}
          <div>
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
              Datos de Contacto del Titular
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Teléfono / Celular</label>
                <input
                  type="text"
                  required
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  className="input-ergonomico text-sm py-2"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Correo Electrónico</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-ergonomico text-sm py-2"
                />
              </div>
            </div>
          </div>

          {/* Bloque de datos editables: Catastro */}
          <div>
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
              Ubicación Catastral
            </h4>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Manzana</label>
                <input
                  type="text"
                  required
                  value={manzana}
                  onChange={(e) => setManzana(e.target.value)}
                  className="input-ergonomico text-sm py-2"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Parcela</label>
                <input
                  type="text"
                  required
                  value={parcela}
                  onChange={(e) => setParcela(e.target.value)}
                  className="input-ergonomico text-sm py-2"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Padrón</label>
                <input
                  type="text"
                  required
                  value={padron}
                  onChange={(e) => setPadron(e.target.value)}
                  className="input-ergonomico text-sm py-2"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-5 border-t border-[var(--color-border-warm)]">
            <button type="button" onClick={onClose} className="btn-icono px-5 text-sm font-medium">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-primario text-sm py-2.5 px-5 flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Guardar Modificaciones
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}