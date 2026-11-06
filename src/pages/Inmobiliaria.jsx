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
  CheckCircle2,
  Filter
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
  const [filtroEstado, setFiltroEstado] = useState('todos'); // 'todos' | 'pendientes' | 'completados' | 'requiere_ipc'
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
      cuotas (
        id,
        numero_cuota,
        periodo,
        monto_base,
        monto_recargo_mora,
        monto_total_exigible,
        recargo_mora_porcentaje,
        fecha_vencimiento
      )
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
   * Helper que evalúa el estado del IPC para un contrato según el progreso de sus cuotas
   */
  const evaluarEstadoIpc = (c) => {
    const totalCuotas = Number(c.cantidad_cuotas || 0);
    if (totalCuotas <= 12) return { requiereIpc: false, bloqueActivo: null, valorIpc: 0, yaAsignado: false };

    const cuotas = c.cuotas || [];
    const cuotasPagadas = cuotas.filter((q) => q.estado === 'pagada').length;
    const maxBloques = Math.ceil(totalCuotas / 12);

    for (let bloque = 2; bloque <= maxBloques; bloque++) {
      const cuotaUmbral = (bloque - 1) * 12;
      const cuotaInicioBloque = cuotaUmbral + 1;
      const cuotaFinBloque = Math.min(bloque * 12, totalCuotas);

      if (cuotasPagadas >= cuotaUmbral) {
        const qInicio = cuotas.find((q) => q.numero_cuota === cuotaInicioBloque);
        const valorAjuste = qInicio ? Number(qInicio.monto_ajuste_ipc || 0) : 0;

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

  /**
   * Helper para verificar si un contrato completó todas sus cuotas
   */
  const esContratoCompletado = (c) => {
    if (c.estado === 'completado') return true;
    const cuotas = c.cuotas || [];
    if (cuotas.length === 0) return false;
    return cuotas.every((q) => q.estado === 'pagada');
  };

  // Alertas dinámicas de IPC
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

  // Contadores para pestañas de filtro
  const conteoFiltros = useMemo(() => {
    let pendientes = 0;
    let completados = 0;
    let requierenIpc = 0;

    contratos.forEach((c) => {
      const completado = esContratoCompletado(c);
      if (completado) {
        completados++;
      } else {
        pendientes++;
      }

      if (evaluarEstadoIpc(c).requiereIpc) {
        requierenIpc++;
      }
    });

    return { todos: contratos.length, pendientes, completados, requierenIpc };
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

  /**
   * Filtrado y Priorización:
   * 1. Filtra por texto (búsqueda).
   * 2. Filtra por pestaña de estado.
   * 3. Ordena: Pendientes al inicio (prioridad) y Completados al fondo.
   */
  const contratosFiltrados = useMemo(() => {
    const query = busqueda.toLowerCase().trim();

    // 1. Filtrar por término de búsqueda
    let lista = contratos.filter((c) =>
      c.titular_nombre?.toLowerCase().includes(query) ||
      c.numero_expediente?.toLowerCase().includes(query) ||
      c.titular_dni?.includes(query) ||
      c.padron?.toLowerCase().includes(query) ||
      c.sector?.toLowerCase().includes(query)
    );

    // 2. Filtrar por estado seleccionado
    if (filtroEstado === 'pendientes') {
      lista = lista.filter((c) => !esContratoCompletado(c));
    } else if (filtroEstado === 'completados') {
      lista = lista.filter((c) => esContratoCompletado(c));
    } else if (filtroEstado === 'requiere_ipc') {
      lista = lista.filter((c) => evaluarEstadoIpc(c).requiereIpc);
    }

    // 3. Orden de prioridad: Pendientes primero (0), Completados al fondo (1)
    return lista.sort((a, b) => {
      const aCompletado = esContratoCompletado(a) ? 1 : 0;
      const bCompletado = esContratoCompletado(b) ? 1 : 0;

      if (aCompletado !== bCompletado) {
        return aCompletado - bCompletado;
      }

      // Si ambos están en el mismo grupo, ordenar por fecha más reciente
      const fechaA = new Date(a.created_at || a.fecha_carga || 0).getTime();
      const fechaB = new Date(b.created_at || b.fecha_carga || 0).getTime();
      return fechaB - fechaA;
    });
  }, [contratos, busqueda, filtroEstado]);

  const totalPaginas = Math.ceil(contratosFiltrados.length / elementosPorPagina) || 1;
  const contratosPaginados = useMemo(() => {
    const inicio = (paginaActual - 1) * elementosPorPagina;
    return contratosFiltrados.slice(inicio, inicio + elementosPorPagina);
  }, [contratosFiltrados, paginaActual]);

  return (
    <div className="p-8 w-full space-y-6">
      
      {/* 1. Alertas de IPC */}
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
      {alertasMora.map((a) => {
        // Cálculo del recargo de mora (monto fijado o 5% sobre la base)
        const montoBase = Number(a.cuotas?.monto_base || 0);
        const porcentaje = Number(a.cuotas?.recargo_mora_porcentaje || 5);
        const montoMora = Number(a.cuotas?.monto_recargo_mora || 0) > 0
          ? Number(a.cuotas.monto_recargo_mora)
          : (montoBase * (porcentaje / 100));

        return (
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

              {/* Teléfono */}
              <p className="text-[11px] text-slate-600 mt-1 flex items-center gap-1">
                <Phone size={12} className="text-slate-400" />
                Tel: <span className="font-semibold">{a.contratos?.titular_telefono || 'Sin teléfono'}</span>
              </p>

              {/* Indicador de Mora Destacado */}
              <div className="mt-2 bg-rose-50 border border-rose-200 p-2 rounded-md flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-rose-700 uppercase block">
                    Vencida (+{porcentaje}%)
                  </span>
                  <span className="text-xs font-bold text-rose-900">
                    +${montoMora.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                {montoBase > 0 && (
                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 block">Total Exigible</span>
                    <span className="text-xs font-bold text-slate-800">
                      ${(montoBase + montoMora).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
              </div>

              {/* Mensaje de Tesorería */}
              <p className="text-[11px] italic text-slate-600 bg-slate-50 p-2 rounded mt-2 border border-slate-100">
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
        );
      })}
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

      {/* 4. Barra de Búsqueda y Filtros Rápidos */}
      <div className="space-y-3">
        <div className="card-ergonomica p-3.5 flex items-center gap-3 bg-white border border-slate-200 w-full">
          <Search size={18} className="text-slate-400 ml-1" />
          <input
            type="text"
            placeholder="Buscar por Titular, Expediente, DNI, Sector o N° de Padrón..."
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value);
              setPaginaActual(1);
            }}
            className="w-full bg-transparent text-sm text-[var(--color-text-primary)] outline-none"
          />
        </div>

        {/* Pestañas de Filtrado */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs font-semibold">
          <button
            onClick={() => { setFiltroEstado('todos'); setPaginaActual(1); }}
            className={`px-3.5 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
              filtroEstado === 'todos'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <span>Todos</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              filtroEstado === 'todos' ? 'bg-indigo-800 text-indigo-100' : 'bg-slate-100 text-slate-600'
            }`}>
              {conteoFiltros.todos}
            </span>
          </button>

          <button
            onClick={() => { setFiltroEstado('pendientes'); setPaginaActual(1); }}
            className={`px-3.5 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
              filtroEstado === 'pendientes'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <span>Pendientes / Activos</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              filtroEstado === 'pendientes' ? 'bg-amber-800 text-amber-100' : 'bg-slate-100 text-slate-600'
            }`}>
              {conteoFiltros.pendientes}
            </span>
          </button>

          <button
            onClick={() => { setFiltroEstado('completados'); setPaginaActual(1); }}
            className={`px-3.5 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
              filtroEstado === 'completados'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <CheckCircle2 size={13} />
            <span>Completados</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              filtroEstado === 'completados' ? 'bg-emerald-800 text-emerald-100' : 'bg-slate-100 text-slate-600'
            }`}>
              {conteoFiltros.completados}
            </span>
          </button>

          {conteoFiltros.requierenIpc > 0 && (
            <button
              onClick={() => { setFiltroEstado('requiere_ipc'); setPaginaActual(1); }}
              className={`px-3.5 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                filtroEstado === 'requiere_ipc'
                  ? 'bg-indigo-700 text-white shadow-xs animate-pulse'
                  : 'bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100'
              }`}
            >
              <TrendingUp size={13} />
              <span>Requieren IPC</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                filtroEstado === 'requiere_ipc' ? 'bg-indigo-900 text-indigo-100' : 'bg-indigo-200 text-indigo-900'
              }`}>
                {conteoFiltros.requierenIpc}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* 5. Tabla de Contratos */}
      <div className="card-ergonomica bg-white overflow-hidden shadow-xs border border-slate-200 w-full">
        {loading ? (
          <div className="py-12 text-center text-sm text-slate-500">Cargando contratos...</div>
        ) : contratosPaginados.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">No se encontraron contratos con el criterio seleccionado.</div>
        ) : (
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="py-3.5 px-5 font-semibold">Expediente</th>
                  <th className="py-3.5 px-5 font-semibold">Titular y DNI</th>
                  <th className="py-3.5 px-5 font-semibold">Sector y Terreno</th>
                  <th className="py-3.5 px-5 font-semibold">Monto y Estado</th>
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

                  const cuotas = c.cuotas || [];
                  const cuotasPagadas = cuotas.filter((q) => q.estado === 'pagada').length;
                  const completado = esContratoCompletado(c);
                  const estadoIpc = evaluarEstadoIpc(c);

                  return (
                    <tr 
                      key={c.id} 
                      className={`transition-colors ${
                        completado 
                          ? 'bg-slate-50/60 hover:bg-slate-100/60 text-slate-500' 
                          : 'hover:bg-slate-50 text-slate-900'
                      }`}
                    >
                      <td className="py-4 px-5 whitespace-nowrap">
                        <div className="font-semibold text-indigo-950 flex items-center gap-1.5">
                          <span>{c.numero_expediente}</span>
                          {completado && (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded">
                              Saldado
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-400 font-mono block mt-0.5">
                          Alta: {fechaFormateada}
                        </span>
                      </td>

                      <td className="py-4 px-5">
                        <div className={`font-semibold ${completado ? 'text-slate-700' : 'text-slate-900'}`}>
                          {c.titular_nombre}
                        </div>
                        <span className="text-xs text-slate-500">DNI: {c.titular_dni}</span>
                      </td>

                      <td className="py-4 px-5 text-slate-600 text-xs">
                        <span className="font-semibold text-indigo-900 block">{c.sector || 'General'}</span>
                        <span className="text-slate-400">Mz: {c.manzana} | Parc: {c.parcela}</span>
                      </td>

                      <td className="py-4 px-5 whitespace-nowrap">
                        <div className="font-semibold text-slate-900">
                          ${Number(c.monto_total).toLocaleString('es-AR')}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-slate-500">
                            {cuotasPagadas} / {c.cantidad_cuotas} cuotas
                          </span>
                          {completado ? (
                            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.2 rounded flex items-center gap-0.5">
                              <CheckCircle2 size={10} /> 100%
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded">
                              {c.cantidad_cuotas - cuotasPagadas} pendientes
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-4 px-5 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Botón Documento 1 */}
                          <BotonVerPdf
                            filePath={c.contrato_pdf_url}
                            bucket="contratos-pdf"
                            titulo={`Doc 1 - Exp. ${c.numero_expediente}`}
                          />

                          {/* Botón Documento 2 (si existe) */}
                          {c.contrato_pdf_url_2 && (
                            <BotonVerPdf
                              filePath={c.contrato_pdf_url_2}
                              bucket="contratos-pdf"
                              titulo={`Doc 2 - Exp. ${c.numero_expediente}`}
                            />
                          )}
                        </div>
                      </td>

                      <td className="py-4 px-5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          
                          {/* Botón Dinámico de IPC según la regla de cuota 12+ (solo si no está completado) */}
                          {!completado && c.cantidad_cuotas > 12 && (
                            estadoIpc.requiereIpc ? (
                              <button
                                onClick={() => setAsignarIpcData({ contrato: c, bloque: estadoIpc.bloqueActivo })}
                                className="py-1.5 px-2.5 text-xs flex items-center gap-1 text-white bg-indigo-600 hover:bg-indigo-700 font-bold rounded-lg transition-colors cursor-pointer shadow-xs animate-pulse"
                                title={`Llegó a la cuota ${estadoIpc.cuotaDesde - 1}. Clic para asignar IPC del Año ${estadoIpc.bloqueActivo}.`}
                              >
                                <TrendingUp size={13} />
                                <span>Asignar IPC</span>
                              </button>
                            ) : estadoIpc.yaAsignado ? (
                              <button
                                onClick={() => setAsignarIpcData({ contrato: c, bloque: estadoIpc.bloqueActivo })}
                                className="py-1.5 px-2.5 text-xs flex items-center gap-1.5 text-emerald-800 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 font-bold rounded-lg transition-colors cursor-pointer"
                                title={`IPC asignado: +$${estadoIpc.valorIpc.toLocaleString('es-AR')} para cuotas ${estadoIpc.cuotaDesde} a ${estadoIpc.cuotaHasta}. Clic para modificar.`}
                              >
                                <CheckCircle2 size={13} className="text-emerald-700" />
                                <span>IPC Asignado</span>
                              </button>
                            ) : null
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