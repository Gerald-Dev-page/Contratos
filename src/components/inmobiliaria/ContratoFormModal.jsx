import { useState, useEffect } from 'react';
import { X, Upload, FileText, CheckCircle2, Loader2, Plus, Trash2, ShieldAlert } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { registrarMovimiento } from '../../utils/logger';
import { optimizarPdf, sanitizarNombreArchivo } from '../../utils/fileCompressor';

const ESTADO_INICIAL_FORM = {
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
  monto_anticipo: '',
  cantidad_cuotas: '12',
  fecha_primer_vencimiento: new Date().toISOString().split('T')[0]
};

export default function ContratoFormModal({ isOpen, onClose, onContratoCreado }) {
  const { user } = useAuth();
  const { mostrarToast } = useToast();

  const [loading, setLoading] = useState(false);
  const [tieneAnticipo, setTieneAnticipo] = useState(false);
  const [aplicaMora, setAplicaMora] = useState(true); // Activo por defecto
  const [habilitarSegundoPdf, setHabilitarSegundoPdf] = useState(false);
  const [formData, setFormData] = useState(ESTADO_INICIAL_FORM);
  const [archivoPdf1, setArchivoPdf1] = useState(null);
  const [archivoPdf2, setArchivoPdf2] = useState(null);

  const limpiarFormulario = () => {
    setFormData({
      ...ESTADO_INICIAL_FORM,
      fecha_primer_vencimiento: new Date().toISOString().split('T')[0]
    });
    setTieneAnticipo(false);
    setAplicaMora(true);
    setHabilitarSegundoPdf(false);
    setArchivoPdf1(null);
    setArchivoPdf2(null);
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      limpiarFormulario();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCerrar = () => {
    limpiarFormulario();
    onClose();
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const totalNum = Number(formData.monto_total) || 0;
  const anticipoNum = tieneAnticipo ? (Number(formData.monto_anticipo) || 0) : 0;
  const cantCuotasNum = Number(formData.cantidad_cuotas) || 1;

  const cuotasRestantes = tieneAnticipo && cantCuotasNum > 1 ? cantCuotasNum - 1 : cantCuotasNum;
  const saldoRestante = tieneAnticipo ? Math.max(0, totalNum - anticipoNum) : totalNum;
  const valorCuotasRestantes = cuotasRestantes > 0 ? (saldoRestante / cuotasRestantes) : 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!archivoPdf1) {
      mostrarToast('Debe adjuntar al menos el documento PDF principal.', 'error');
      return;
    }

    if (habilitarSegundoPdf && !archivoPdf2) {
      mostrarToast('Seleccionó adjuntar un segundo documento pero no eligió ningún archivo.', 'error');
      return;
    }

    if (tieneAnticipo && anticipoNum >= totalNum) {
      mostrarToast('El anticipo no puede ser mayor o igual al monto total del lote.', 'error');
      return;
    }

    setLoading(true);
    try {
      // 1. Subir PDF 1
      const pdf1Listo = await optimizarPdf(archivoPdf1);
      const nombreSeguro1 = sanitizarNombreArchivo(pdf1Listo.name);
      const nombreArchivo1 = `${Date.now()}_doc1_${nombreSeguro1}`;

      const { data: uploadData1, error: uploadErr1 } = await supabase.storage
        .from('contratos-pdf')
        .upload(nombreArchivo1, pdf1Listo, { contentType: 'application/pdf', upsert: true });

      if (uploadErr1) throw uploadErr1;

      // 2. Subir PDF 2 (opcional)
      let pathPdf2 = null;
      if (habilitarSegundoPdf && archivoPdf2) {
        const pdf2Listo = await optimizarPdf(archivoPdf2);
        const nombreSeguro2 = sanitizarNombreArchivo(pdf2Listo.name);
        const nombreArchivo2 = `${Date.now()}_doc2_${nombreSeguro2}`;

        const { data: uploadData2, error: uploadErr2 } = await supabase.storage
          .from('contratos-pdf')
          .upload(nombreArchivo2, pdf2Listo, { contentType: 'application/pdf', upsert: true });

        if (uploadErr2) throw uploadErr2;
        pathPdf2 = uploadData2.path;
      }

      // 3. Crear el contrato
      const { data: nuevoContrato, error: contratoErr } = await supabase
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
          monto_anticipo: anticipoNum,
          anticipo_abonado: false,
          aplica_mora: aplicaMora,
          cantidad_cuotas: cantCuotasNum,
          fecha_primer_vencimiento: formData.fecha_primer_vencimiento,
          contrato_pdf_url: uploadData1.path,
          contrato_pdf_url_2: pathPdf2,
          creado_por: user.id
        })
        .select()
        .single();

      if (contratoErr) throw contratoErr;

      // 4. Cronograma de cuotas (Cuota 1 = Anticipo si existe; Mora según switch)
      const cuotasParaInsertar = [];
      const [anioBase, mesBase, diaBase] = formData.fecha_primer_vencimiento.split('-').map(Number);

      for (let i = 1; i <= cantCuotasNum; i++) {
        const fechaCuota = new Date(anioBase, (mesBase - 1) + (i - 1), diaBase);
        const yyyy = fechaCuota.getFullYear();
        const mm = String(fechaCuota.getMonth() + 1).padStart(2, '0');
        const dd = String(fechaCuota.getDate()).padStart(2, '0');

        let montoBase = valorCuotasRestantes;
        let esCuotaAnticipo = false;

        if (tieneAnticipo && i === 1) {
          montoBase = anticipoNum;
          esCuotaAnticipo = true;
        }

        cuotasParaInsertar.push({
          contrato_id: nuevoContrato.id,
          numero_cuota: i,
          bloque_anual: Math.ceil(i / 12),
          periodo: `${yyyy}-${mm}`,
          fecha_vencimiento: `${yyyy}-${mm}-${dd}`,
          monto_base: montoBase,
          monto_ajuste_ipc: 0,
          recargo_mora_porcentaje: aplicaMora ? 5 : 0,
          monto_recargo_mora: 0,
          monto_total_exigible: montoBase,
          estado: 'pendiente',
          mora_saldada: false,
          aplica_ipc: i > 12 && !esCuotaAnticipo
        });
      }

      const { error: cuotasErr } = await supabase.from('cuotas').insert(cuotasParaInsertar);
      if (cuotasErr) throw cuotasErr;

      // 5. Auditoría
      await registrarMovimiento({
        usuario: user,
        modulo: 'INMOBILIARIA',
        accion: 'NUEVO_CONTRATO',
        descripcion: `Alta de contrato Exp. ${nuevoContrato.numero_expediente} (${nuevoContrato.titular_nombre}) en ${nuevoContrato.sector}. Total: $${totalNum.toLocaleString('es-AR')}. Mora: ${aplicaMora ? 'Activada (5%)' : 'Sin Mora'}.`,
        expedienteId: nuevoContrato.id,
        detalles: { total: totalNum, anticipo: anticipoNum, cuotas: cantCuotasNum, aplicaMora }
      });

      mostrarToast('Contrato registrado con éxito.');
      limpiarFormulario();
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
      <div className="card-ergonomica w-full max-w-3xl max-h-[92vh] flex flex-col bg-white overflow-hidden shadow-2xl border border-[var(--color-border-warm)]">
        
        {/* Cabecera */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-warm)] bg-[var(--color-bg-surface)]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-700">
              <FileText size={20} />
            </div>
            <div>
              <h3 className="font-bold text-base text-[var(--color-text-primary)]">Nuevo Contrato de Loteo</h3>
              <p className="text-xs text-[var(--color-text-secondary)]">Complete los datos de la operación y adjunte los documentos firmados</p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={handleCerrar} 
            className="btn-icono p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 cursor-pointer"
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
                  className="input-ergonomico w-full text-xs font-bold text-indigo-950"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre Completo *</label>
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

          {/* Bloque 2: Ubicación Catastral */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
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

          {/* Bloque 3: Condiciones Financieras, Anticipo y Mora */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                3. Condiciones Financieras y Plan de Pago
              </h4>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-200 hover:bg-indigo-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={tieneAnticipo}
                    onChange={(e) => {
                      setTieneAnticipo(e.target.checked);
                      if (!e.target.checked) setFormData(prev => ({ ...prev, monto_anticipo: '' }));
                    }}
                    className="rounded text-indigo-600 cursor-pointer"
                  />
                  <span>¿Aplica anticipo?</span>
                </label>

                {/* Switch de Mora */}
                <label className={`flex items-center gap-1.5 cursor-pointer text-xs font-semibold px-2.5 py-1 rounded-md border transition-colors ${
                  aplicaMora 
                    ? 'text-amber-900 bg-amber-50 border-amber-300' 
                    : 'text-slate-500 bg-slate-100 border-slate-200'
                }`}>
                  <input
                    type="checkbox"
                    checked={aplicaMora}
                    onChange={(e) => setAplicaMora(e.target.checked)}
                    className="rounded text-amber-600 cursor-pointer"
                  />
                  <ShieldAlert size={13} />
                  <span>{aplicaMora ? 'Con Mora (5%)' : 'Sin Mora (0%)'}</span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Monto Total Contrato ($) *</label>
                <input
                  type="number"
                  name="monto_total"
                  required
                  min="1"
                  step="any"
                  placeholder="Ej: 10000000"
                  value={formData.monto_total}
                  onChange={handleChange}
                  className="input-ergonomico w-full text-xs font-bold text-slate-900"
                />
              </div>

              {tieneAnticipo && (
                <div>
                  <label className="block text-xs font-semibold text-emerald-800 mb-1">
                    Cuota 1: Anticipo ($) *
                  </label>
                  <input
                    type="number"
                    name="monto_anticipo"
                    required={tieneAnticipo}
                    min="1"
                    max={totalNum ? totalNum - 1 : undefined}
                    step="any"
                    placeholder="Ej: 5000000"
                    value={formData.monto_anticipo}
                    onChange={handleChange}
                    className="input-ergonomico w-full text-xs font-bold text-emerald-950 border-emerald-300 bg-emerald-50/40"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Total de Cuotas del Plan *</label>
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
                <label className="block text-xs font-semibold text-slate-600 mb-1">1° Vencimiento (Anticipo) *</label>
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

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1">
              {tieneAnticipo && anticipoNum > 0 ? (
                <>
                  <p>
                    • <b>Cuota 1 (Anticipo):</b> <span className="text-emerald-800 font-bold">${anticipoNum.toLocaleString('es-AR')}</span>{' '}
                    <span className="text-slate-400 font-medium">(se cobra en Tesorería)</span>
                  </p>
                  <p>
                    • <b>Cuotas 2 a {cantCuotasNum} ({cuotasRestantes} cuotas):</b>{' '}
                    <span className="text-slate-900 font-bold">${valorCuotasRestantes.toLocaleString('es-AR', { maximumFractionDigits: 2 })}</span> c/u
                    <span className="text-slate-400"> (Saldo restante: ${saldoRestante.toLocaleString('es-AR')})</span>
                  </p>
                </>
              ) : (
                <p>
                  • <b>{formData.cantidad_cuotas} cuotas iguales de:</b>{' '}
                  <span className="text-slate-900 font-bold">${valorCuotasRestantes.toLocaleString('es-AR', { maximumFractionDigits: 2 })}</span>
                </p>
              )}
              <p className="text-[11px] text-slate-400">
                • Política de mora: <b className={aplicaMora ? 'text-amber-800' : 'text-slate-600'}>{aplicaMora ? 'Aplica 5% mensual por mora' : 'Exento de recargo de mora'}</b>
              </p>
            </div>
          </div>

          {/* Bloque 4: Documentos Digitalizados */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                4. Documentos Digitalizados (PDF)
              </h4>
              
              {!habilitarSegundoPdf ? (
                <button
                  type="button"
                  onClick={() => setHabilitarSegundoPdf(true)}
                  className="text-xs text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1 rounded font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Plus size={13} /> + Adjuntar Segundo Documento / Anexo
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setHabilitarSegundoPdf(false);
                    setArchivoPdf2(null);
                  }}
                  className="text-xs text-rose-600 hover:text-rose-800 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 size={13} /> Quitar segundo documento
                </button>
              )}
            </div>

            {/* Documento 1 */}
            <div className="border border-slate-300 rounded-xl p-4 bg-slate-50/50">
              <span className="block text-xs font-bold text-slate-700 mb-2">
                Documento 1: Contrato Principal / Boleto *
              </span>
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  accept=".pdf"
                  required
                  id="file-pdf-doc1"
                  onChange={(e) => setArchivoPdf1(e.target.files[0] || null)}
                  className="hidden"
                />
                <label
                  htmlFor="file-pdf-doc1"
                  className="btn-icono py-2 px-3 border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold flex items-center gap-2 cursor-pointer rounded-lg shadow-2xs"
                >
                  <Upload size={14} /> {archivoPdf1 ? archivoPdf1.name : 'Seleccionar PDF 1'}
                </label>
                {archivoPdf1 && (
                  <span className="text-xs text-emerald-700 flex items-center gap-1 font-medium">
                    <CheckCircle2 size={13} /> Listo ({(archivoPdf1.size / (1024 * 1024)).toFixed(2)} MB)
                  </span>
                )}
              </div>
            </div>

            {/* Documento 2 */}
            {habilitarSegundoPdf && (
              <div className="border border-indigo-200 bg-indigo-50/30 rounded-xl p-4 animate-fadeIn">
                <span className="block text-xs font-bold text-indigo-950 mb-2">
                  Documento 2: Anexo / Segundo Documento Firmado *
                </span>
                <div className="flex items-center gap-3">
                  <input
                    type="file"
                    accept=".pdf"
                    required={habilitarSegundoPdf}
                    id="file-pdf-doc2"
                    onChange={(e) => setArchivoPdf2(e.target.files[0] || null)}
                    className="hidden"
                  />
                  <label
                    htmlFor="file-pdf-doc2"
                    className="btn-icono py-2 px-3 border border-indigo-300 bg-white hover:bg-indigo-50 text-xs font-semibold flex items-center gap-2 cursor-pointer rounded-lg shadow-2xs text-indigo-900"
                  >
                    <Upload size={14} /> {archivoPdf2 ? archivoPdf2.name : 'Seleccionar PDF 2'}
                  </label>
                  {archivoPdf2 && (
                    <span className="text-xs text-emerald-700 flex items-center gap-1 font-medium">
                      <CheckCircle2 size={13} /> Listo ({(archivoPdf2.size / (1024 * 1024)).toFixed(2)} MB)
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Acciones */}
          <div className="pt-4 border-t border-[var(--color-border-warm)] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleCerrar}
              disabled={loading}
              className="btn-icono py-2 px-4 text-xs font-medium cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-primario py-2.5 px-6 text-xs font-bold flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 shadow-md cursor-pointer disabled:opacity-50"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {loading ? 'Comprimiendo y Guardando...' : 'Crear Contrato'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}