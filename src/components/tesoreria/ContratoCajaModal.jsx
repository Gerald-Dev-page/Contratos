import { useState, useMemo, useEffect } from 'react';
import { 
  X, 
  DollarSign, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Printer
} from 'lucide-react';
import { supabase } from '../../services/supabase';
import { liquidarCuota } from '../../utils/finance';
import BotonVerPdf from '../common/BotonVerPdf';
import CobroModal from './CobroModal';
import AvisoMoraModal from './AvisoMoraModal';
import CobrarMoraModal from './CobrarMoraModal';

export default function ContratoCajaModal({ contrato, onClose, onActualizar }) {
  const [cuotaParaCobrar, setCuotaParaCobrar] = useState(null);
  const [cuotaParaAviso, setCuotaParaAviso] = useState(null);
  const [modalMoraAbierto, setModalMoraAbierto] = useState(false);
  const [mapaIndicesIpc, setMapaIndicesIpc] = useState({});

  if (!contrato) return null;

  const hoy = new Date();

  useEffect(() => {
    async function cargarIndices() {
      const { data } = await supabase.from('indices_ipc').select('periodo, valor_indice');
      if (data) {
        const mapa = {};
        data.forEach((item) => {
          mapa[item.periodo] = Number(item.valor_indice);
        });
        setMapaIndicesIpc(mapa);
      }
    }
    cargarIndices();
  }, []);

  const cuotasOrdenadas = [...(contrato.cuotas || [])].sort((a, b) => a.numero_cuota - b.numero_cuota);
  const proximaCuota = cuotasOrdenadas.find((c) => c.estado === 'pendiente');

  const { moraCobradaHistorica, moraPendienteAcumulada, totalPercibido, cuotasEnMora } = useMemo(() => {
    let moraCobrada = 0;
    let moraPendiente = 0;
    let percibido = 0;
    const listaEnMora = [];

    cuotasOrdenadas.forEach((c) => {
      if (c.pagos && Array.isArray(c.pagos)) {
        c.pagos.forEach((p) => {
          percibido += Number(p.monto_abonado || 0);
          moraCobrada += Number(p.interes_mora_cobrado || 0);
        });
      }

      if (c.estado === 'pendiente') {
        const ipcValor = mapaIndicesIpc[c.periodo] || 0;
        const liq = liquidarCuota(c, hoy, ipcValor);

        if (liq.enMora && !c.mora_saldada) {
          moraPendiente += liq.recargoMora;
          listaEnMora.push({ ...c, recargoCalculado: liq.recargoMora, subtotalIndexado: liq.subtotal });
        }
      }
    });

    return {
      moraCobradaHistorica: moraCobrada,
      moraPendienteAcumulada: moraPendiente,
      totalPercibido: percibido,
      cuotasEnMora: listaEnMora
    };
  }, [cuotasOrdenadas, mapaIndicesIpc, hoy]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-6 print:p-0">
      <div className="card-ergonomica w-full max-w-6xl max-h-[92vh] flex flex-col bg-white overflow-hidden shadow-2xl print:max-h-none print:shadow-none border border-slate-200">
        
        {/* Cabecera Proporcionada */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-[var(--color-border-warm)] bg-[var(--color-bg-surface)] print:hidden">
          <div className="flex items-center gap-4">
            <div>
              <h3 className="font-bold text-base text-[var(--color-text-primary)]">
                Ficha de Caja • {contrato.titular_nombre}
              </h3>
              <span className="text-xs text-[var(--color-text-secondary)]">
                Expediente: <b>{contrato.numero_expediente}</b> • DNI: {contrato.titular_dni}
              </span>
            </div>
            <div className="pl-4 border-l border-slate-300">
              <BotonVerPdf
                filePath={contrato.contrato_pdf_url}
                bucket="contratos-pdf"
                titulo={`Contrato Exp. ${contrato.numero_expediente}`}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={() => window.print()} 
              className="btn-icono text-xs py-2 px-3 flex items-center gap-2"
            >
              <Printer size={16} /> Imprimir Estado
            </button>
            <button 
              onClick={onClose} 
              className="btn-icono text-xs p-2"
              title="Cerrar ventana"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          
          {/* Tarjetas de Información y Balances */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-4 rounded-xl bg-[var(--color-bg-egg)] border border-[var(--color-border-warm)] text-xs space-y-1">
              <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">
                Ubicación Catastral
              </span>
              <p className="text-slate-800 text-sm">
                Manzana: <b>{contrato.manzana}</b> | Parcela: <b>{contrato.parcela}</b>
              </p>
              <p className="text-slate-600">Padrón: <b>{contrato.padron}</b></p>
              <p className="text-slate-600">Tel: <b>{contrato.titular_telefono}</b></p>
            </div>

            <div className="p-4 rounded-xl border border-amber-300 bg-amber-50/80 text-xs flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-extrabold text-amber-900 uppercase tracking-wider block">
                  Mora Pendiente Acumulada
                </span>
                <p className="text-xl font-bold text-amber-950 mt-0.5">
                  ${moraPendienteAcumulada.toLocaleString('es-AR')}
                </p>
                <span className="text-[11px] text-amber-800 block">
                  {moraPendienteAcumulada === 0 ? 'Sin mora adeudada' : 'Vencimientos fuera de término'}
                </span>
              </div>
              {moraPendienteAcumulada > 0 && (
                <button
                  type="button"
                  onClick={() => setModalMoraAbierto(true)}
                  className="mt-2 py-1.5 px-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-xs"
                >
                  <DollarSign size={14} /> Cobrar Mora Pendiente
                </button>
              )}
            </div>

            <div className="p-4 rounded-xl border border-emerald-300 bg-emerald-50/80 text-xs space-y-1">
              <span className="text-[10px] font-extrabold text-emerald-900 uppercase tracking-wider block">
                Total Percibido a la Fecha
              </span>
              <p className="text-xl font-bold text-emerald-950">
                ${totalPercibido.toLocaleString('es-AR')}
              </p>
              <span className="text-[11px] text-emerald-800 font-semibold block">
                Mora histórica cobrada: ${moraCobradaHistorica.toLocaleString('es-AR')}
              </span>
            </div>
          </div>

          {/* Cuota Corriente */}
          {proximaCuota && (() => {
            const ipcVal = mapaIndicesIpc[proximaCuota.periodo] || 0;
            const liqProx = liquidarCuota(proximaCuota, hoy, ipcVal);
            return (
              <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 print:hidden">
                <div>
                  <span className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider block">
                    Próxima Cuota a Liquidar
                  </span>
                  <p className="text-base font-bold text-slate-900 mt-0.5">
                    Cuota #{proximaCuota.numero_cuota} • Período {proximaCuota.periodo}
                  </p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Vencimiento: <b>{proximaCuota.fecha_vencimiento}</b> • Base Exigible:{' '}
                    <b className="text-slate-900 font-bold">${liqProx.subtotal.toLocaleString('es-AR')}</b>
                    {proximaCuota.numero_cuota > 12 && liqProx.montoIpc > 0 && (
                      <span className="ml-1.5 text-indigo-700 font-semibold">
                        (Base ${liqProx.montoBase.toLocaleString('es-AR')} + IPC ${liqProx.montoIpc.toLocaleString('es-AR')})
                      </span>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => setCuotaParaCobrar({ 
                    ...proximaCuota, 
                    contratos: contrato,
                    monto_ipc_vigente: liqProx.montoIpc,
                    subtotal_calculado: liqProx.subtotal
                  })}
                  className="btn-primario text-xs py-2 px-4 flex items-center gap-1.5 shadow-sm font-bold cursor-pointer"
                >
                  <DollarSign size={15} /> Registrar Cobranza
                </button>
              </div>
            );
          })()}

          {/* Tabla de Cuotas */}
          <div>
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5">
              Cronograma de Cuotas y Cobranzas
            </h4>
            <div className="border border-[var(--color-border-warm)] rounded-xl overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] border-b border-[var(--color-border-warm)]">
                  <tr>
                    <th className="py-3 px-3.5 font-bold text-center">#</th>
                    <th className="py-3 px-3.5 font-bold">Período</th>
                    <th className="py-3 px-3.5 font-bold">Vencimiento</th>
                    <th className="py-3 px-3.5 font-bold">Importe Base</th>
                    <th className="py-3 px-3.5 font-bold">Ajuste IPC</th>
                    <th className="py-3 px-3.5 font-bold">Subtotal</th>
                    <th className="py-3 px-3.5 font-bold">Mora (5%)</th>
                    <th className="py-3 px-3.5 font-bold">Estado</th>
                    <th className="py-3 px-3.5 font-bold text-center print:hidden">Comprobantes</th>
                    <th className="py-3 px-3.5 font-bold text-center print:hidden">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-warm)]">
                  {cuotasOrdenadas.map((c) => {
                    const ipcVal = mapaIndicesIpc[c.periodo] || 0;
                    const liq = liquidarCuota(c, hoy, ipcVal);
                    const pagosAsociados = c.pagos || [];
                    const totalMoraCobrada = pagosAsociados.reduce((acc, p) => acc + Number(p.interes_mora_cobrado || 0), 0);
                    const enMoraActiva = c.estado === 'pendiente' && liq.enMora && !c.mora_saldada;

                    return (
                      <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-3.5 font-bold text-center text-slate-900">{c.numero_cuota}</td>
                        <td className="py-3 px-3.5 font-medium text-slate-600">{c.periodo}</td>
                        <td className="py-3 px-3.5 font-medium text-slate-700">{c.fecha_vencimiento}</td>
                        <td className="py-3 px-3.5 font-bold text-slate-900">${Number(c.monto_base).toLocaleString('es-AR')}</td>

                        {/* IPC */}
                        <td className="py-3 px-3.5">
                          {c.numero_cuota <= 12 ? (
                            <span className="text-slate-400 font-medium">Fija</span>
                          ) : liq.montoIpc > 0 ? (
                            <span className="text-indigo-700 font-bold">
                              +${liq.montoIpc.toLocaleString('es-AR')}
                            </span>
                          ) : (
                            <span className="text-amber-600 italic text-[11px]">Sin IPC</span>
                          )}
                        </td>

                        {/* Subtotal */}
                        <td className="py-3 px-3.5 font-bold text-slate-950">
                          ${liq.subtotal.toLocaleString('es-AR')}
                        </td>

                        {/* Mora */}
                        <td className="py-3 px-3.5">
                          {totalMoraCobrada > 0 ? (
                            <span className="text-emerald-700 font-bold">
                              +${totalMoraCobrada.toLocaleString('es-AR')}
                            </span>
                          ) : enMoraActiva ? (
                            <span className="text-rose-600 font-bold">
                              +${liq.recargoMora.toLocaleString('es-AR')}
                            </span>
                          ) : c.mora_saldada ? (
                            <span className="text-emerald-700 font-bold text-[11px] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              Saldada
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>

                        {/* Estado */}
                        <td className="py-3 px-3.5">
                          {c.estado === 'pagada' ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                              <CheckCircle2 size={12} /> Pagada
                            </span>
                          ) : enMoraActiva ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-100 px-2.5 py-0.5 rounded-full">
                              <AlertTriangle size={12} /> Vencida (+5%)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-100 px-2.5 py-0.5 rounded-full">
                              <Clock size={12} /> Al Día
                            </span>
                          )}
                        </td>

                        {/* Comprobantes */}
                        <td className="py-3 px-3.5 text-center print:hidden">
                          {pagosAsociados.length > 0 ? (
                            <div className="flex items-center justify-center gap-1.5 flex-wrap">
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

                        {/* Acciones */}
                        <td className="py-3 px-3.5 text-center print:hidden">
                          {c.estado === 'pendiente' && (
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => setCuotaParaCobrar({ 
                                  ...c, 
                                  contratos: contrato,
                                  monto_ipc_vigente: liq.montoIpc,
                                  subtotal_calculado: liq.subtotal
                                })}
                                className="btn-primario py-1 px-3 text-[11px] font-bold cursor-pointer"
                              >
                                Cobrar
                              </button>
                              {enMoraActiva && (
                                <button
                                  onClick={() => setCuotaParaAviso({ ...c, contratos: contrato })}
                                  className="btn-icono text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 py-1 px-2 text-[11px] font-bold rounded-lg cursor-pointer"
                                  title="Emitir aviso a Inmobiliaria"
                                >
                                  Avisar
                                </button>
                              )}
                            </div>
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

      {cuotaParaCobrar && (
        <CobroModal
          cuota={cuotaParaCobrar}
          onClose={() => setCuotaParaCobrar(null)}
          onPagoRegistrado={() => {
            setCuotaParaCobrar(null);
            onActualizar();
            onClose();
          }}
        />
      )}

      {cuotaParaAviso && (
        <AvisoMoraModal
          cuota={cuotaParaAviso}
          onClose={() => setCuotaParaAviso(null)}
          onAvisoEmitido={() => setCuotaParaAviso(null)}
        />
      )}

      {modalMoraAbierto && (
        <CobrarMoraModal
          contrato={contrato}
          montoMora={moraPendienteAcumulada}
          cuotasAfectadas={cuotasEnMora}
          onClose={() => setModalMoraAbierto(false)}
          onMoraCobrada={() => {
            setModalMoraAbierto(false);
            onActualizar();
            onClose();
          }}
        />
      )}
    </div>
  );
}