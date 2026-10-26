import { useState, useMemo, useEffect } from 'react';
import { X, MapPin, User, DollarSign, UploadCloud, Loader2 } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { subirContratoPdf } from '../../services/storage';
import { generarPlanCuotas } from '../../utils/finance';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { registrarMovimiento } from '../../utils/logger';
import CuotasPreviewTable from './CuotasPreviewTable';

export default function ContratoFormModal({ isOpen, onClose, onContratoCreado }) {
  const { user } = useAuth();
  const { mostrarToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [pdfFile, setPdfFile] = useState(null);
  const [moraGlobal, setMoraGlobal] = useState(5.0);
  const [formData, setFormData] = useState({
    numero_expediente: '',
    titular_nombre: '',
    titular_dni: '',
    titular_email: '',
    titular_telefono: '',
    manzana: '',
    parcela: '',
    padron: '',
    monto_total: '',
    cantidad_cuotas: '24'
  });

  useEffect(() => {
    async function obtenerMora() {
      const { data } = await supabase
        .from('configuracion_sistema')
        .select('valor')
        .eq('clave', 'porcentaje_mora_default')
        .single();
      
      if (data?.valor) setMoraGlobal(parseFloat(data.valor) || 5.0);
    }
    if (isOpen) obtenerMora();
  }, [isOpen]);

  const planCuotasProyectado = useMemo(() => {
    const total = parseFloat(formData.monto_total);
    const cuotas = parseInt(formData.cantidad_cuotas, 10);

    if (!total || isNaN(total) || total <= 0 || !cuotas || isNaN(cuotas) || cuotas <= 0) {
      return [];
    }
    // Plan base puro: 1 a 12 fijas, >12 se actualizarán con el índice mensual
    return generarPlanCuotas(total, cuotas, moraGlobal, 0, new Date());
  }, [formData.monto_total, formData.cantidad_cuotas, moraGlobal]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!pdfFile) {
      mostrarToast('Debes adjuntar el PDF del contrato.', 'error');
      return;
    }

    setLoading(true);
    try {
      const pdfPath = await subirContratoPdf(pdfFile, formData.numero_expediente);

      const { data: contrato, error: errContrato } = await supabase
        .from('contratos')
        .insert([{
          numero_expediente: formData.numero_expediente.trim(),
          titular_nombre: formData.titular_nombre.trim(),
          titular_dni: formData.titular_dni.trim(),
          titular_email: formData.titular_email.trim(),
          titular_telefono: formData.titular_telefono.trim(),
          manzana: formData.manzana.trim(),
          parcela: formData.parcela.trim(),
          padron: formData.padron.trim(),
          monto_total: parseFloat(formData.monto_total),
          cantidad_cuotas: parseInt(formData.cantidad_cuotas, 10),
          porcentaje_recargo_mora: moraGlobal,
          contrato_pdf_url: pdfPath,
          estado: 'activo'
        }])
        .select()
        .single();

      if (errContrato) throw errContrato;

const cuotasParaInsertar = planCuotasProyectado.map((c) => ({
        contrato_id: contrato.id,
        numero_cuota: c.numero_cuota,
        periodo: c.periodo,
        fecha_vencimiento: c.fecha_vencimiento,
        monto_base: Number(c.monto_base),
        aplica_ipc: Boolean(c.numero_cuota > 12),
        monto_ajuste_ipc: 0,
        ajuste_ipc_porcentaje: 0,
        recargo_mora_porcentaje: Number(moraGlobal) || 5.0,
        monto_total_exigible: Number(c.monto_base),
        mora_saldada: false,
        estado: 'pendiente'
      }));

      const { error: errCuotas } = await supabase.from('cuotas').insert(cuotasParaInsertar);
      if (errCuotas) throw errCuotas;
      // Registrar auditoría
   await registrarMovimiento({
  usuario: user,
  modulo: 'INMOBILIARIA',
  accion: 'NUEVO_CONTRATO',
  descripcion: `Alta de contrato Exp. ${formData.numero_expediente} para ${formData.titular_nombre}`,
  expedienteId: contrato.id,
  detalles: { total: formData.monto_total, cuotas: formData.cantidad_cuotas }
});

      mostrarToast('Contrato y plan de cuotas creados correctamente.');
      onContratoCreado();
      onClose();
    } catch (err) {
      mostrarToast(`Error al guardar contrato: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
      <div className="card-ergonomica w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden bg-white shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-warm)] bg-[var(--color-bg-surface)]">
          <h3 className="font-bold text-sm text-[var(--color-text-primary)]">Nuevo Contrato Inmobiliario</h3>
          <button onClick={onClose} className="btn-icono text-xs"><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 uppercase tracking-wider mb-2">
              <MapPin size={14} /> 1. Datos Catastrales
            </div>
            <div className="grid grid-cols-4 gap-3">
              <input required name="numero_expediente" placeholder="N° Expediente" className="input-ergonomico" onChange={handleChange} />
              <input required name="manzana" placeholder="Manzana" className="input-ergonomico" onChange={handleChange} />
              <input required name="parcela" placeholder="Parcela" className="input-ergonomico" onChange={handleChange} />
              <input required name="padron" placeholder="Padrón" className="input-ergonomico" onChange={handleChange} />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 uppercase tracking-wider mb-2">
              <User size={14} /> 2. Titular Comprador
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <input required name="titular_nombre" placeholder="Nombre Completo" className="input-ergonomico" onChange={handleChange} />
              <input required name="titular_dni" placeholder="DNI / CUIT" className="input-ergonomico" onChange={handleChange} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input required type="email" name="titular_email" placeholder="Correo Electrónico" className="input-ergonomico" onChange={handleChange} />
              <input required name="titular_telefono" placeholder="Teléfono" className="input-ergonomico" onChange={handleChange} />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 uppercase tracking-wider mb-2">
              <DollarSign size={14} /> 3. Plan Financiero
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input required type="number" step="0.01" name="monto_total" placeholder="Monto Total ($)" className="input-ergonomico" onChange={handleChange} />
              <input required type="number" min="1" max="120" name="cantidad_cuotas" defaultValue="24" placeholder="Cantidad de Cuotas" className="input-ergonomico" onChange={handleChange} />
            </div>

            {/* Aclaración reglamentaria limpia y exacta */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg mt-2 text-[11px] text-slate-600 space-y-1">
              <p>• <b>Cuotas 1 a 12:</b> Importe base fijo contractual.</p>
              <p>• <b>Cuotas 13 en adelante:</b> Se liquidarán según el <b>valor del índice IPC publicado</b> al momento del cobro.</p>
              <p>• <b>Vencimiento:</b> A partir del día 11 se computa recargo por mora reglamentario ({moraGlobal}%).</p>
            </div>
          </div>

          <CuotasPreviewTable cuotas={planCuotasProyectado} />

          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 uppercase tracking-wider mb-2">
              <UploadCloud size={14} /> 4. Adjuntar Contrato Escaneado
            </div>
            <input
              required
              type="file"
              accept="application/pdf"
              className="text-xs file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-indigo-50 file:text-indigo-700 file:font-semibold hover:file:bg-indigo-100 cursor-pointer"
              onChange={(e) => setPdfFile(e.target.files[0])}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--color-border-warm)]">
            <button type="button" onClick={onClose} className="btn-icono px-4 text-xs font-medium">Cancelar</button>
            <button type="submit" disabled={loading} className="btn-primario text-xs">
              {loading ? <Loader2 size={14} className="animate-spin" /> : 'Crear Contrato'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}