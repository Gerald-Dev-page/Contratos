import { useEffect, useState } from 'react';
import { 
  X, 
  Printer, 
  Phone, 
  Mail, 
  MapPin, 
  CheckCircle, 
  Clock, 
  AlertTriangle,
  BellRing,
  CheckCheck,
  Loader2
} from 'lucide-react';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { registrarMovimiento } from '../../utils/logger';
import BotonVerPdf from '../common/BotonVerPdf';

export default function DetalleTitularModal({ contrato, onClose }) {
  const { user } = useAuth();
  const { mostrarToast } = useToast();
  const [cuotas, setCuotas] = useState([]);
  const [avisosMora, setAvisosMora] = useState([]);
  const [loading, setLoading] = useState(true);
  const [guardandoAvisoId, setGuardandoAvisoId] = useState(null);

  useEffect(() => {
    if (contrato?.id) {
      cargarDatosFicha();
    }
  }, [contrato]);

  const cargarDatosFicha = async () => {
    setLoading(true);
    try {
      const [resCuotas, resAvisos] = await Promise.all([
        supabase
          .from('cuotas')
          .select(`
            id,
            numero_cuota,
            periodo,
            fecha_vencimiento,
            monto_base,
            aplica_ipc,
            monto_ajuste_ipc,
            monto_total_exigible,
            mora_saldada,
            estado,
            pagos (
              id,
              monto_abonado,
              interes_mora_cobrado,
              es_saldo_mora,
              comprobante_url
            )
          `)
          .eq('contrato_id', contrato.id)
          .order('numero_cuota', { ascending: true }),

        supabase
          .from('avisos_mora')
          .select('*')
          .eq('contrato_id', contrato.id)
      ]);

      if (resCuotas.error) throw resCuotas.error;
      if (resAvisos.error) throw resAvisos.error;

      setCuotas(resCuotas.data || []);
      setAvisosMora(resAvisos.data || []);
    } catch (err) {
      console.error('Error cargando ficha:', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Marcar el aviso como enviado/comunicado al titular
  const marcarAvisoComoNotificado = async (aviso) => {
    setGuardandoAvisoId(aviso.id);
    const ahora = new Date().toISOString();

    try {
      const { error } = await supabase
        .from('avisos_mora')
        .update({
          estado: 'notificado',
          fecha_notificacion_cliente: ahora,
          gestionado_por: user.id
        })
        .eq('id', aviso.id);

      if (error) throw error;

      await registrarMovimiento({
        usuario: user,
        modulo: 'INMOBILIARIA',
        accion: 'CLIENTE_NOTIFICADO',
        descripcion: `Notificación de deuda comunicada al titular ${contrato.titular_nombre} (Exp. ${contrato.numero_expediente})`,
        expedienteId: contrato.id,
        detalles: { aviso_id: aviso.id, fecha: ahora }
      });

      mostrarToast('Aviso registrado con fecha y hora correctamente.');
      cargarDatosFicha();
    } catch (err) {
      mostrarToast(`Error al marcar aviso: ${err.message}`, 'error');
    } finally {
      setGuardandoAvisoId(null);
    }
  };

  const pagadas = cuotas.filter((c) => c.estado === 'pagada').length;
  const pendientes = cuotas.length - pagadas;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-6 print:p-0">
      <div className="card-ergonomica w-full max-w-6xl max-h-[94vh] flex flex-col bg-white overflow-hidden shadow-2xl print:max-h-none print:shadow-none">
        
        {/* Cabecera espaciosa */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-[var(--color-border-warm)] bg-[var(--color-bg-surface)] print:hidden">
          <div className="flex items-center gap-4">
            <div>
              <h3 className="font-bold text-base text-[var(--color-text-primary)]">
                Ficha Integral del Titular y Control de Cuotas
              </h3>
              <span className="text-xs text-[var(--color-text-secondary)]">
                Expediente N°: <b>{contrato.numero_expediente}</b>
              </span>
            </div>
            <div className="pl-4 border-l border-slate-300">
              <BotonVerPdf
                filePath={contrato.contrato_pdf_url}
                bucket="contratos-pdf"
                titulo={`Contrato Original Exp. ${contrato.numero_expediente}`}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={() => window.print()} className="btn-icono text-xs py-2 px-3 flex items-center gap-2">
              <Printer size={16} /> Imprimir Ficha
            </button>
            <button onClick={onClose} className="btn-icono text-xs p-2">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Contenido Amplio */}
        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          
          {/* Bloque de Información del Titular y Catastro */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 rounded-xl bg-[var(--color-bg-egg)] border border-[var(--color-border-warm)] text-sm">
            <div className="space-y-1.5">
              <span className="text-xs uppercase font-extrabold text-slate-500 tracking-wider block">
                Datos del Comprador
              </span>
              <p className="font-bold text-base text-slate-900">{contrato.titular_nombre}</p>
              <p className="text-slate-700"><b>DNI:</b> {contrato.titular_dni}</p>
              <p className="text-slate-700"><b>Teléfono:</b> {contrato.titular_telefono} | <b>Email:</b> {contrato.titular_email}</p>
            </div>
            <div className="space-y-1.5">
              <span className="text-xs uppercase font-extrabold text-slate-500 tracking-wider block">
                Asignación Catastral
              </span>
              <p className="text-slate-800">
                Manzana: <b>{contrato.manzana}</b> | Parcela: <b>{contrato.parcela}</b>
              </p>
              <p className="text-slate-800">
                Padrón Municipal: <b>{contrato.padron}</b>
              </p>
              <p className="text-slate-600 text-xs mt-1">
                Plan Financiero: <b>${Number(contrato.monto_total).toLocaleString('es-AR')}</b> en <b>{contrato.cantidad_cuotas} cuotas</b>
              </p>
            </div>
          </div>

          {/* Tarjetas de Resumen Numérico */}
          <div className="grid grid-cols-3 gap-6 text-center">
            <div className="p-4 border border-[var(--color-border-warm)] rounded-xl bg-slate-50">
              <span className="text-xs font-semibold text-slate-500 uppercase block mb-1">Total Cuotas</span>
              <span className="text-2xl font-bold text-slate-800">{cuotas.length}</span>
            </div>
            <div className="p-4 border border-emerald-200 bg-emerald-50 rounded-xl">
              <span className="text-xs font-semibold text-emerald-700 uppercase block mb-1">Cuotas Pagadas</span>
              <span className="text-2xl font-bold text-emerald-800">{pagadas}</span>
            </div>
            <div className="p-4 border border-amber-200 bg-amber-50 rounded-xl">
              <span className="text-xs font-semibold text-amber-700 uppercase block mb-1">Cuotas Pendientes</span>
              <span className="text-2xl font-bold text-amber-800">{pendientes}</span>
            </div>
          </div>

          {/* Tabla Integral de Cuotas, Comprobantes y Avisos al Cliente */}
          <div>
            <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-3">
              Cronograma de Cuotas, Comprobantes y Gestión de Avisos
            </h4>
            <div className="border border-[var(--color-border-warm)] rounded-xl overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] border-b border-[var(--color-border-warm)]">
                  <tr>
                    <th className="py-3.5 px-4 font-bold">#</th>
                    <th className="py-3.5 px-4 font-bold">Período</th>
                    <th className="py-3.5 px-4 font-bold">Vencimiento</th>
                    <th className="py-3.5 px-4 font-bold">Importe Base</th>
                    <th className="py-3.5 px-4 font-bold">Régimen IPC</th>
                    <th className="py-3.5 px-4 font-bold">Estado</th>
                    <th className="py-3.5 px-4 font-bold text-center">Gestión de Avisos (Mora)</th>
                    <th className="py-3.5 px-4 font-bold text-center print:hidden">Comprobantes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-warm)]">
                  {cuotas.map((c) => {
                    const pagosAsociados = c.pagos || [];
                    const avisoCuota = avisosMora.find((a) => a.cuota_id === c.id);

                    return (
                      <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 font-bold text-slate-800">{c.numero_cuota}</td>
                        <td className="py-3 px-4 text-slate-600 font-medium">{c.periodo}</td>
                        <td className="py-3 px-4 font-medium text-slate-700">{c.fecha_vencimiento}</td>
                        <td className="py-3 px-4 font-bold text-slate-900">
                          ${Number(c.monto_base).toLocaleString('es-AR')}
                        </td>
                        
                        <td className="py-3 px-4">
                          {c.numero_cuota <= 12 ? (
                            <span className="text-slate-400 font-medium">Fija (Sin IPC)</span>
                          ) : c.monto_ajuste_ipc && Number(c.monto_ajuste_ipc) > 0 ? (
                            <span className="text-indigo-700 font-bold">
                              +${Number(c.monto_ajuste_ipc).toLocaleString('es-AR')}
                            </span>
                          ) : (
                            <span className="text-indigo-600 font-medium bg-indigo-50 px-2 py-0.5 rounded">
                              Sujeta a IPC
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          {c.estado === 'pagada' ? (
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full">
                              <CheckCircle size={13} /> Pagada
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full">
                              <Clock size={13} /> Pendiente
                            </span>
                          )}
                        </td>

                        {/* Columna de Gestión de Avisos de Tesorería a Inmobiliaria */}
                        <td className="py-3 px-4 text-center">
                          {avisoCuota ? (
                            avisoCuota.estado === 'notificado' ? (
                              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-[11px] font-semibold" title={avisoCuota.mensaje_tesoreria}>
                                <CheckCheck size={14} className="text-emerald-600" />
                                <span>
                                  Avisado el{' '}
                                  {new Date(avisoCuota.fecha_notificacion_cliente).toLocaleString('es-AR', {
                                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                                  })}
                                </span>
                              </div>
                            ) : (
                              <button
                                onClick={() => marcarAvisoComoNotificado(avisoCuota)}
                                disabled={guardandoAvisoId === avisoCuota.id}
                                className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-bold shadow-xs transition-colors cursor-pointer"
                                title={`Instrucción de Tesorería: ${avisoCuota.mensaje_tesoreria || 'Sin nota'}`}
                              >
                                {guardandoAvisoId === avisoCuota.id ? (
                                  <Loader2 size={13} className="animate-spin" />
                                ) : (
                                  <BellRing size={13} />
                                )}
                                Marcar como Avisado
                              </button>
                            )
                          ) : (
                            <span className="text-slate-300 text-[11px]">-</span>
                          )}
                        </td>

                        {/* Mapeo de Comprobantes Multiples */}
                        <td className="py-3 px-4 text-center print:hidden">
                          {pagosAsociados.length > 0 ? (
                            <div className="flex items-center justify-center gap-2 flex-wrap">
                              {pagosAsociados.map((p, idx) => (
                                <BotonVerPdf
                                  key={p.id}
                                  filePath={p.comprobante_url}
                                  bucket="comprobantes-pago"
                                  titulo={`Comprobante ${idx + 1} (${p.es_saldo_mora ? 'Mora' : 'Cuota'}) - Cuota #${c.numero_cuota}`}
                                />
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}