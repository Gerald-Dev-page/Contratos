import { useEffect, useState, useMemo } from 'react';
import { 
  Plus, 
  Search, 
  Eye, 
  Edit3, 
  Phone, 
  CheckCheck, 
  Loader2,
  BellRing,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  CheckCircle2
} from 'lucide-react';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { registrarMovimiento } from '../utils/logger';
import ContratoFormModal from '../components/inmobiliaria/ContratoFormModal';
import DetalleTitularModal from '../components/inmobiliaria/DetalleTitularModal';
import EditarContratoModal from '../components/inmobiliaria/EditarContratoModal';
import AsignarIpcModal from '../components/inmobiliaria/AsignarIpcModal';
import BotonVerPdf from '../components/common/BotonVerPdf';

export default function Inmobiliaria() {
  const { user } = useAuth();
  const { mostrarToast } = useToast();
  const [contratos, setContratos] = useState([]);
  const [alertasMora, setAlertasMora] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [loading, setLoading] = useState(true);
  const [marcandoAvisoId, setMarcandoAvisoId] = useState(null);

  const [paginaActual, setPaginaActual] = useState(1);
  const elementosPorPagina = 8;

  const [modalNuevoAbierto, setModalNuevoAbierto] = useState(false);
  const [contratoDetalle, setContratoDetalle] = useState(null);
  const [contratoParaEditar, setContratoParaEditar] = useState(null);
  const [asignarIpcData, setAsignarIpcData] = useState(null);

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    setLoading(true);
    try {
      const [resContratos, resAlertas] = await Promise.all([
        supabase
          .from('contratos')
          .select('*, cuotas(*)')
          .order('created_at', { ascending: false }),

        supabase
          .from('avisos_mora')
          .select(`
            *,
            contratos (id, numero_expediente, titular_nombre, titular_telefono),
            cuotas (numero_cuota, periodo)
          `)
          .eq('estado', 'pendiente_envio')
          .order('fecha_reporte', { ascending: false })
      ]);

      if (resContratos.error) throw resContratos.error;
      if (resAlertas.error) throw resAlertas.error;

      setContratos(resContratos.data || []);
      setAlertasMora(resAlertas.data || []);
    } catch (err) {
      console.error('Error cargando inmobiliaria:', err.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Helper que evalúa el estado del IPC para un contrato según el progreso de sus cuotas:
   * Revisa cada umbral de 12 cuotas (12, 24, 36, 48...).
   * Si la cuota límite está pagada (o es la próxima exigible) y el bloque siguiente tiene IPC en 0:
   * -> Requiere asignar IPC de forma urgente.
   */
  const evaluarEstadoIpc = (c) => {
    const totalCuotas = Number(c.cantidad_cuotas || 0);
    if (totalCuotas <= 12) return { requiereIpc: false, bloqueActivo: null, valorIpc: 0, yaAsignado: false };

    const cuotas = c.cuotas || [];
    const cuotasPagadas = cuotas.filter((q) => q.estado === 'pagada').length;

    // Calculamos en qué bloque anual nos encontramos (Bloque 2 = cuotas 13-24, Bloque 3 = 25-36, etc.)
    const maxBloques = Math.ceil(totalCuotas / 12);

    for (let bloque = 2; bloque <= maxBloques; bloque++) {
      const cuotaUmbral = (bloque - 1) * 12; // 12, 24, 36...
      const cuotaInicioBloque = cuotaUmbral + 1; // 13, 25, 37...
      const cuotaFinBloque = Math.min(bloque * 12, totalCuotas);

      // El aviso y botón se activan si ya se pagó la cuota umbral (o el contrato llegó a ese punto)
      if (cuotasPagadas >= cuotaUmbral) {
        const qInicio = cuotas.find((q) => q.numero_cuota === cuotaInicioBloque);
        const valorAjuste = qInicio ? Number(qInicio.monto_ajuste_ipc || 0) : 0;

        // Si este bloque todavía no tiene IPC asignado, este es el que dispara la alerta
        if (valorAjuste === 0) {
          return {
            requiereIpc: true,
            bloqueActivo: bloque,
            cuotaDesde: cuotaInicioBloque,
            cuotaHasta: cuotaFinBloque,
            valorIpc: 0,
            yaAsignado: false
          };
        }

        // Si ya tiene IPC asignado pero es el bloque actual en curso
        if (cuotasPagadas < cuotaFinBloque) {
          return {
            requiereIpc: false,
            bloqueActivo: bloque,
            cuotaDesde: cuotaInicioBloque,
            cuotaHasta: cuotaFinBloque,
            valorIpc: valorAjuste,
            yaAsignado: true
          };
        }
      }
    }

    return { requiereIpc: false, bloqueActivo: null, valorIpc: 0, yaAsignado: false };
  };

  // Alertas dinámicas de IPC calculadas con el criterio de cuota 12 en adelante
  const alertasIpc = useMemo(() => {
    const lista = [];
    contratos.forEach((c) => {
      const estadoIpc = evaluarEstadoIpc(c);
      if (estadoIpc.requiereIpc) {
        lista.push({
          contrato: c,
          bloque: estadoIpc.bloqueActivo,
          cuotaDesde: estadoIpc.cuotaDesde,
          cuotaHasta: estadoIpc.cuotaHasta
        });
      }
    });
    return lista;
  }, [contratos]);

  const handleMarcarComoAvisado = async (aviso) => {
    setMarcandoAvisoId(aviso.id);
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
        descripcion: `Contacto de mora realizado a ${aviso.contratos?.titular_nombre} (Exp. ${aviso.contratos?.numero_expediente})`,
        expedienteId: aviso.contrato_id,
        detalles: { aviso_id: aviso.id, fecha: ahora }
      });

      mostrarToast('Contacto con el titular registrado exitosamente.');
      cargarDatos();
    } catch (err) {
      mostrarToast(`Error al marcar aviso: ${err.message}`, 'error');
    } finally {
      setMarcandoAvisoId(null);
    }
  };

  const contratosFiltrados = useMemo(() => {
    return contratos.filter((c) =>
      c.titular_nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
      c.numero_expediente?.toLowerCase().includes(busqueda.toLowerCase()) ||
      c.titular_dni?.includes(busqueda) ||
      c.padron?.toLowerCase().includes(busqueda.toLowerCase())
    );
  }, [contratos, busqueda]);

  const totalPaginas = Math.ceil(contratosFiltrados.length / elementosPorPagina) || 1;
  const contratosPaginados = useMemo(() => {
    const inicio = (paginaActual - 1) * elementosPorPagina;
    return contratosFiltrados.slice(inicio, inicio + elementosPorPagina);
  }, [contratosFiltrados, paginaActual]);

  return (
    <div className="p-8 w-full space-y-6">
      
      {/* 1. Alertas de IPC: Solo se muestran si alcanzaron la cuota 12, 24, 36... y falta definir el valor */}
      {alertasIpc.length > 0 && (
        <div className="w-full rounded-xl border border-indigo-200 bg-indigo-50/80 p-4 shadow-xs space-y-2.5">
          <div className="flex items-center gap-2 text-indigo-900 font-semibold text-xs uppercase tracking-wider">
            <TrendingUp size={16} className="text-indigo-600 animate-pulse" />
            <span>Alertas de IPC: Contratos en período de actualización ({alertasIpc.length})</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {alertasIpc.map((item, idx) => (
              <div 
                key={idx} 
                className="bg-white border border-indigo-100 p-3.5 rounded-lg shadow-2xs flex items-center justify-between gap-3"
              >
                <div>
                  <p className="font-semibold text-slate-900 text-xs">{item.contrato.titular_nombre}</p>
                  <p className="text-[11px] text-slate-500 font-mono">
                    Exp: {item.contrato.numero_expediente} • Cuotas {item.cuotaDesde} a {item.cuotaHasta}
                  </p>
                  <span className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded font-medium mt-1 inline-block">
                    Alcanzó cuota {item.cuotaDesde - 1} • Requiere IPC Año {item.bloque}
                  </span>
                </div>

                <button
                  onClick={() => setAsignarIpcData({ contrato: item.contrato, bloque: item.bloque })}
                  className="btn-primario py-1.5 px-3 text-xs font-semibold flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 whitespace-nowrap cursor-pointer shadow-xs"
                >
                  <TrendingUp size={13} /> Asignar IPC
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. Alertas de Tesorería */}
      {alertasMora.length > 0 && (
        <div className="w-full rounded-xl border border-amber-300 bg-amber-50/80 p-4 shadow-xs space-y-2.5">
          <div className="flex items-center gap-2 text-amber-900 font-semibold text-xs uppercase tracking-wider">
            <BellRing size={16} className="text-amber-600 animate-pulse" />
            <span>Alertas de Tesorería ({alertasMora.length})</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {alertasMora.map((a) => (
              <div 
                key={a.id} 
                className="bg-white border border-amber-200 p-3.5 rounded-lg shadow-2xs flex flex-col justify-between gap-2.5"
              >
                <div>
                  <div className="flex justify-between items-start">
                    <span className="font-semibold text-slate-900 text-xs">
                      {a.contratos?.titular_nombre || 'Titular'}
                    </span>
                    <span className="text-[10px] font-semibold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                      Cuota #{a.cuotas?.numero_cuota}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-600 mt-1 flex items-center gap-1">
                    <Phone size={12} className="text-slate-400" />
                    Tel: <span className="font-semibold">{a.contratos?.titular_telefono || 'Sin teléfono'}</span>
                  </p>

                  <p className="text-[11px] italic text-slate-600 bg-slate-50 p-2 rounded mt-1 border border-slate-100">
                    "{a.mensaje_tesoreria}"
                  </p>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                  <span className="text-[10px] text-slate-400">
                    {new Date(a.fecha_reporte).toLocaleDateString('es-AR')}
                  </span>
                  <button
                    onClick={() => handleMarcarComoAvisado(a)}
                    disabled={marcandoAvisoId === a.id}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-semibold cursor-pointer"
                  >
                    {marcandoAvisoId === a.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCheck size={13} />}
                    Marcar Avisado
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
            Gestión Inmobiliaria y Lotes
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Administración de expedientes de venta, catastro y asignación de IPC por contrato
          </p>
        </div>

        <button
          onClick={() => setModalNuevoAbierto(true)}
          className="btn-primario text-sm py-2.5 px-5 flex items-center gap-2 cursor-pointer shadow-md bg-indigo-600 hover:bg-indigo-700 font-semibold"
        >
          <Plus size={18} /> Nuevo Contrato
        </button>
      </div>

      {/* 4. Buscador */}
      <div className="card-ergonomica p-4 flex items-center gap-3 bg-white border border-slate-200 w-full">
        <Search size={18} className="text-slate-400 ml-1" />
        <input
          type="text"
          placeholder="Buscar por Titular, Expediente, DNI o N° de Padrón..."
          value={busqueda}
          onChange={(e) => {
            setBusqueda(e.target.value);
            setPaginaActual(1);
          }}
          className="w-full bg-transparent text-sm text-[var(--color-text-primary)] outline-none"
        />
      </div>

      {/* 5. Tabla de Contratos */}
      <div className="card-ergonomica bg-white overflow-hidden shadow-xs border border-slate-200 w-full">
        {loading ? (
          <div className="py-12 text-center text-sm text-slate-500">Cargando contratos...</div>
        ) : contratosPaginados.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">No se encontraron contratos registrados.</div>
        ) : (
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="py-3.5 px-5 font-semibold">Expediente</th>
                  <th className="py-3.5 px-5 font-semibold">Titular y DNI</th>
                  <th className="py-3.5 px-5 font-semibold">Sector y Terreno</th>
                  <th className="py-3.5 px-5 font-semibold">Monto Total</th>
                  <th className="py-3.5 px-5 font-semibold text-center">Contrato PDF</th>
                  <th className="py-3.5 px-5 font-semibold text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {contratosPaginados.map((c) => {
                  const fechaAlta = c.created_at || c.fecha_carga;
                  const fechaFormateada = fechaAlta 
                    ? new Date(fechaAlta).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                    : '-';

                  // Evaluación del estado del IPC para este contrato
                  const estadoIpc = evaluarEstadoIpc(c);

                  return (
                    <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-4 px-5 whitespace-nowrap">
                        <div className="font-semibold text-indigo-950">{c.numero_expediente}</div>
                        <span className="text-[11px] text-slate-400 font-mono block mt-0.5">
                          Alta: {fechaFormateada}
                        </span>
                      </td>

                      <td className="py-4 px-5">
                        <div className="font-semibold text-slate-900">{c.titular_nombre}</div>
                        <span className="text-xs text-slate-500">DNI: {c.titular_dni}</span>
                      </td>

                      <td className="py-4 px-5 text-slate-600 text-xs">
                        <span className="font-semibold text-indigo-900 block">{c.sector || 'General'}</span>
                        <span className="text-slate-400">Mz: {c.manzana} | Parc: {c.parcela}</span>
                      </td>

                      <td className="py-4 px-5 font-semibold text-slate-900 whitespace-nowrap">
                        ${Number(c.monto_total).toLocaleString('es-AR')}
                        <span className="block text-xs font-normal text-slate-500">{c.cantidad_cuotas} cuotas</span>
                      </td>

                      <td className="py-4 px-5 text-center">
                        <BotonVerPdf
                          filePath={c.contrato_pdf_url}
                          bucket="contratos-pdf"
                          titulo={`Contrato Exp. ${c.numero_expediente}`}
                        />
                      </td>

                      <td className="py-4 px-5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          
                          {/* Botón Dinámico de IPC según la regla de cuota 12+ */}
                          {c.cantidad_cuotas > 12 && (
                            estadoIpc.requiereIpc ? (
                              // Llegó a la cuota 12 (o 24, etc.) y aún no tiene valor asignado: Alerta Índigo
                              <button
                                onClick={() => setAsignarIpcData({ contrato: c, bloque: estadoIpc.bloqueActivo })}
                                className="py-1.5 px-2.5 text-xs flex items-center gap-1 text-white bg-indigo-600 hover:bg-indigo-700 font-bold rounded-lg transition-colors cursor-pointer shadow-xs animate-pulse"
                                title={`Llegó a la cuota ${estadoIpc.cuotaDesde - 1}. Clic para asignar IPC del Año ${estadoIpc.bloqueActivo}.`}
                              >
                                <TrendingUp size={13} />
                                <span>Asignar IPC</span>
                              </button>
                            ) : estadoIpc.yaAsignado ? (
                              // Ya fue asignado para el ciclo actual: Verde
                              <button
                                onClick={() => setAsignarIpcData({ contrato: c, bloque: estadoIpc.bloqueActivo })}
                                className="py-1.5 px-2.5 text-xs flex items-center gap-1.5 text-emerald-800 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 font-bold rounded-lg transition-colors cursor-pointer"
                                title={`IPC asignado: +$${estadoIpc.valorIpc.toLocaleString('es-AR')} para cuotas ${estadoIpc.cuotaDesde} a ${estadoIpc.cuotaHasta}. Clic para modificar.`}
                              >
                                <CheckCircle2 size={13} className="text-emerald-700" />
                                <span>IPC Asignado</span>
                              </button>
                            ) : null
                            // Si todavía va por la cuota 1 a 11, NO se muestra ningún botón ni alerta de IPC
                          )}

                          <button
                            onClick={() => setContratoDetalle(c)}
                            className="btn-icono py-1.5 px-3 text-xs flex items-center gap-1.5 text-slate-700 bg-slate-100 hover:bg-slate-200 font-semibold rounded-lg cursor-pointer"
                            title="Ver Ficha y Cuotas"
                          >
                            <Eye size={15} /> Ver Ficha
                          </button>

                          <button
                            onClick={() => setContratoParaEditar(c)}
                            className="btn-icono py-1.5 px-2.5 text-xs flex items-center gap-1 text-slate-700 bg-slate-100 hover:bg-slate-200 font-medium rounded-lg cursor-pointer"
                            title="Editar Datos"
                          >
                            <Edit3 size={15} /> Editar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginación */}
        {totalPaginas > 1 && (
          <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs font-medium text-slate-600">
            <span>
              Página <b>{paginaActual}</b> de <b>{totalPaginas}</b> ({contratosFiltrados.length} contratos)
            </span>
            <div className="flex gap-2">
              <button
                disabled={paginaActual === 1}
                onClick={() => setPaginaActual((p) => Math.max(p - 1, 1))}
                className="btn-icono py-1.5 px-3 border border-slate-300 bg-white rounded-md hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                disabled={paginaActual === totalPaginas}
                onClick={() => setPaginaActual((p) => Math.min(p + 1, totalPaginas))}
                className="btn-icono py-1.5 px-3 border border-slate-300 bg-white rounded-md hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modales */}
      <ContratoFormModal
        isOpen={modalNuevoAbierto}
        onClose={() => setModalNuevoAbierto(false)}
        onContratoCreado={cargarDatos}
      />

      {contratoDetalle && (
        <DetalleTitularModal
          contrato={contratoDetalle}
          onClose={() => {
            setContratoDetalle(null);
            cargarDatos();
          }}
        />
      )}

      {contratoParaEditar && (
        <EditarContratoModal
          contrato={contratoParaEditar}
          onClose={() => setContratoParaEditar(null)}
          onActualizado={cargarDatos}
        />
      )}

      {asignarIpcData && (
        <AsignarIpcModal
          contrato={asignarIpcData.contrato}
          bloque={asignarIpcData.bloque}
          onClose={() => setAsignarIpcData(null)}
          onActualizado={cargarDatos}
        />
      )}
    </div>
  );
}