import { useEffect, useState, useMemo } from 'react';
import { Search, ChevronLeft, ChevronRight, UserCheck, AlertTriangle, Filter } from 'lucide-react';
import { supabase } from '../services/supabase';
import TesoreriaAlertas from '../components/tesoreria/TesoreriaAlertas';
import ContratoCajaModal from '../components/tesoreria/ContratoCajaModal';

export default function Tesoreria() {
  const [contratos, setContratos] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [filtroSector, setFiltroSector] = useState('todos');
  const [filtroEstado, setFiltroEstado] = useState('todos'); // 'todos' | 'mora' | 'al_dia' | 'completado'
  const [loading, setLoading] = useState(true);
  const [contratoSeleccionado, setContratoSeleccionado] = useState(null);

  // Estado de Paginación
  const [paginaActual, setPaginaActual] = useState(1);
  const elementosPorPagina = 8;

  const cargarDatos = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('contratos')
        .select(`
          *,
          cuotas (
            id,
            contrato_id,
            numero_cuota,
            periodo,
            fecha_vencimiento,
            monto_base,
            recargo_mora_porcentaje,
            monto_recargo_mora,
            monto_ajuste_ipc,
            monto_total_exigible,
            mora_saldada,
            estado,
            pagos (
              id,
              monto_abonado,
              fecha_pago,
              interes_mora_cobrado,
              comprobante_url,
              es_saldo_mora,
              metodo_pago
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setContratos(data || []);

      if (contratoSeleccionado) {
        const actualizado = (data || []).find((c) => c.id === contratoSeleccionado.id);
        if (actualizado) setContratoSeleccionado(actualizado);
      }
    } catch (err) {
      console.error('Error cargando tesorería:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  // Lista dinámica de sectores disponibles
  const sectores = useMemo(() => {
    const set = new Set();
    contratos.forEach(c => {
      if (c.sector) set.add(c.sector.trim());
    });
    return Array.from(set).sort();
  }, [contratos]);

  const hoy = new Date();
  const diaActual = hoy.getDate();

  const contratosFiltrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim();

    return contratos.filter((c) => {
      // 1. Filtro de búsqueda textual
      const coincideTexto = 
        c.numero_expediente?.toLowerCase().includes(q) ||
        c.titular_nombre?.toLowerCase().includes(q) ||
        c.titular_dni?.includes(q) ||
        c.padron?.toLowerCase().includes(q) ||
        c.sector?.toLowerCase().includes(q);

      // 2. Filtro de Sector
      const coincideSector = 
        filtroSector === 'todos' || 
        (c.sector && c.sector.trim().toLowerCase() === filtroSector.toLowerCase());

      // 3. Filtro de Estado de cuotas
      const cuotas = c.cuotas || [];
      const proximaCuota = cuotas
        .filter((cu) => cu.estado === 'pendiente')
        .sort((a, b) => a.numero_cuota - b.numero_cuota)[0];

      const estaCompletado = cuotas.length > 0 && cuotas.every(cu => cu.estado === 'pagada');
      
      let estaEnMora = false;
      if (proximaCuota) {
        const fVenc = new Date(proximaCuota.fecha_vencimiento);
        estaEnMora = hoy > fVenc || (
          hoy.getMonth() === fVenc.getMonth() &&
          hoy.getFullYear() === fVenc.getFullYear() &&
          diaActual > 10
        );
      }

      let coincideEstado = true;
      if (filtroEstado === 'mora') coincideEstado = estaEnMora && !estaCompletado;
      if (filtroEstado === 'al_dia') coincideEstado = !estaEnMora && !estaCompletado;
      if (filtroEstado === 'completado') coincideEstado = estaCompletado;

      return coincideTexto && coincideSector && coincideEstado;
    });
  }, [contratos, busqueda, filtroSector, filtroEstado]);

  const totalPaginas = Math.ceil(contratosFiltrados.length / elementosPorPagina) || 1;
  const contratosPaginados = useMemo(() => {
    const inicio = (paginaActual - 1) * elementosPorPagina;
    return contratosFiltrados.slice(inicio, inicio + elementosPorPagina);
  }, [contratosFiltrados, paginaActual]);

  return (
    <div className="p-8 w-full space-y-6">
      {/* Cabecera */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Tesorería y Caja</h1>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Control de morosos, cobranzas por titular y seguimiento de vencimientos
        </p>
      </div>

      {/* Mostrador Superior de Alertas y Morosos */}
      <TesoreriaAlertas
        contratos={contratos}
        onSeleccionarContrato={(c) => setContratoSeleccionado(c)}
      />

      {/* Barra de Filtros y Búsqueda */}
      <div className="flex flex-col md:flex-row gap-3 items-center w-full">
        <div className="card-ergonomica p-3.5 flex items-center gap-3 bg-white border border-slate-200 flex-1 w-full">
          <Search size={18} className="text-slate-400 ml-1" />
          <input
            type="text"
            placeholder="Buscar por titular, DNI, expediente, padrón o sector..."
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value);
              setPaginaActual(1);
            }}
            className="w-full bg-transparent text-sm text-[var(--color-text-primary)] outline-none"
          />
        </div>

        {/* Filtro por Sector */}
        <div className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 w-full md:w-auto">
          <Filter size={14} className="text-slate-400" />
          <span>Sector:</span>
          <select
            value={filtroSector}
            onChange={(e) => {
              setFiltroSector(e.target.value);
              setPaginaActual(1);
            }}
            className="bg-transparent font-bold text-indigo-950 outline-none cursor-pointer"
          >
            <option value="todos">Todos</option>
            {sectores.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* Filtro por Estado */}
        <div className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 w-full md:w-auto">
          <span>Estado:</span>
          <select
            value={filtroEstado}
            onChange={(e) => {
              setFiltroEstado(e.target.value);
              setPaginaActual(1);
            }}
            className="bg-transparent font-bold text-indigo-950 outline-none cursor-pointer"
          >
            <option value="todos">Todos</option>
            <option value="mora">Con Mora</option>
            <option value="al_dia">Al Día</option>
            <option value="completado">Completados</option>
          </select>
        </div>
      </div>

      {/* Tabla Agrupada por Titular / Contrato */}
      <div className="card-ergonomica bg-white overflow-hidden shadow-xs border border-slate-200 w-full">
        {loading ? (
          <div className="py-12 text-center text-sm text-slate-500">Cargando contratos...</div>
        ) : contratosPaginados.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">No se encontraron expedientes con los filtros aplicados.</div>
        ) : (
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="py-3.5 px-5 font-semibold">Expediente y Sector</th>
                  <th className="py-3.5 px-5 font-semibold">Titular / DNI</th>
                  <th className="py-3.5 px-5 font-semibold">Próximo Vencimiento</th>
                  <th className="py-3.5 px-5 font-semibold">Monto Cuota / Total</th>
                  <th className="py-3.5 px-5 font-semibold">Progreso</th>
                  <th className="py-3.5 px-5 font-semibold text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {contratosPaginados.map((c) => {
                  const cuotas = c.cuotas || [];
                  const cuotasPagadas = cuotas.filter((q) => q.estado === 'pagada').length;
                  const proximaCuota = cuotas
                    .filter((q) => q.estado === 'pendiente')
                    .sort((a, b) => a.numero_cuota - b.numero_cuota)[0];

                  const fVenc = proximaCuota ? new Date(proximaCuota.fecha_vencimiento) : null;
                  const proximaEnMora = proximaCuota && (
                    hoy > fVenc || (
                      hoy.getMonth() === fVenc.getMonth() &&
                      hoy.getFullYear() === fVenc.getFullYear() &&
                      diaActual > 10
                    )
                  );

                  const fechaAlta = c.created_at || c.fecha_carga;
                  const fechaFormateada = fechaAlta 
                    ? new Date(fechaAlta).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                    : '-';

                  return (
                    <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                      {/* Expediente y Sector */}
                      <td className="py-4 px-5 whitespace-nowrap">
                        <div className="font-bold text-indigo-950">{c.numero_expediente}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.2 rounded">
                            {c.sector || 'General'}
                          </span>
                          <span className="text-[11px] text-slate-400 font-mono">
                            Mz: {c.manzana} | Parc: {c.parcela}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 block mt-0.5">
                          Alta: {fechaFormateada}
                        </span>
                      </td>

                      {/* Titular */}
                      <td className="py-4 px-5">
                        <div className="font-semibold text-slate-900">{c.titular_nombre}</div>
                        <div className="text-xs text-slate-500">
                          DNI: {c.titular_dni} {c.titular_telefono ? `• Tel: ${c.titular_telefono}` : ''}
                        </div>
                      </td>

                      {/* Próximo Vencimiento */}
                      <td className="py-4 px-5">
                        {proximaCuota ? (
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-slate-800">
                                Cuota #{proximaCuota.numero_cuota} ({proximaCuota.periodo})
                              </span>
                              {proximaCuota.numero_cuota === 1 && Number(c.monto_anticipo || 0) > 0 && (
                                <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                                  Anticipo / Entrega
                                </span>
                              )}
                            </div>
                            <span className="block text-xs text-slate-500 mt-0.5">
                              Vence: {proximaCuota.fecha_vencimiento}
                            </span>
                          </div>
                        ) : (
                          <span className="text-emerald-700 font-semibold text-xs">Plan completado</span>
                        )}
                      </td>

                      {/* Monto Cuota y Monto Total */}
                      <td className="py-4 px-5 whitespace-nowrap">
                        {proximaCuota ? (
                          <div className="font-semibold text-slate-900">
                            ${Number(proximaCuota.monto_base).toLocaleString('es-AR')}
                          </div>
                        ) : (
                          <span className="text-slate-400 font-semibold">-</span>
                        )}
                        <span className="text-[11px] text-slate-500 block mt-0.5">
                          Total Contrato: ${Number(c.monto_total || 0).toLocaleString('es-AR')}
                        </span>
                      </td>

                      {/* Progreso */}
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-slate-700">
                            {cuotasPagadas} / {cuotas.length}
                          </span>
                          {proximaEnMora && (
                            <span className="p-1 rounded-full bg-rose-100 text-rose-600" title="Cuota Vencida">
                              <AlertTriangle size={14} />
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Acción */}
                      <td className="py-4 px-5 text-center">
                        <button
                          onClick={() => setContratoSeleccionado(c)}
                          className="btn-primario py-2 px-4 text-xs font-semibold flex items-center justify-center gap-1.5 mx-auto bg-indigo-600 hover:bg-indigo-700 shadow-xs cursor-pointer"
                        >
                          <UserCheck size={14} /> Ver Caja
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Barra de Paginación */}
        {totalPaginas > 1 && (
          <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs font-medium text-slate-600">
            <span>
              Página <b>{paginaActual}</b> de <b>{totalPaginas}</b> ({contratosFiltrados.length} titulares)
            </span>
            <div className="flex gap-2">
              <button
                disabled={paginaActual === 1}
                onClick={() => setPaginaActual((p) => Math.max(p - 1, 1))}
                className="btn-icono py-1.5 px-3 border border-slate-300 bg-white rounded-md hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                disabled={paginaActual === totalPaginas}
                onClick={() => setPaginaActual((p) => Math.min(p + 1, totalPaginas))}
                className="btn-icono py-1.5 px-3 border border-slate-300 bg-white rounded-md hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Ficha Caja */}
      {contratoSeleccionado && (
        <ContratoCajaModal
          contrato={contratoSeleccionado}
          onClose={() => setContratoSeleccionado(null)}
          onActualizar={cargarDatos}
        />
      )}
    </div>
  );
}