import { useState } from 'react';
import { X, Upload, FileText, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { registrarMovimiento } from '../../utils/logger';
import { optimizarPdf } from '../../utils/fileCompressor';

export default function ContratoFormModal({ isOpen, onClose, onContratoCreado }) {
  const { user } = useAuth();
  const { mostrarToast } = useToast();

  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    numero_expediente: '',
    titular_nombre: '',
    titular_dni: '',
    titular_email: '',
    titular_telefono: '',
    sector: 'Sector A',
    manzana: '',
    parcela: '',
    padron: '',
    monto_total: '',
    cantidad_cuotas: '12',
    fecha_primer_vencimiento: new Date().toISOString().split('T')[0]
  });
  const [archivoPdf, setArchivoPdf] = useState(null);

  if (!isOpen) return null;

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const cuotaEstimada = formData.monto_total && formData.cantidad_cuotas && Number(formData.cantidad_cuotas) > 0
    ? (Number(formData.monto_total) / Number(formData.cantidad_cuotas)).toLocaleString('es-AR', { maximumFractionDigits: 2 })
    : '0';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!archivoPdf) {
      mostrarToast('Debe adjuntar el contrato en formato PDF.', 'error');
      return;
    }

setLoading(true);
try {
  // 1. Optimizar PDF en segundo plano sin alterar la UI
  const pdfListo = await optimizarPdf(archivoPdf);
  const nombreArchivo = `${Date.now()}_${pdfListo.name.replace(/\s+/g, '_')}`;
  
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('contratos-pdf')
    .upload(nombreArchivo, pdfListo);

  if (uploadError) throw uploadError;

  // 2. Insertar contrato (incluye sector y fecha_primer_vencimiento)
  const totalNum = Number(formData.monto_total);
  const cantCuotas = Number(formData.cantidad_cuotas);

  const { data: nuevoContrato, error: contratoError } = await supabase
    .from('contratos')
    .insert({
      numero_expediente: formData.numero_expediente.trim(),
      titular_nombre: formData.titular_nombre.trim(),
      titular_dni: formData.titular_dni.trim(),
      titular_email: formData.titular_email.trim(),
      titular_telefono: formData.titular_telefono.trim(),
      sector: formData.sector.trim(),
      manzana: formData.manzana.trim(),
      parcela: formData.parcela.trim(),
      padron: formData.padron.trim(),
      monto_total: totalNum,
      cantidad_cuotas: cantCuotas,
      fecha_primer_vencimiento: formData.fecha_primer_vencimiento, // <- Guardado en BD
      contrato_pdf_url: uploadData.path,
      creado_por: user.id
    })
    .select()
    .single();

  if (contratoError) throw contratoError;

  // 3. Cronograma de cuotas con bloque_anual (1..12 = Bloque 1, 13..24 = Bloque 2, etc.)
  const montoBaseCuota = totalNum / cantCuotas;
  const cuotasParaInsertar = [];

  // Parseo limpio de YYYY-MM-DD para evitar desfasajes horarios UTC
  const [anioBase, mesBase, diaBase] = formData.fecha_primer_vencimiento.split('-').map(Number);

  for (let i = 1; i <= cantCuotas; i++) {
    // Mes base en JS va de 0 a 11. Sumamos (i - 1) meses.
    const fechaCuota = new Date(anioBase, (mesBase - 1) + (i - 1), diaBase);
    
    const yyyy = fechaCuota.getFullYear();
    const mm = String(fechaCuota.getMonth() + 1).padStart(2, '0');
    const dd = String(fechaCuota.getDate()).padStart(2, '0');
    
    const periodoStr = `${yyyy}-${mm}`;
    const fechaVencStr = `${yyyy}-${mm}-${dd}`;
    const bloqueAnual = Math.ceil(i / 12);

    cuotasParaInsertar.push({
      contrato_id: nuevoContrato.id,
      numero_cuota: i,
      bloque_anual: bloqueAnual, // <- Identificador del año de cuotas
      periodo: periodoStr,
      fecha_vencimiento: fechaVencStr,
      monto_base: montoBaseCuota,
      monto_ajuste_ipc: 0,
      recargo_mora_porcentaje: 5,
      monto_recargo_mora: 0,
      monto_total_exigible: montoBaseCuota,
      estado: 'pendiente',
      mora_saldada: false,
      aplica_ipc: i > 12
    });
  }

  const { error: cuotasError } = await supabase.from('cuotas').insert(cuotasParaInsertar);
  if (cuotasError) throw cuotasError;

      // 4. Bitácora de Auditoría
      await registrarMovimiento({
        usuario: user,
        modulo: 'INMOBILIARIA',
        accion: 'NUEVO_CONTRATO',
        descripcion: `Alta de contrato Exp. ${nuevoContrato.numero_expediente} (${nuevoContrato.titular_nombre}) en ${nuevoContrato.sector}`,
        expedienteId: nuevoContrato.id,
        detalles: { sector: nuevoContrato.sector, total: totalNum, cuotas: cantCuotas }
      });

      mostrarToast('Contrato y cronograma registrados con éxito.');
      onContratoCreado();
      onClose();
    } catch (err) {
      mostrarToast(`Error: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
      <div className="card-ergonomica w-full max-w-3xl max-h-[90vh] flex flex-col bg-white overflow-hidden shadow-2xl border border-[var(--color-border-warm)]">
        
        {/* Cabecera Clásica */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-warm)] bg-[var(--color-bg-surface)]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-700">
              <FileText size={20} />
            </div>
            <div>
              <h3 className="font-bold text-base text-[var(--color-text-primary)]">Nuevo Contrato de Loteo</h3>
              <p className="text-xs text-[var(--color-text-secondary)]">Complete los datos de la operación y adjunte el contrato firmado</p>
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
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Bloque 1: Expediente y Titular */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              1. Datos del Titular y Expediente
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">N° Expediente *</label>
                <input
                  type="text"
                  name="numero_expediente"
                  required
                  placeholder="EXP-2026-..."
                  value={formData.numero_expediente}
                  onChange={handleChange}
                  className="input-ergonomico w-full text-xs"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre y Apellido Completo *</label>
                <input
                  type="text"
                  name="titular_nombre"
                  required
                  placeholder="Ej: Juan Martín Pérez"
                  value={formData.titular_nombre}
                  onChange={handleChange}
                  className="input-ergonomico w-full text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">DNI *</label>
                <input
                  type="text"
                  name="titular_dni"
                  required
                  placeholder="Sin puntos"
                  value={formData.titular_dni}
                  onChange={handleChange}
                  className="input-ergonomico w-full text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Teléfono</label>
                <input
                  type="text"
                  name="titular_telefono"
                  placeholder="Ej: 2664..."
                  value={formData.titular_telefono}
                  onChange={handleChange}
                  className="input-ergonomico w-full text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Correo Electrónico</label>
                <input
                  type="email"
                  name="titular_email"
                  placeholder="cliente@email.com"
                  value={formData.titular_email}
                  onChange={handleChange}
                  className="input-ergonomico w-full text-xs"
                />
              </div>
            </div>
          </div>

          {/* Bloque 2: Ubicación Catastral y Sector */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              2. Ubicación y Catastro
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Sector / Etapa *</label>
                <input
                  type="text"
                  name="sector"
                  required
                  placeholder="Ej: Sector A"
                  value={formData.sector}
                  onChange={handleChange}
                  className="input-ergonomico w-full text-xs font-medium"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Manzana *</label>
                <input
                  type="text"
                  name="manzana"
                  required
                  placeholder="Ej: Mz B"
                  value={formData.manzana}
                  onChange={handleChange}
                  className="input-ergonomico w-full text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Parcela *</label>
                <input
                  type="text"
                  name="parcela"
                  required
                  placeholder="Ej: 14"
                  value={formData.parcela}
                  onChange={handleChange}
                  className="input-ergonomico w-full text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">N° Padrón</label>
                <input
                  type="text"
                  name="padron"
                  placeholder="PAD-..."
                  value={formData.padron}
                  onChange={handleChange}
                  className="input-ergonomico w-full text-xs"
                />
              </div>
            </div>
          </div>

          {/* Bloque 3: Condiciones Financieras */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              3. Condiciones Financieras del Lote
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Monto Total Contrato ($) *</label>
                <input
                  type="number"
                  name="monto_total"
                  required
                  min="1"
                  step="any"
                  placeholder="Ej: 6000000"
                  value={formData.monto_total}
                  onChange={handleChange}
                  className="input-ergonomico w-full text-xs font-bold text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Cantidad de Cuotas *</label>
                <input
                  type="number"
                  name="cantidad_cuotas"
                  required
                  min="1"
                  max="120"
                  value={formData.cantidad_cuotas}
                  onChange={handleChange}
                  className="input-ergonomico w-full text-xs font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Primer Vencimiento *</label>
                <input
                  type="date"
                  name="fecha_primer_vencimiento"
                  required
                  value={formData.fecha_primer_vencimiento}
                  onChange={handleChange}
                  className="input-ergonomico w-full text-xs"
                />
              </div>
            </div>

            {/* Cuadro de resumen previo del plan */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
              <div className="text-slate-600">
                <span>Valor cuota inicial estimada: </span>
                <b className="text-slate-900 text-sm font-bold">${cuotaEstimada}</b>
                <span className="text-slate-400 block sm:inline sm:ml-1">
                  ({formData.cantidad_cuotas} cuotas mensuales)
                </span>
              </div>
              {Number(formData.cantidad_cuotas) > 12 && (
                <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded border border-indigo-100">
                  Aplica IPC a partir de Cuota 13
                </span>
              )}
            </div>
          </div>

          {/* Bloque 4: Archivo Adjunto */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              4. Documento Digitalizado
            </h4>
            <div className="border-2 border-dashed border-slate-300 rounded-xl p-5 text-center bg-slate-50/50 hover:bg-slate-50 transition-colors">
              <input
                type="file"
                accept=".pdf"
                required
                id="file-pdf-original"
                onChange={(e) => setArchivoPdf(e.target.files[0])}
                className="hidden"
              />
              <label htmlFor="file-pdf-original" className="cursor-pointer flex flex-col items-center gap-2">
                <div className="p-2.5 bg-white rounded-full shadow-2xs border border-slate-200 text-slate-600">
                  <Upload size={20} />
                </div>
                <div>
                  <span className="text-xs font-semibold text-indigo-600 hover:text-indigo-700">
                    {archivoPdf ? archivoPdf.name : 'Haga clic para adjuntar el contrato (PDF)'}
                  </span>
                  <span className="block text-[11px] text-slate-400 mt-0.5">
                    {archivoPdf 
                      ? `${(archivoPdf.size / (1024 * 1024)).toFixed(2)} MB seleccionados`
                      : 'Archivo digital escaneado con firmas'
                    }
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Acciones */}
          <div className="pt-4 border-t border-[var(--color-border-warm)] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="btn-icono py-2 px-4 text-xs font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-primario py-2 px-5 text-xs font-semibold flex items-center gap-2 cursor-pointer shadow-sm disabled:opacity-50"
            >
              {loading && <Loader2 size={15} className="animate-spin" />}
              {loading ? 'Registrando Contrato...' : 'Crear Contrato'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}