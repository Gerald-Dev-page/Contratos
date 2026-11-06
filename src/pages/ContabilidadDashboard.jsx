// src/pages/ContabilidadDashboard.jsx
import { useState, useEffect, useMemo } from 'react';
import { 
  Building2, 
  DollarSign, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle2, 
  Calendar, 
  Filter, 
  PieChart, 
  Layers, 
  FileSpreadsheet, 
  ShieldAlert, 
  RefreshCw,
  Search,
  Download,
  Printer,
  ChevronRight,
  Eye,
  FileText
} from 'lucide-react';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import DetalleTitularModal from '../components/inmobiliaria/DetalleTitularModal';
import { exportarCSV, exportarExcel, imprimirPDF, formatearMoneda } from '../utils/exportUtils';

export default function ContabilidadDashboard() {
  const { user } = useAuth();
  const { mostrarToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [pestanaActiva, setPestanaActiva] = useState('dashboard'); // 'dashboard' | 'cartera' | 'reportes' | 'inconsistencias'
  
  // Datos Centrales
  const [cartera, setCartera] = useState([]);
  const [pagosGlobales, setPagosGlobales] = useState([]);
  const [cuotasGlobales, setCuotasGlobales] = useState([]);
  const [inconsistencias, setInconsistencias] = useState([]);
  
  // Estado para Modal de Ficha Contable
  const [contratoSeleccionado, setContratoSeleccionado] = useState(null);

  // Filtros Dashboard
  const [mesFiltro, setMesFiltro] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [sectorFiltro, setSectorFiltro] = useState('todos');

  // Filtros Cartera Avanzada
  const [busquedaCartera, setBusquedaCartera] = useState('');
  const [filtroEstadoCartera, setFiltroEstadoCartera] = useState('todos');
  const [filtroMoraCartera, setFiltroMoraCartera] = useState('todos');

  // Estado Generador de Reportes (R01-R09)
  const [tipoReporte, setTipoReporte] = useState('R01');
  const [repFechaDesde, setRepFechaDesde] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
  const [repFechaHasta, setRepFechaHasta] = useState(new Date().toISOString().split('T')[0]);
  const [repSector, setRepSector] = useState('todos');
  const [repEstado, setRepEstado] = useState('todos');
  const [repContratoId, setRepContratoId] = useState('');

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    setLoading(true);
    try {
      const [resCartera, resPagos, resCuotas, resInconsistencias] = await Promise.all([
        supabase.from('vw_control_cartera_contable').select('*'),
        supabase.from('pagos').select('*, cuotas(id, numero_cuota, periodo, contrato_id, fecha_vencimiento, contratos(numero_expediente, titular_nombre, sector))'),
        supabase.from('cuotas').select('*, contratos(numero_expediente, titular_nombre, sector)'),
        supabase.rpc('fn_auditar_inconsistencias_contables')
      ]);

      if (resCartera.error) throw resCartera.error;
      if (resPagos.error) throw resPagos.error;
      if (resCuotas.error) throw resCuotas.error;

      setCartera(resCartera.data || []);
      setPagosGlobales(resPagos.data || []);
      setCuotasGlobales(resCuotas.data || []);
      setInconsistencias(resInconsistencias.data || []);
    } catch (err) {
      console.error('Error cargando módulo contable:', err.message);
      mostrarToast(`Error al cargar datos contables: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const sectoresDisponibles = useMemo(() => {
    const set = new Set();
    cartera.forEach(c => { if (c.sector) set.add(c.sector.trim()); });
    return Array.from(set).sort();
  }, [cartera]);

  // ==========================================================================
  // ETAPA 1: CÁLCULOS MATEMÁTICOS DEL DASHBOARD (12 Indicadores precisos)
  // ==========================================================================
  const metricasDashboard = useMemo(() => {
    const carteraFiltrada = sectorFiltro === 'todos' 
      ? cartera 
      : cartera.filter(c => c.sector?.trim().toLowerCase() === sectorFiltro.toLowerCase());

    let carteraTotal = 0;
    let capitalCobrado = 0;
    let capitalPendiente = 0;
    let cuotasVencidasImpagas = 0;
    let deudaVencidaCapital = 0;
    let deudaVencidaMora = 0;
    let moraEfectivaCobrada = 0;
    let contratosCancelados = 0;
    let contratosConAtraso = 0;

    carteraFiltrada.forEach(c => {
      carteraTotal += Number(c.monto_total || 0);
      capitalCobrado += Number(c.capital_cobrado || 0);
      capitalPendiente += Number(c.capital_pendiente || 0);
      cuotasVencidasImpagas += Number(c.cuotas_vencidas_impagas || 0);
      deudaVencidaCapital += Number(c.deuda_vencida_capital || 0);
      deudaVencidaMora += Number(c.deuda_vencida_mora || 0);
      moraEfectivaCobrada += Number(c.mora_efectivamente_cobrada || 0);
      if (c.estado_cartera === 'CANCELADO') contratosCancelados++;
      if (c.estado_cartera === 'EN_MORA') contratosConAtraso++;
    });

    const porcentajeRecuperacion = carteraTotal > 0 ? (capitalCobrado / carteraTotal) * 100 : 0;

    // Métricas del Mes Seleccionado (Fórmula Corregida de Efectividad de Cobranza)
    const [anio, mes] = mesFiltro.split('-');
    const periodoMes = `${anio}-${mes}`;

    // Cuotas cuyo vencimiento cae en el mes
    const cuotasDelMes = cuotasGlobales.filter(q => {
      const matchPeriodo = q.periodo === periodoMes || (q.fecha_vencimiento && q.fecha_vencimiento.startsWith(periodoMes));
      const matchSector = sectorFiltro === 'todos' || q.contratos?.sector?.trim().toLowerCase() === sectorFiltro.toLowerCase();
      return matchPeriodo && matchSector;
    });

    const recaudacionEsperadaMes = cuotasDelMes.reduce((acc, q) => acc + Number(q.monto_base || 0) + Number(q.monto_ajuste_ipc || 0), 0);

    // Pagos efectivamente percibidos en el mes de análisis
    const pagosEnElMes = pagosGlobales.filter(p => {
      const fechaP = p.fecha_pago || (p.created_at ? p.created_at.slice(0, 10) : '');
      const matchMes = fechaP.startsWith(periodoMes);
      const matchSector = sectorFiltro === 'todos' || p.cuotas?.contratos?.sector?.trim().toLowerCase() === sectorFiltro.toLowerCase();
      return matchMes && matchSector;
    });

    const recaudacionTotalMes = pagosEnElMes.reduce((acc, p) => acc + Number(p.monto_abonado || 0), 0);

    // Efectividad estricta del período: pagos cobrados para cuotas que vencían en este período
    const idsCuotasMes = new Set(cuotasDelMes.map(q => q.id));
    const pagosImputadosACuotasDelMes = pagosGlobales.filter(p => idsCuotasMes.has(p.cuota_id));
    const capitalCobradoParaCuotasDelMes = pagosImputadosACuotasDelMes.reduce(
      (acc, p) => acc + (Number(p.monto_abonado || 0) - Number(p.interes_mora_cobrado || 0)), 
      0
    );

    const efectividadCobranzaPeriodo = recaudacionEsperadaMes > 0 
      ? (capitalCobradoParaCuotasDelMes / recaudacionEsperadaMes) * 100 
      : 0;

    return {
      carteraTotal,
      capitalCobrado,
      capitalPendiente,
      recaudacionTotalMes,
      cuotasVencidasImpagas,
      deudaVencidaTotal: deudaVencidaCapital + deudaVencidaMora,
      deudaVencidaCapital,
      deudaVencidaMora,
      moraEfectivaCobrada,
      contratosCancelados,
      contratosConAtraso,
      porcentajeRecuperacion,
      recaudacionEsperadaMes,
      efectividadCobranzaPeriodo
    };
  }, [cartera, cuotasGlobales, pagosGlobales, sectorFiltro, mesFiltro]);

  // ==========================================================================
  // ETAPA 2: FILTRO MULTIDIMENSIONAL DE CONTROL DE CARTERA
  // ==========================================================================
  const carteraAvanzadaFiltrada = useMemo(() => {
    const q = busquedaCartera.toLowerCase().trim();

    return cartera.filter(c => {
      const coincideTexto = 
        !q ||
        c.numero_expediente?.toLowerCase().includes(q) ||
        c.titular_nombre?.toLowerCase().includes(q) ||
        c.titular_dni?.includes(q) ||
        c.manzana?.toLowerCase().includes(q) ||
        c.parcela?.toLowerCase().includes(q) ||
        c.padron?.toLowerCase().includes(q);

      const coincideEstado = 
        filtroEstadoCartera === 'todos' || 
        c.estado_cartera === filtroEstadoCartera;

      const coincideMora = 
        filtroMoraCartera === 'todos' ||
        (filtroMoraCartera === 'con_mora' && Number(c.cuotas_vencidas_impagas) > 0) ||
        (filtroMoraCartera === 'al_dia' && Number(c.cuotas_vencidas_impagas) === 0);

      return coincideTexto && coincideEstado && coincideMora;
    });
  }, [cartera, busquedaCartera, filtroEstadoCartera, filtroMoraCartera]);

  // ==========================================================================
  // ETAPA 3: GENERADOR REAL DE REPORTES FINANCIEROS (R01 A R09)
  // ==========================================================================
  const datosReporteActivo = useMemo(() => {
    let columnas = [];
    let filas = [];
    let totales = {};
    let titulo = '';

    const filtroSect = (itemSector) => repSector === 'todos' || itemSector?.trim().toLowerCase() === repSector.toLowerCase();

    switch (tipoReporte) {
      case 'R01': // Estado General de Cartera
        titulo = 'R01 — Estado General de Cartera';
        columnas = [
          { header: 'Expediente', key: 'expediente' },
          { header: 'Titular', key: 'titular' },
          { header: 'Sector / Terreno', key: 'sector_lote' },
          { header: 'Monto Total', key: 'total', isNumber: true },
          { header: 'Capital Cobrado', key: 'cobrado', isNumber: true },
          { header: 'Capital Pendiente', key: 'pendiente', isNumber: true },
          { header: 'Deuda Vencida', key: 'vencida', isNumber: true },
          { header: '% Recup.', key: 'recupero' },
          { header: 'Estado', key: 'estado' },
        ];
        filas = cartera
          .filter(c => filtroSect(c.sector) && (repEstado === 'todos' || c.estado_cartera === repEstado))
          .map(c => ({
            expediente: c.numero_expediente,
            titular: `${c.titular_nombre} (DNI ${c.titular_dni})`,
            sector_lote: `${c.sector} - Mz ${c.manzana} Pc ${c.parcela}`,
            total: Number(c.monto_total || 0),
            cobrado: Number(c.capital_cobrado || 0),
            pendiente: Number(c.capital_pendiente || 0),
            vencida: Number(c.deuda_vencida_total || 0),
            recupero: `${c.porcentaje_recuperacion}%`,
            estado: c.estado_cartera
          }));
        totales = {
          'Total Cartera': filas.reduce((a, b) => a + b.total, 0),
          'Total Percibido': filas.reduce((a, b) => a + b.cobrado, 0),
          'Deuda Vencida': filas.reduce((a, b) => a + b.vencida, 0)
        };
        break;

      case 'R02': // Recaudación por Período
        titulo = 'R02 — Recaudación por Período';
        columnas = [
          { header: 'Fecha Pago', key: 'fecha' },
          { header: 'Expediente', key: 'expediente' },
          { header: 'Titular', key: 'titular' },
          { header: 'Cuota', key: 'cuota' },
          { header: 'Medio Pago', key: 'medio' },
          { header: 'Capital', key: 'capital', isNumber: true },
          { header: 'Mora Cobrada', key: 'mora', isNumber: true },
          { header: 'Total Percibido', key: 'total', isNumber: true },
        ];
        filas = pagosGlobales
          .filter(p => {
            const f = p.fecha_pago || (p.created_at ? p.created_at.slice(0, 10) : '');
            return f >= repFechaDesde && f <= repFechaHasta && filtroSect(p.cuotas?.contratos?.sector);
          })
          .map(p => {
            const tot = Number(p.monto_abonado || 0);
            const mora = Number(p.interes_mora_cobrado || 0);
            return {
              fecha: p.fecha_pago,
              expediente: p.cuotas?.contratos?.numero_expediente || '-',
              titular: p.cuotas?.contratos?.titular_nombre || '-',
              cuota: `#${p.cuotas?.numero_cuota || '-'}`,
              medio: p.metodo_pago || 'Transferencia',
              capital: tot - mora,
              mora: mora,
              total: tot
            };
          });
        totales = {
          'Total Cobrado': filas.reduce((a, b) => a + b.total, 0),
          'Total Capital': filas.reduce((a, b) => a + b.capital, 0),
          'Total Mora': filas.reduce((a, b) => a + b.mora, 0)
        };
        break;

      case 'R03': // Morosidad y Deuda Vencida
        titulo = 'R03 — Padrón de Morosidad y Deuda Vencida';
        columnas = [
          { header: 'Expediente', key: 'expediente' },
          { header: 'Titular / Teléfono', key: 'titular' },
          { header: 'Sector', key: 'sector' },
          { header: 'Cuotas Vencidas', key: 'cuotas_vencidas' },
          { header: 'Días Atraso Máx.', key: 'dias_atraso' },
          { header: 'Deuda Capital', key: 'deuda_capital', isNumber: true },
          { header: 'Deuda Mora (+5%)', key: 'deuda_mora', isNumber: true },
          { header: 'Deuda Total', key: 'deuda_total', isNumber: true },
          { header: 'Último Pago', key: 'ultimo_pago' }
        ];
        filas = cartera
          .filter(c => Number(c.cuotas_vencidas_impagas) > 0 && filtroSect(c.sector))
          .map(c => ({
            expediente: c.numero_expediente,
            titular: `${c.titular_nombre} (Tel: ${c.titular_telefono || 'S/D'})`,
            sector: c.sector,
            cuotas_vencidas: c.cuotas_vencidas_impagas,
            dias_atraso: `${c.dias_atraso_maximo} días`,
            deuda_capital: Number(c.deuda_vencida_capital || 0),
            deuda_mora: Number(c.deuda_vencida_mora || 0),
            deuda_total: Number(c.deuda_vencida_total || 0),
            ultimo_pago: c.fecha_ultimo_pago || 'Sin pagos'
          }));
        totales = {
          'Deuda Capital Vencida': filas.reduce((a, b) => a + b.deuda_capital, 0),
          'Mora Acumulada Exigible': filas.reduce((a, b) => a + b.deuda_mora, 0),
          'Total Vencido': filas.reduce((a, b) => a + b.deuda_total, 0)
        };
        break;

      case 'R04': // Próximos Vencimientos
        titulo = 'R04 — Agenda de Próximos Vencimientos';
        columnas = [
          { header: 'Vencimiento', key: 'vencimiento' },
          { header: 'Expediente', key: 'expediente' },
          { header: 'Titular', key: 'titular' },
          { header: 'Cuota', key: 'cuota' },
          { header: 'Sector', key: 'sector' },
          { header: 'Importe Exigible', key: 'monto', isNumber: true }
        ];
        filas = cuotasGlobales
          .filter(q => q.estado === 'pendiente' && q.fecha_vencimiento >= repFechaDesde && q.fecha_vencimiento <= repFechaHasta && filtroSect(q.contratos?.sector))
          .sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento))
          .map(q => ({
            vencimiento: q.fecha_vencimiento,
            expediente: q.contratos?.numero_expediente || '-',
            titular: q.contratos?.titular_nombre || '-',
            cuota: `#${q.numero_cuota} (${q.periodo})`,
            sector: q.contratos?.sector || 'General',
            monto: Number(q.monto_total_exigible || q.monto_base)
          }));
        totales = {
          'Total Esperado a Vencer': filas.reduce((a, b) => a + b.monto, 0)
        };
        break;

      case 'R05': // Estado de Cuenta Individual
        titulo = `R05 — Estado de Cuenta Individual (${repContratoId ? cartera.find(c => c.contrato_id === repContratoId)?.numero_expediente : 'Seleccione Contrato'})`;
        columnas = [
          { header: 'Cuota #', key: 'cuota' },
          { header: 'Período', key: 'periodo' },
          { header: 'Vencimiento', key: 'vencimiento' },
          { header: 'Base', key: 'base', isNumber: true },
          { header: 'IPC', key: 'ipc', isNumber: true },
          { header: 'Mora', key: 'mora', isNumber: true },
          { header: 'Total Exigible', key: 'total', isNumber: true },
          { header: 'Estado', key: 'estado' }
        ];
        filas = cuotasGlobales
          .filter(q => q.contrato_id === repContratoId)
          .sort((a, b) => a.numero_cuota - b.numero_cuota)
          .map(q => ({
            cuota: `#${q.numero_cuota}`,
            periodo: q.periodo,
            vencimiento: q.fecha_vencimiento,
            base: Number(q.monto_base || 0),
            ipc: Number(q.monto_ajuste_ipc || 0),
            mora: Number(q.monto_recargo_mora || 0),
            total: Number(q.monto_total_exigible || q.monto_base || 0),
            estado: q.estado.toUpperCase()
          }));
        totales = {
          'Total Plan': filas.reduce((a, b) => a + b.total, 0)
        };
        break;

      case 'R06': // Detalle y Control de Pagos Asentados
        titulo = 'R06 — Detalle y Auditoría de Pagos Registrados';
        columnas = [
          { header: 'ID Pago', key: 'id' },
          { header: 'Fecha', key: 'fecha' },
          { header: 'Expediente', key: 'expediente' },
          { header: 'Titular', key: 'titular' },
          { header: 'Medio', key: 'medio' },
          { header: 'Abonado', key: 'monto', isNumber: true },
          { header: 'Interés Mora', key: 'mora', isNumber: true }
        ];
        filas = pagosGlobales
          .filter(p => {
            const f = p.fecha_pago || (p.created_at ? p.created_at.slice(0, 10) : '');
            return f >= repFechaDesde && f <= repFechaHasta && filtroSect(p.cuotas?.contratos?.sector);
          })
          .map(p => ({
            id: p.id.slice(0, 8),
            fecha: p.fecha_pago,
            expediente: p.cuotas?.contratos?.numero_expediente || '-',
            titular: p.cuotas?.contratos?.titular_nombre || '-',
            medio: p.metodo_pago,
            monto: Number(p.monto_abonado || 0),
            mora: Number(p.interes_mora_cobrado || 0)
          }));
        totales = {
          'Total Asentado': filas.reduce((a, b) => a + b.monto, 0),
          'Total Mora Cobrada': filas.reduce((a, b) => a + b.mora, 0)
        };
        break;

      case 'R07': // Ajustes Aplicados por IPC
        titulo = 'R07 — Resumen de Ajustes por IPC';
        columnas = [
          { header: 'Expediente', key: 'expediente' },
          { header: 'Titular', key: 'titular' },
          { header: 'Cuota', key: 'cuota' },
          { header: 'Período', key: 'periodo' },
          { header: 'Monto Base', key: 'base', isNumber: true },
          { header: 'Ajuste IPC', key: 'ipc', isNumber: true },
          { header: 'Exigible Final', key: 'total', isNumber: true }
        ];
        filas = cuotasGlobales
          .filter(q => Number(q.monto_ajuste_ipc || 0) > 0 && filtroSect(q.contratos?.sector))
          .map(q => ({
            expediente: q.contratos?.numero_expediente || '-',
            titular: q.contratos?.titular_nombre || '-',
            cuota: `#${q.numero_cuota}`,
            periodo: q.periodo,
            base: Number(q.monto_base || 0),
            ipc: Number(q.monto_ajuste_ipc || 0),
            total: Number(q.monto_total_exigible || 0)
          }));
        totales = {
          'Total Ajustes IPC Imputados': filas.reduce((a, b) => a + b.ipc, 0)
        };
        break;

      case 'R08': // Resumen Mensual de Evolución de Cartera
        titulo = 'R08 — Resumen y Variación Mensual de Cartera';
        columnas = [
          { header: 'Sector', key: 'sector' },
          { header: 'Contratos', key: 'cant_contratos' },
          { header: 'Capital Total', key: 'total', isNumber: true },
          { header: 'Capital Cobrado', key: 'cobrado', isNumber: true },
          { header: 'Deuda Vencida', key: 'vencido', isNumber: true },
          { header: '% Recupero', key: 'recupero' }
        ];
        
        // Agrupación por sector
        const porSector = {};
        cartera.forEach(c => {
          const s = c.sector || 'General';
          if (!porSector[s]) porSector[s] = { sector: s, cant: 0, tot: 0, cob: 0, venc: 0 };
          porSector[s].cant++;
          porSector[s].tot += Number(c.monto_total || 0);
          porSector[s].cob += Number(c.capital_cobrado || 0);
          porSector[s].venc += Number(c.deuda_vencida_total || 0);
        });

        filas = Object.values(porSector).map(s => ({
          sector: s.sector,
          cant_contratos: s.cant,
          total: s.tot,
          cobrado: s.cob,
          vencido: s.venc,
          recupero: s.tot > 0 ? `${((s.cob / s.tot) * 100).toFixed(1)}%` : '0%'
        }));
        totales = {
          'Cartera Consolidada': filas.reduce((a, b) => a + b.total, 0),
          'Cobranza Consolidada': filas.reduce((a, b) => a + b.cobrado, 0)
        };
        break;

      case 'R09': // Gestión de Avisos de Mora
        titulo = 'R09 — Auditoría de Avisos y Notificaciones de Mora';
        columnas = [
          { header: 'Fecha Reporte', key: 'fecha' },
          { header: 'Expediente', key: 'expediente' },
          { header: 'Titular', key: 'titular' },
          { header: 'Cuota Observada', key: 'cuota' },
          { header: 'Mensaje Tesorería', key: 'mensaje' },
          { header: 'Estado Notificación', key: 'estado' }
        ];
        filas = cartera
          .filter(c => Number(c.cuotas_vencidas_impagas) > 0)
          .map(c => ({
            fecha: c.fecha_vencimiento_mas_antigua || '-',
            expediente: c.numero_expediente,
            titular: c.titular_nombre,
            cuota: `${c.cuotas_vencidas_impagas} cuotas impagas`,
            mensaje: `Mora acumulada: ${formatearMoneda(c.deuda_vencida_mora)}`,
            estado: 'EMITIDO_A_INMOBILIARIA'
          }));
        totales = {
          'Total Contratos en Mora': filas.length
        };
        break;

      default:
        break;
    }

    return { titulo, columnas, filas, totales };
  }, [tipoReporte, cartera, pagosGlobales, cuotasGlobales, repFechaDesde, repFechaHasta, repSector, repEstado, repContratoId]);

  // Manejadores de Exportación Real
  const handleExportar = (formato) => {
    const { titulo, columnas, filas, totales } = datosReporteActivo;
    if (filas.length === 0) {
      mostrarToast('No hay datos para exportar con los filtros seleccionados.', 'error');
      return;
    }

    const filtrosTexto = `Período: ${repFechaDesde} a ${repFechaHasta} | Sector: ${repSector} | Tipo: ${tipoReporte}`;

    if (formato === 'csv') {
      exportarCSV(columnas, filas, tipoReporte);
      mostrarToast(`Reporte ${tipoReporte} exportado a CSV.`);
    } else if (formato === 'excel') {
      exportarExcel(columnas, filas, titulo, tipoReporte);
      mostrarToast(`Reporte ${tipoReporte} exportado a Excel.`);
    } else if (formato === 'pdf') {
      imprimirPDF({
        titulo,
        columnas,
        filas,
        totales,
        filtrosAplicados: filtrosTexto,
        usuarioEmisor: user?.email || 'Control Contable'
      });
    }
  };

  return (
    <div className="p-8 w-full space-y-6">
      
      {/* 1. Cabecera y Filtros Globales de Corte */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-2.5 bg-indigo-900 text-white rounded-xl shadow-xs">
              <Building2 size={22} />
            </span>
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                Módulo de Control Contable
              </h1>
              <span className="text-xs font-semibold text-slate-500">
                Caja Social de San Luis • Auditoría y Fiscalización de Contratos
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-2xs">
            <Calendar size={14} className="text-slate-400" />
            <span className="text-slate-500">Período:</span>
            <input
              type="month"
              value={mesFiltro}
              onChange={(e) => setMesFiltro(e.target.value)}
              className="bg-transparent font-bold text-slate-900 outline-none cursor-pointer"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-2xs">
            <Filter size={14} className="text-slate-400" />
            <span className="text-slate-500">Sector:</span>
            <select
              value={sectorFiltro}
              onChange={(e) => setSectorFiltro(e.target.value)}
              className="bg-transparent font-bold text-indigo-950 outline-none cursor-pointer"
            >
              <option value="todos">Todos los Sectores</option>
              {sectoresDisponibles.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <button
            onClick={cargarDatos}
            className="p-2 text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-2xs cursor-pointer"
            title="Recargar datos de Supabase"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* 2. Pestañas de Navegación del Módulo */}
      <div className="flex items-center gap-2 border-b border-slate-200 text-xs font-bold">
        <button
          onClick={() => setPestanaActiva('dashboard')}
          className={`pb-3 px-3.5 border-b-2 flex items-center gap-2 cursor-pointer transition-colors ${
            pestanaActiva === 'dashboard'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <PieChart size={16} /> Dashboard Contable
        </button>
        <button
          onClick={() => setPestanaActiva('cartera')}
          className={`pb-3 px-3.5 border-b-2 flex items-center gap-2 cursor-pointer transition-colors ${
            pestanaActiva === 'cartera'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Layers size={16} /> Control de Cartera ({cartera.length})
        </button>
        <button
          onClick={() => setPestanaActiva('reportes')}
          className={`pb-3 px-3.5 border-b-2 flex items-center gap-2 cursor-pointer transition-colors ${
            pestanaActiva === 'reportes'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileSpreadsheet size={16} /> Centro de Reportes (R01–R09)
        </button>
        <button
          onClick={() => setPestanaActiva('inconsistencias')}
          className={`pb-3 px-3.5 border-b-2 flex items-center gap-2 cursor-pointer transition-colors ${
            pestanaActiva === 'inconsistencias'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ShieldAlert size={16} /> Inconsistencias Contables ({inconsistencias.length})
        </button>
      </div>

      {/* ==================================================================== */}
      {/* PESTAÑA 1: DASHBOARD CONTABLE (12 Indicadores Financieros)           */}
      {/* ==================================================================== */}
      {pestanaActiva === 'dashboard' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card-ergonomica p-4 bg-white border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">1. Cartera Total Vigente</span>
              <span className="text-xl font-extrabold text-slate-900 mt-1 block">{formatearMoneda(metricasDashboard.carteraTotal)}</span>
              <span className="text-[10px] text-slate-400 mt-0.5 block">{cartera.length} contratos activos</span>
            </div>

            <div className="card-ergonomica p-4 bg-white border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">2. Capital Cobrado</span>
              <span className="text-xl font-extrabold text-emerald-800 mt-1 block">{formatearMoneda(metricasDashboard.capitalCobrado)}</span>
              <span className="text-[10px] text-emerald-700 font-semibold mt-0.5 block">Neto de intereses de mora</span>
            </div>

            <div className="card-ergonomica p-4 bg-white border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">3. Capital Pendiente</span>
              <span className="text-xl font-extrabold text-indigo-950 mt-1 block">{formatearMoneda(metricasDashboard.capitalPendiente)}</span>
              <span className="text-[10px] text-slate-400 mt-0.5 block">Saldo a devengar</span>
            </div>

            <div className="card-ergonomica p-4 bg-white border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">10. % Recuperación Cartera</span>
              <span className="text-xl font-extrabold text-indigo-700 mt-1 block">{metricasDashboard.porcentajeRecuperacion.toFixed(2)}%</span>
              <span className="text-[10px] text-slate-400 mt-0.5 block">Capital Cobrado / Cartera</span>
            </div>

            <div className="card-ergonomica p-4 bg-rose-50/50 border border-rose-200 shadow-2xs">
              <span className="text-[11px] font-bold text-rose-800 uppercase tracking-wider block">6. Deuda Vencida Total</span>
              <span className="text-xl font-extrabold text-rose-950 mt-1 block">{formatearMoneda(metricasDashboard.deudaVencidaTotal)}</span>
              <span className="text-[10px] text-rose-700 mt-0.5 block">Cap: {formatearMoneda(metricasDashboard.deudaVencidaCapital)} | Mora: {formatearMoneda(metricasDashboard.deudaVencidaMora)}</span>
            </div>

            <div className="card-ergonomica p-4 bg-white border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">5. Cuotas Vencidas Impagas</span>
              <span className="text-xl font-extrabold text-rose-800 mt-1 block">{metricasDashboard.cuotasVencidasImpagas} cuotas</span>
              <span className="text-[10px] text-slate-400 mt-0.5 block">Obligaciones impagas vencidas</span>
            </div>

            <div className="card-ergonomica p-4 bg-white border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">9. Contratos con Atraso</span>
              <span className="text-xl font-extrabold text-amber-900 mt-1 block">{metricasDashboard.contratosConAtraso}</span>
              <span className="text-[10px] text-amber-800 mt-0.5 block">Titulares con al menos 1 cuota vencida</span>
            </div>

            <div className="card-ergonomica p-4 bg-white border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">7. Mora Efectivamente Cobrada</span>
              <span className="text-xl font-extrabold text-slate-900 mt-1 block">{formatearMoneda(metricasDashboard.moraEfectivaCobrada)}</span>
              <span className="text-[10px] text-slate-400 mt-0.5 block">Recargos ingresados a Tesorería</span>
            </div>

            <div className="card-ergonomica p-4 bg-white border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">4. Recaudación del Mes ({mesFiltro})</span>
              <span className="text-xl font-extrabold text-emerald-800 mt-1 block">{formatearMoneda(metricasDashboard.recaudacionTotalMes)}</span>
              <span className="text-[10px] text-slate-400 mt-0.5 block">Cobros reales registrados</span>
            </div>

            <div className="card-ergonomica p-4 bg-white border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">11. Recaudación Esperada ({mesFiltro})</span>
              <span className="text-xl font-extrabold text-slate-900 mt-1 block">{formatearMoneda(metricasDashboard.recaudacionEsperadaMes)}</span>
              <span className="text-[10px] text-slate-400 mt-0.5 block">Vencimientos exigibles del período</span>
            </div>

            <div className="card-ergonomica p-4 bg-white border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">12. Efectividad de Cobranza</span>
              <span className="text-xl font-extrabold text-indigo-700 mt-1 block">{metricasDashboard.efectividadCobranzaPeriodo.toFixed(1)}%</span>
              <span className="text-[10px] text-slate-400 mt-0.5 block">Cobrado período / Exigible período</span>
            </div>

            <div className="card-ergonomica p-4 bg-white border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">8. Contratos Cancelados</span>
              <span className="text-xl font-extrabold text-slate-900 mt-1 block">{metricasDashboard.contratosCancelados}</span>
              <span className="text-[10px] text-emerald-700 font-semibold mt-0.5 block">100% de cuotas pagadas</span>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* PESTAÑA 2: CONTROL DE CARTERA AVANZADO                              */}
      {/* ==================================================================== */}
      {pestanaActiva === 'cartera' && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row gap-3 items-center">
            <div className="card-ergonomica p-3 flex items-center gap-3 bg-white border border-slate-200 flex-1 w-full shadow-2xs">
              <Search size={18} className="text-slate-400 ml-1" />
              <input
                type="text"
                placeholder="Buscar por Expediente, Titular, DNI, Manzana, Parcela o Padrón..."
                value={busquedaCartera}
                onChange={(e) => setBusquedaCartera(e.target.value)}
                className="w-full bg-transparent text-xs text-slate-800 outline-none font-medium"
              />
            </div>

            <div className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-700">
              <span>Estado:</span>
              <select
                value={filtroEstadoCartera}
                onChange={(e) => setFiltroEstadoCartera(e.target.value)}
                className="bg-transparent font-bold text-indigo-950 outline-none cursor-pointer"
              >
                <option value="todos">Todos los Estados</option>
                <option value="AL_DIA">Al Día</option>
                <option value="EN_MORA">En Mora</option>
                <option value="CANCELADO">Cancelados</option>
              </select>
            </div>
          </div>

          <div className="card-ergonomica bg-white border border-slate-200 overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
                  <tr>
                    <th className="py-3 px-4">Expediente y Terreno</th>
                    <th className="py-3 px-4">Titular y DNI</th>
                    <th className="py-3 px-4">Monto Contrato</th>
                    <th className="py-3 px-4">Capital Cobrado</th>
                    <th className="py-3 px-4">Capital Pendiente</th>
                    <th className="py-3 px-4">Deuda Vencida</th>
                    <th className="py-3 px-4">Cuotas (Pag / Tot)</th>
                    <th className="py-3 px-4">Recupero</th>
                    <th className="py-3 px-4 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {carteraAvanzadaFiltrada.map((c) => (
                    <tr key={c.contrato_id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="font-bold text-indigo-950 block">{c.numero_expediente}</span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {c.sector} • Mz {c.manzana} Pc {c.parcela}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-slate-900 block">{c.titular_nombre}</span>
                        <span className="text-slate-400 text-[10px]">DNI: {c.titular_dni}</span>
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900 whitespace-nowrap">
                        {formatearMoneda(c.monto_total)}
                      </td>
                      <td className="py-3 px-4 font-semibold text-emerald-800 whitespace-nowrap">
                        {formatearMoneda(c.capital_cobrado)}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-700 whitespace-nowrap">
                        {formatearMoneda(c.capital_pendiente)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {Number(c.deuda_vencida_total) > 0 ? (
                          <span className="font-bold text-rose-700">
                            {formatearMoneda(c.deuda_vencida_total)}
                          </span>
                        ) : (
                          <span className="text-emerald-700 font-semibold">$0</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-slate-700">{c.cuotas_pagadas} / {c.total_cuotas}</span>
                        {Number(c.cuotas_vencidas_impagas) > 0 && (
                          <span className="ml-1.5 text-[9px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1 py-0.2 rounded">
                            {c.cuotas_vencidas_impagas} venc.
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-bold text-indigo-900">
                        {c.porcentaje_recuperacion}%
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => setContratoSeleccionado(c)}
                          className="btn-icono py-1 px-2.5 text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg flex items-center gap-1 mx-auto cursor-pointer"
                        >
                          <Eye size={12} /> Ver Ficha
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* PESTAÑA 3: CENTRO DE REPORTES REAL (R01 A R09)                       */}
      {/* ==================================================================== */}
      {pestanaActiva === 'reportes' && (
        <div className="space-y-6">
          {/* Panel de Configuración de Reporte */}
          <div className="card-ergonomica p-5 bg-white border border-slate-200 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Configuración del Reporte Contable</h3>
                <p className="text-xs text-slate-500">Seleccione el reporte analítico y configure los parámetros de corte</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleExportar('pdf')}
                  className="btn-primario py-2 px-3.5 text-xs font-semibold flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg shadow-2xs cursor-pointer"
                >
                  <Printer size={14} /> Imprimir / PDF
                </button>
                <button
                  onClick={() => handleExportar('excel')}
                  className="btn-primario py-2 px-3.5 text-xs font-semibold flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg shadow-2xs cursor-pointer"
                >
                  <Download size={14} /> Excel
                </button>
                <button
                  onClick={() => handleExportar('csv')}
                  className="btn-icono py-2 px-3 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                >
                  CSV
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tipo de Reporte *</label>
                <select
                  value={tipoReporte}
                  onChange={(e) => setTipoReporte(e.target.value)}
                  className="input-ergonomico w-full text-xs font-bold text-indigo-950"
                >
                  <option value="R01">R01 — Estado General de Cartera</option>
                  <option value="R02">R02 — Recaudación por Período</option>
                  <option value="R03">R03 — Morosidad y Deuda Vencida</option>
                  <option value="R04">R04 — Próximos Vencimientos</option>
                  <option value="R05">R05 — Estado de Cuenta Individual</option>
                  <option value="R06">R06 — Control y Detalle de Pagos</option>
                  <option value="R07">R07 — Ajustes Aplicados por IPC</option>
                  <option value="R08">R08 — Resumen y Evolución de Cartera</option>
                  <option value="R09">R09 — Gestión de Avisos de Mora</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Fecha Desde</label>
                <input
                  type="date"
                  value={repFechaDesde}
                  onChange={(e) => setRepFechaDesde(e.target.value)}
                  className="input-ergonomico w-full text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Fecha Hasta</label>
                <input
                  type="date"
                  value={repFechaHasta}
                  onChange={(e) => setRepFechaHasta(e.target.value)}
                  className="input-ergonomico w-full text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Sector</label>
                <select
                  value={repSector}
                  onChange={(e) => setRepSector(e.target.value)}
                  className="input-ergonomico w-full text-xs"
                >
                  <option value="todos">Todos los Sectores</option>
                  {sectoresDisponibles.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {tipoReporte === 'R05' && (
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-indigo-950 mb-1">Contrato a Liquidar *</label>
                  <select
                    value={repContratoId}
                    onChange={(e) => setRepContratoId(e.target.value)}
                    className="input-ergonomico w-full text-xs font-semibold"
                  >
                    <option value="">Seleccione un contrato...</option>
                    {cartera.map((c) => (
                      <option key={c.contrato_id} value={c.contrato_id}>
                        {c.numero_expediente} — {c.titular_nombre}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Grilla de Previsualización en Pantalla */}
          <div className="card-ergonomica bg-white border border-slate-200 overflow-hidden shadow-2xs">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                {datosReporteActivo.titulo} ({datosReporteActivo.filas.length} registros)
              </span>
              <div className="flex gap-4 text-xs font-bold text-slate-700">
                {Object.entries(datosReporteActivo.totales).map(([lbl, val]) => (
                  <span key={lbl}>{lbl}: <b className="text-indigo-950">{typeof val === 'number' ? formatearMoneda(val) : val}</b></span>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 border-b border-slate-200">
                  <tr>
                    {datosReporteActivo.columnas.map((c) => (
                      <th key={c.key} className={`py-2.5 px-3.5 ${c.isNumber ? 'text-right' : 'text-left'}`}>
                        {c.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {datosReporteActivo.filas.map((f, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      {datosReporteActivo.columnas.map((c) => (
                        <td key={c.key} className={`py-2 px-3.5 ${c.isNumber ? 'text-right font-mono font-semibold' : ''}`}>
                          {c.isNumber && typeof f[c.key] === 'number' ? formatearMoneda(f[c.key]) : (f[c.key] ?? '-')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* PESTAÑA 4: AUDITORÍA DE INCONSISTENCIAS CONTABLES                    */}
      {/* ==================================================================== */}
      {pestanaActiva === 'inconsistencias' && (
        <div className="space-y-4">
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert size={18} className="text-amber-700 shrink-0" />
              <span>
                Se detectaron <b>{inconsistencias.length} inconsistencias contables</b> automáticas que requieren revisión u observación.
              </span>
            </div>
            <button
              onClick={cargarDatos}
              className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-md font-semibold cursor-pointer text-xs"
            >
              Reejecutar Auditoría
            </button>
          </div>

          <div className="card-ergonomica bg-white border border-slate-200 overflow-hidden shadow-2xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
                <tr>
                  <th className="py-3 px-4">Expediente y Titular</th>
                  <th className="py-3 px-4">Tipo Inconsistencia</th>
                  <th className="py-3 px-4">Descripción del Hallazgo</th>
                  <th className="py-3 px-4">Severidad</th>
                  <th className="py-3 px-4 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {inconsistencias.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="py-8 text-center text-slate-400">
                      No se detectaron inconsistencias en la base de datos de cuotas y pagos.
                    </td>
                  </tr>
                ) : (
                  inconsistencias.map((inc, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="font-bold text-slate-900 block">{inc.numero_expediente}</span>
                        <span className="text-[10px] text-slate-400">{inc.titular_nombre}</span>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-indigo-950">
                        {inc.tipo_inconsistencia}
                      </td>
                      <td className="py-3 px-4 text-slate-700 max-w-md">
                        {inc.descripcion}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          inc.gravedad === 'ALTA' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {inc.gravedad}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => {
                            const c = cartera.find(k => k.contrato_id === inc.contrato_id);
                            if (c) setContratoSeleccionado(c);
                          }}
                          className="btn-icono py-1 px-2.5 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer mx-auto"
                        >
                          Ver Contrato
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Ficha Integral / Estado de Cuenta Individual */}
      {contratoSeleccionado && (
        <DetalleTitularModal
          contrato={{
            id: contratoSeleccionado.contrato_id,
            numero_expediente: contratoSeleccionado.numero_expediente,
            titular_nombre: contratoSeleccionado.titular_nombre,
            titular_dni: contratoSeleccionado.titular_dni,
            titular_telefono: contratoSeleccionado.titular_telefono,
            sector: contratoSeleccionado.sector,
            manzana: contratoSeleccionado.manzana,
            parcela: contratoSeleccionado.parcela,
            padron: contratoSeleccionado.padron,
            monto_total: contratoSeleccionado.monto_total,
            cantidad_cuotas: contratoSeleccionado.total_cuotas,
            aplica_mora: contratoSeleccionado.aplica_mora
          }}
          onClose={() => setContratoSeleccionado(null)}
          onActualizado={cargarDatos}
        />
      )}

    </div>
  );
}