import { useEffect, useState, useMemo } from 'react';
import { 
  FileText, 
  DollarSign, 
  TrendingUp, 
  AlertTriangle, 
  ShieldCheck, 
  History as HistoryIcon,
  Users,
  Filter,
  Printer,
  CheckCircle2,
  Clock,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown
} from 'lucide-react';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import GestionUsuariosModal from '../components/admin/GestionUsuariosModal';

export default function Dashboard() {
  const { rol, perfil } = useAuth();
  const [contratos, setContratos] = useState([]);
  const [pagos, setPagos] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [ultimosMovimientos, setUltimosMovimientos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalUsuariosAbierto, setModalUsuariosAbierto] = useState(false);

  // Filtros Analíticos
  const [filtroSector, setFiltroSector] = useState('TODOS');
  const [filtroEstado, setFiltroEstado] = useState('TODOS');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  // Orden y Paginación de la Tabla Maestra
  const [ordenCronologico, setOrdenCronologico] = useState('recientes'); // 'recientes' | 'antiguos'
  const [paginaActual, setPaginaActual] = useState(1);
  const [elementosPorPagina, setElementosPorPagina] = useState(8);

  const esAdmin = rol === 'admin' || perfil?.rol === 'admin';

  useEffect(() => {
    cargarDatos();
  }, [esAdmin]);

  const cargarDatos = async () => {
    setLoading(true);
    try {
      const peticiones = [
        supabase
          .from('contratos')
          .select(`
            *,
            cuotas (
              id,
              numero_cuota,
              periodo,
              fecha_vencimiento,
              monto_base,
              monto_ajuste_ipc,
              monto_recargo_mora,
              monto_total_exigible,
              estado,
              mora_saldada,
              pagos (
                id,
                fecha_pago,
                monto_abonado,
                interes_mora_cobrado,
                es_saldo_mora
              )
            )
          `)
          .order('created_at', { ascending: false }),
        supabase.from('pagos').select('*')
      ];

      if (esAdmin) {
        peticiones.push(supabase.from('perfiles').select('*'));
        peticiones.push(
          supabase
            .from('historial_movimientos')
            .select('*, perfiles:usuario_id(nombre_completo, rol, email)')
            .order('created_at', { ascending: false })
            .limit(5)
        );
      }

      const resultados = await Promise.all(peticiones);

      setContratos(resultados[0].data || []);
      setPagos(resultados[1].data || []);

      if (esAdmin) {
        setUsuarios(resultados[2].data || []);
        setUltimosMovimientos(resultados[3].data || []);
      }
    } catch (err) {
      console.error('Error cargando métricas del dashboard:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const sectoresDisponibles = useMemo(() => {
    const setSec = new Set(contratos.map(c => c.sector || 'General').filter(Boolean));
    return Array.from(setSec);
  }, [contratos]);

  const contratosProcesados = useMemo(() => {
    const hoyStr = new Date().toISOString().split('T')[0];

    return contratos.map((c) => {
      const cuotas = c.cuotas || [];
      const totalCuotas = cuotas.length;
      const cuotasPagadas = cuotas.filter(q => q.estado === 'pagada');
      const esCancelado = totalCuotas > 0 && cuotasPagadas.length === totalCuotas;

      let fechaCancelacion = null;
      if (esCancelado) {
        const fechasPagos = [];
        cuotas.forEach(q => {
          (q.pagos || []).forEach(p => {
            if (p.fecha_pago) fechasPagos.push(p.fecha_pago);
          });
        });
        if (fechasPagos.length > 0) {
          fechasPagos.sort();
          fechaCancelacion = fechasPagos[fechasPagos.length - 1];
        }
      }

      let tieneMoraActiva = false;
      let montoMoraPendienteContrato = 0;
      let percibidoContrato = 0;
      let pendienteCapitalContrato = 0;

      cuotas.forEach(q => {
        if (q.estado === 'pendiente') {
          pendienteCapitalContrato += Number(q.monto_base || 0);

          const enMora = q.fecha_vencimiento && q.fecha_vencimiento < hoyStr && !q.mora_saldada;
          if (enMora) {
            tieneMoraActiva = true;
            const recargo = Number(q.monto_recargo_mora || 0);
            montoMoraPendienteContrato += recargo > 0 ? recargo : (Number(q.monto_base || 0) * 0.05);
          }
        }

        (q.pagos || []).forEach(p => {
          percibidoContrato += Number(p.monto_abonado || 0);
        });
      });

      return {
        ...c,
        esCancelado,
        fechaCancelacion,
        tieneMoraActiva,
        montoMoraPendienteContrato,
        percibidoContrato,
        pendienteCapitalContrato,
        cuotasPagadasCount: cuotasPagadas.length,
        totalCuotasCount: totalCuotas
      };
    });
  }, [contratos]);

  // Filtrado y Ordenamiento
  const contratosFiltrados = useMemo(() => {
    const filtrados = contratosProcesados.filter((c) => {
      if (filtroSector !== 'TODOS' && (c.sector || 'General') !== filtroSector) return false;

      const fAlta = (c.created_at || c.fecha_carga || '').split('T')[0];
      if (fechaDesde && fAlta < fechaDesde) return false;
      if (fechaHasta && fAlta > fechaHasta) return false;

      if (filtroEstado === 'CANCELADOS') return c.esCancelado;
      if (filtroEstado === 'EN_MORA') return c.tieneMoraActiva;
      if (filtroEstado === 'AL_DIA') return !c.esCancelado && !c.tieneMoraActiva;

      return true;
    });

    return filtrados.sort((a, b) => {
      const fechaA = new Date(a.created_at || a.fecha_carga || 0).getTime();
      const fechaB = new Date(b.created_at || b.fecha_carga || 0).getTime();
      return ordenCronologico === 'recientes' ? fechaB - fechaA : fechaA - fechaB;
    });
  }, [contratosProcesados, filtroSector, filtroEstado, fechaDesde, fechaHasta, ordenCronologico]);

  // Cálculo de Paginación
  const totalPaginas = Math.ceil(contratosFiltrados.length / elementosPorPagina) || 1;
  const contratosPaginados = useMemo(() => {
    const inicio = (paginaActual - 1) * elementosPorPagina;
    return contratosFiltrados.slice(inicio, inicio + elementosPorPagina);
  }, [contratosFiltrados, paginaActual, elementosPorPagina]);

  // Métricas Globales (calculadas sobre el conjunto filtrado)
  const metricas = useMemo(() => {
    let carteraTotal = 0;
    let totalPercibido = 0;
    let moraCobradaHistorica = 0;
    let moraPendienteCobro = 0;
    let estimadoRecaudarCapital = 0;
    let cantidadCuotasVencidas = 0;
    let planesCancelados = 0;

    const hoyStr = new Date().toISOString().split('T')[0];

    contratosFiltrados.forEach((c) => {
      carteraTotal += Number(c.monto_total || 0);
      estimadoRecaudarCapital += c.pendienteCapitalContrato;
      moraPendienteCobro += c.montoMoraPendienteContrato;

      if (c.esCancelado) planesCancelados++;

      (c.cuotas || []).forEach((q) => {
        if (q.estado === 'pendiente' && q.fecha_vencimiento && q.fecha_vencimiento < hoyStr && !q.mora_saldada) {
          cantidadCuotasVencidas++;
        }

        (q.pagos || []).forEach((p) => {
          totalPercibido += Number(p.monto_abonado || 0);
          moraCobradaHistorica += Number(p.interes_mora_cobrado || 0);
        });
      });
    });

    const porcentajeCobro = carteraTotal > 0 ? ((totalPercibido / carteraTotal) * 100).toFixed(1) : 0;

    return {
      carteraTotal,
      totalPercibido,
      moraCobradaHistorica,
      moraPendienteCobro,
      estimadoRecaudarCapital,
      cantidadCuotasVencidas,
      planesCancelados,
      totalContratos: contratosFiltrados.length,
      porcentajeCobro,
      usuariosActivos: usuarios.filter(u => u.activo).length
    };
  }, [contratosFiltrados, usuarios]);

  const hayFiltrosActivos = filtroSector !== 'TODOS' || filtroEstado !== 'TODOS' || fechaDesde || fechaHasta;

  const limpiarFiltros = () => {
    setFiltroSector('TODOS');
    setFiltroEstado('TODOS');
    setFechaDesde('');
    setFechaHasta('');
    setPaginaActual(1);
  };

  return (
    <div className="p-8 w-full space-y-6">
      
      {/* 1. Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
            Panel General {esAdmin && <span className="text-indigo-600 font-extrabold">• Modo Administrador</span>}
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Control de cartera de loteos, recaudación real, mora consolidada y balance financiero
          </p>
        </div>

        {esAdmin && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => window.print()}
              className="btn-icono text-xs py-2 px-3.5 flex items-center gap-1.5 border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer font-semibold shadow-xs"
              title="Exportar balance actual a PDF o imprimir"
            >
              <Printer size={15} /> Imprimir Balance
            </button>

            <button
              type="button"
              onClick={() => setModalUsuariosAbierto(true)}
              className="btn-primario text-xs py-2 px-4 flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 shadow-sm cursor-pointer font-semibold"
            >
              <ShieldCheck size={16} /> Usuarios ({metricas.usuariosActivos})
            </button>
          </div>
        )}
      </div>

      {/* 2. Barra de Filtros (Admin) */}
      {esAdmin && (
        <div className="card-ergonomica p-4 bg-white border border-slate-200 space-y-3 print:hidden shadow-xs">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
              <Filter size={14} className="text-indigo-600" />
              <span>Criterios de Segmentación y Reporte</span>
            </div>
            {hayFiltrosActivos && (
              <button
                type="button"
                onClick={limpiarFiltros}
                className="text-xs text-rose-600 hover:text-rose-800 font-semibold flex items-center gap-1 cursor-pointer transition-colors"
              >
                <RotateCcw size={12} /> Restablecer
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="block font-semibold text-slate-600 mb-1">Sector / Etapa</label>
              <select
                value={filtroSector}
                onChange={(e) => {
                  setFiltroSector(e.target.value);
                  setPaginaActual(1);
                }}
                className="input-ergonomico w-full font-medium py-1.5 px-3"
              >
                <option value="TODOS">Todos los Sectores</option>
                {sectoresDisponibles.map((sec) => (
                  <option key={sec} value={sec}>{sec}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-600 mb-1">Estado de Contratos</label>
              <select
                value={filtroEstado}
                onChange={(e) => {
                  setFiltroEstado(e.target.value);
                  setPaginaActual(1);
                }}
                className="input-ergonomico w-full font-medium py-1.5 px-3"
              >
                <option value="TODOS">Todos los Contratos</option>
                <option value="CANCELADOS">Planes Cancelados (100% Pagados)</option>
                <option value="EN_MORA">Con Mora Pendiente</option>
                <option value="AL_DIA">Al Día (En Curso)</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-600 mb-1">Fecha Alta Desde</label>
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => {
                  setFechaDesde(e.target.value);
                  setPaginaActual(1);
                }}
                className="input-ergonomico w-full py-1.5 px-3"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-600 mb-1">Fecha Alta Hasta</label>
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => {
                  setFechaHasta(e.target.value);
                  setPaginaActual(1);
                }}
                className="input-ergonomico w-full py-1.5 px-3"
              />
            </div>
          </div>
        </div>
      )}

      {/* 3. Tarjetas Principales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card-ergonomica p-5 bg-white border border-emerald-200">
          <div className="flex justify-between items-start">
            <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">Total Recaudado</span>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
              <DollarSign size={18} />
            </div>
          </div>
          <h3 className="text-3xl font-bold text-emerald-950 mt-2">
            ${metricas.totalPercibido.toLocaleString('es-AR')}
          </h3>
          <span className="text-xs text-emerald-700 mt-1 block font-medium">
            Representa el {metricas.porcentajeCobro}% de la cartera
          </span>
        </div>

        <div className="card-ergonomica p-5 bg-white border border-indigo-200">
          <div className="flex justify-between items-start">
            <span className="text-xs font-semibold text-indigo-800 uppercase tracking-wider">Estimado a Recaudar</span>
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
              <TrendingUp size={18} />
            </div>
          </div>
          <h3 className="text-3xl font-bold text-indigo-950 mt-2">
            ${metricas.estimadoRecaudarCapital.toLocaleString('es-AR')}
          </h3>
          <span className="text-xs text-indigo-700 mt-1 block">
            Capital pendiente de amortización
          </span>
        </div>

        <div className="card-ergonomica p-5 bg-white border border-slate-200">
          <div className="flex justify-between items-start">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Contratos en Cartera</span>
            <div className="p-2 rounded-lg bg-slate-50 text-slate-600">
              <FileText size={18} />
            </div>
          </div>
          <h3 className="text-3xl font-bold text-slate-900 mt-2">{metricas.totalContratos}</h3>
          <span className="text-xs text-slate-500 mt-1 block font-medium">
            Cartera total: ${metricas.carteraTotal.toLocaleString('es-AR')}
          </span>
        </div>

        <div className="card-ergonomica p-5 bg-white border border-teal-200 bg-teal-50/20">
          <div className="flex justify-between items-start">
            <span className="text-xs font-semibold text-teal-900 uppercase tracking-wider">Planes Cancelados</span>
            <div className="p-2 rounded-lg bg-teal-100 text-teal-800">
              <CheckCircle2 size={18} />
            </div>
          </div>
          <h3 className="text-3xl font-bold text-teal-950 mt-2">{metricas.planesCancelados}</h3>
          <span className="text-xs text-teal-700 mt-1 block font-medium">100% de cuotas abonadas</span>
        </div>
      </div>

      {/* 4. Mora Consolidada */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-5 rounded-xl border border-rose-200 bg-rose-50/70 flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-rose-800 uppercase tracking-wider block">
              Mora Pendiente de Cobro (Total Adeudado)
            </span>
            <p className="text-2xl font-bold text-rose-950 mt-1">
              ${metricas.moraPendienteCobro.toLocaleString('es-AR')}
            </p>
            <span className="text-xs text-rose-700 mt-0.5 block font-medium">
              Correspondiente a {metricas.cantidadCuotasVencidas} cuotas vencidas exigibles
            </span>
          </div>
          <div className="p-3 bg-rose-100 text-rose-700 rounded-xl">
            <AlertTriangle size={24} />
          </div>
        </div>

        <div className="p-5 rounded-xl border border-amber-200 bg-amber-50/70 flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-amber-900 uppercase tracking-wider block">
              Mora Percibida Histórica (Total Cobrado)
            </span>
            <p className="text-2xl font-bold text-amber-950 mt-1">
              ${metricas.moraCobradaHistorica.toLocaleString('es-AR')}
            </p>
            <span className="text-xs text-amber-800 mt-0.5 block font-medium">
              Recargos del 5% efectivamente ingresados a caja
            </span>
          </div>
          <div className="p-3 bg-amber-100 text-amber-800 rounded-xl">
            <DollarSign size={24} />
          </div>
        </div>
      </div>

      {/* 5. Operadores y Auditoría */}
      {esAdmin && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 print:hidden">
          <div className="card-ergonomica p-5 bg-white space-y-3 border border-slate-200">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-indigo-600" />
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Operadores del Sistema</h3>
              </div>
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                {metricas.usuariosActivos} activos
              </span>
            </div>

            <div className="space-y-2.5">
              {usuarios.slice(0, 4).map((u) => (
                <div key={u.id} className="flex items-center justify-between text-xs">
                  <div>
                    <p className="font-semibold text-slate-900">{u.nombre_completo || u.email}</p>
                    <span className="uppercase text-[10px] text-slate-500 font-medium">{u.rol}</span>
                  </div>
                  <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${
                    u.activo ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                  }`}>
                    {u.activo ? 'Activo' : 'Pausado'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="card-ergonomica p-5 bg-white space-y-3 lg:col-span-2 border border-slate-200">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <HistoryIcon size={16} className="text-slate-600" />
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Últimos Movimientos de Auditoría</h3>
              </div>
              <span className="text-xs text-slate-400 font-mono">Trazabilidad</span>
            </div>

            <div className="divide-y divide-slate-100 text-xs">
              {ultimosMovimientos.length === 0 ? (
                <p className="text-slate-400 py-3 italic">Sin movimientos recientes.</p>
              ) : (
                ultimosMovimientos.map((m) => (
                  <div key={m.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="truncate">
                      <span className="font-semibold text-slate-900">[{m.modulo}] {m.accion}:</span>{' '}
                      <span className="text-slate-600">{m.descripcion}</span>
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono shrink-0">
                      {new Date(m.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 6. Tabla Maestra de Contratos con Ordenamiento y Paginación */}
      <div className="card-ergonomica bg-white overflow-hidden shadow-xs border border-slate-200 w-full space-y-4 p-6">
        
        {/* Cabecera de la Tabla: Título + Controles de Orden y Tamaño */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Control de Cartera y Estado de Planes ({contratosFiltrados.length})
            </h3>
            <span className="text-xs text-slate-400 mt-0.5 block">
              {filtroSector !== 'TODOS' ? `Sector: ${filtroSector} • ` : ''}
              {filtroEstado !== 'TODOS' ? `Filtrado por: ${filtroEstado}` : 'Listado general de contratos'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 print:hidden">
            {/* Selector de Orden */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
              <ArrowUpDown size={13} className="text-slate-500" />
              <select
                value={ordenCronologico}
                onChange={(e) => {
                  setOrdenCronologico(e.target.value);
                  setPaginaActual(1);
                }}
                className="bg-transparent text-xs font-semibold text-slate-700 outline-none cursor-pointer"
              >
                <option value="recientes">Más recientes primero</option>
                <option value="antiguos">Más antiguos primero</option>
              </select>
            </div>

            {/* Selector de Tamaño de Página */}
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <span>Mostrar:</span>
              <select
                value={elementosPorPagina}
                onChange={(e) => {
                  setElementosPorPagina(Number(e.target.value));
                  setPaginaActual(1);
                }}
                className="border border-slate-200 bg-slate-50 rounded-md px-2 py-1 text-xs font-semibold text-slate-700 outline-none cursor-pointer"
              >
                <option value={5}>5</option>
                <option value={8}>8</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
              </select>
            </div>
          </div>
        </div>

        {/* Tabla */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-5 font-semibold">Expediente y Alta</th>
                <th className="py-3.5 px-5 font-semibold">Titular y DNI</th>
                <th className="py-3.5 px-5 font-semibold">Sector y Terreno</th>
                <th className="py-3.5 px-5 font-semibold">Monto Contrato</th>
                <th className="py-3.5 px-5 font-semibold">Total Percibido</th>
                <th className="py-3.5 px-5 font-semibold text-center">Estado del Plan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-slate-400 text-xs">
                    Cargando contratos y balances...
                  </td>
                </tr>
              ) : contratosPaginados.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-slate-400 text-xs">
                    No se encontraron contratos con los filtros especificados.
                  </td>
                </tr>
              ) : (
                contratosPaginados.map((c) => {
                  const fechaAlta = (c.created_at || c.fecha_carga || '').split('T')[0];
                  const fechaAltaFmt = fechaAlta 
                    ? new Date(fechaAlta).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) 
                    : '-';

                  return (
                    <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-4 px-5 whitespace-nowrap">
                        <div className="font-semibold text-indigo-950">{c.numero_expediente}</div>
                        <span className="text-[11px] text-slate-400 font-mono block mt-0.5">
                          Alta: {fechaAltaFmt}
                        </span>
                      </td>

                      <td className="py-4 px-5">
                        <div className="font-medium text-slate-900">{c.titular_nombre}</div>
                        <span className="text-xs text-slate-500">DNI: {c.titular_dni}</span>
                      </td>

                      <td className="py-4 px-5 text-slate-600 text-xs">
                        <span className="font-semibold text-indigo-900 block">{c.sector || 'General'}</span>
                        <span className="text-slate-400">Mz: {c.manzana} | Parc: {c.parcela}</span>
                      </td>

                      <td className="py-4 px-5 font-semibold text-slate-900 whitespace-nowrap">
                        ${Number(c.monto_total).toLocaleString('es-AR')}
                        <span className="block text-xs font-normal text-slate-400">{c.totalCuotasCount} cuotas</span>
                      </td>

                      <td className="py-4 px-5 whitespace-nowrap">
                        <span className="font-semibold text-emerald-800">
                          ${c.percibidoContrato.toLocaleString('es-AR')}
                        </span>
                        {c.montoMoraPendienteContrato > 0 && (
                          <span className="block text-[11px] font-semibold text-rose-700">
                            Mora: +${c.montoMoraPendienteContrato.toLocaleString('es-AR')}
                          </span>
                        )}
                      </td>

                      <td className="py-4 px-5 text-center whitespace-nowrap">
                        {c.esCancelado ? (
                          <div>
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-semibold">
                              <CheckCircle2 size={13} /> Cancelado (100%)
                            </span>
                            {c.fechaCancelacion && (
                              <span className="block text-[10px] text-slate-500 mt-0.5 font-medium">
                                Cancelado: {new Date(c.fechaCancelacion).toLocaleDateString('es-AR')}
                              </span>
                            )}
                          </div>
                        ) : c.tieneMoraActiva ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-100 text-rose-800 rounded-full text-xs font-semibold">
                            <AlertTriangle size={13} /> Con Mora Pendiente
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium">
                            <Clock size={13} /> Al Día ({c.cuotasPagadasCount}/{c.totalCuotasCount})
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Barra de Paginación */}
        {totalPaginas > 1 && (
          <div className="p-3 border-t border-slate-200 bg-slate-50 rounded-b-xl flex items-center justify-between text-xs font-medium text-slate-600 print:hidden">
            <span>
              Página <b>{paginaActual}</b> de <b>{totalPaginas}</b> ({contratosFiltrados.length} contratos en total)
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={paginaActual === 1}
                onClick={() => setPaginaActual((p) => Math.max(p - 1, 1))}
                className="btn-icono py-1.5 px-3 border border-slate-300 bg-white rounded-md hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
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

      <GestionUsuariosModal
        isOpen={modalUsuariosAbierto}
        onClose={() => setModalUsuariosAbierto(false)}
      />
    </div>
  );
}