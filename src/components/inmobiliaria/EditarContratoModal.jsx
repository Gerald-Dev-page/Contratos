import { useState, useEffect } from 'react';
import { X, Save, Loader2, Edit3 } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { registrarMovimiento } from '../../utils/logger';

export default function EditarContratoModal({ contrato, onClose, onActualizado }) {
  const { user } = useAuth();
  const { mostrarToast } = useToast();
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    titular_nombre: '',
    titular_dni: '',
    titular_email: '',
    titular_telefono: '',
    sector: 'General',
    manzana: '',
    parcela: '',
    padron: ''
  });

  useEffect(() => {
    if (contrato) {
      setFormData({
        titular_nombre: contrato.titular_nombre || '',
        titular_dni: contrato.titular_dni || '',
        titular_email: contrato.titular_email || '',
        titular_telefono: contrato.titular_telefono || '',
        sector: contrato.sector || 'General',
        manzana: contrato.manzana || '',
        parcela: contrato.parcela || '',
        padron: contrato.padron || ''
      });
    }
  }, [contrato]);

  if (!contrato) return null;

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const updateData = {
        titular_nombre: formData.titular_nombre.trim(),
        titular_dni: formData.titular_dni.trim(),
        titular_email: formData.titular_email.trim(),
        titular_telefono: formData.titular_telefono.trim(),
        sector: formData.sector.trim(),
        manzana: formData.manzana.trim(),
        parcela: formData.parcela.trim(),
        padron: formData.padron.trim(),
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('contratos')
        .update(updateData)
        .eq('id', contrato.id);

      if (error) throw error;

      await registrarMovimiento({
        usuario: user,
        modulo: 'INMOBILIARIA',
        accion: 'EDITAR_CONTRATO',
        descripcion: `Actualización de datos y sector (${updateData.sector}) en contrato Exp. ${contrato.numero_expediente}`,
        expedienteId: contrato.id,
        detalles: updateData
      });

      mostrarToast('Contrato actualizado con éxito.');
      onActualizado();
      onClose();
    } catch (err) {
      mostrarToast(`Error al actualizar: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
      <div className="card-ergonomica w-full max-w-2xl bg-white overflow-hidden shadow-2xl border border-[var(--color-border-warm)]">
        
        {/* Cabecera */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-warm)] bg-[var(--color-bg-surface)]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-700">
              <Edit3 size={18} />
            </div>
            <div>
              <h3 className="font-bold text-sm text-[var(--color-text-primary)]">
                Editar Datos del Contrato
              </h3>
              <p className="text-xs text-[var(--color-text-secondary)] font-mono">
                Expediente: {contrato.numero_expediente}
              </p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="btn-icono p-1.5 hover:bg-slate-100 rounded-lg text-slate-500"
          >
            <X size={18} />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 text-xs">
          
          {/* Datos del Titular */}
          <div className="space-y-3">
            <span className="font-bold text-slate-700 uppercase tracking-wider block text-[11px]">
              Datos del Titular
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Nombre Completo *</label>
                <input
                  type="text"
                  name="titular_nombre"
                  required
                  value={formData.titular_nombre}
                  onChange={handleChange}
                  className="input-ergonomico w-full py-2 px-3 text-xs"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">DNI *</label>
                <input
                  type="text"
                  name="titular_dni"
                  required
                  value={formData.titular_dni}
                  onChange={handleChange}
                  className="input-ergonomico w-full py-2 px-3 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Teléfono</label>
                <input
                  type="text"
                  name="titular_telefono"
                  value={formData.titular_telefono}
                  onChange={handleChange}
                  className="input-ergonomico w-full py-2 px-3 text-xs"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Correo Electrónico</label>
                <input
                  type="email"
                  name="titular_email"
                  value={formData.titular_email}
                  onChange={handleChange}
                  className="input-ergonomico w-full py-2 px-3 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Sector y Datos Catastrales */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <span className="font-bold text-slate-700 uppercase tracking-wider block text-[11px]">
              Ubicación Catastral y Sector
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Sector / Etapa *</label>
                <input
                  type="text"
                  name="sector"
                  required
                  placeholder="Ej: Sector A"
                  value={formData.sector}
                  onChange={handleChange}
                  className="input-ergonomico w-full py-2 px-3 text-xs font-semibold text-indigo-950"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Manzana *</label>
                <input
                  type="text"
                  name="manzana"
                  required
                  value={formData.manzana}
                  onChange={handleChange}
                  className="input-ergonomico w-full py-2 px-3 text-xs"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Parcela *</label>
                <input
                  type="text"
                  name="parcela"
                  required
                  value={formData.parcela}
                  onChange={handleChange}
                  className="input-ergonomico w-full py-2 px-3 text-xs"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">N° Padrón</label>
                <input
                  type="text"
                  name="padron"
                  value={formData.padron}
                  onChange={handleChange}
                  className="input-ergonomico w-full py-2 px-3 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Acciones */}
          <div className="pt-3 border-t border-[var(--color-border-warm)] flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="btn-icono py-2 px-3.5 text-xs font-medium cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-primario py-2 px-4 text-xs font-bold flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 shadow-sm cursor-pointer disabled:opacity-50"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {loading ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}