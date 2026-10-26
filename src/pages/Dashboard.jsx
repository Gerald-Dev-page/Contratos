import { useEffect, useState, useMemo } from 'react';
import { 
  FileText, 
  DollarSign, 
  TrendingUp, 
  AlertTriangle, 
  ShieldCheck, 
  History as HistoryIcon,
  Users
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
          .select('*, cuotas(*)')
          .order('created_at', { ascending: false }), // Contrato más nuevo primero
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

  const metricas = useMemo(() => {
    let totalCartera = 0;
    let totalCobrado = 0;
    let totalMoraCobrada = 0;
    let cuotasPendientes = 0;
    let cuotasVencidas = 0;
    let cuotasAlDia = 0;

    const hoy = new Date();
    const hoyStr = hoy.toISOString().split('T')[0];
    const diaActual = hoy.getDate();
    const periodoActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;

    contratos.forEach((c) => {
      totalCartera += Number(c.monto_total || 0);

      (c.cuotas || []).forEach((q) => {
        if (q.estado === 'pendiente') {
          cuotasPendientes++;
          
          const estaVencidaPorFecha = q.fecha_vencimiento && q.fecha_vencimiento < hoyStr;
          const estaVencidaPorPeriodo = q.periodo < periodoActual || (q.periodo === periodoActual && diaActual > 10);
          const enMora = (estaVencidaPorFecha || estaVencidaPorPeriodo) && !q.mora_saldada;

          if (enMora) {
            cuotasVencidas++;
          } else {
            cuotasAlDia++;
          }
        }
      });
    });

    pagos.forEach((p) => {
      totalCobrado += Number(p.monto_abonado || 0);
      totalMoraCobrada += Number(p.interes_mora_cobrado || 0);
    });

    return {
      totalCartera,
      totalCobrado,
      totalMoraCobrada,
      cuotasPendientes,
      cuotasVencidas,
      cuotasAlDia,
      porcentajeCobrado: totalCartera > 0 ? ((totalCobrado / totalCartera) * 100).toFixed(1) : 0,
      totalContratos: contratos.length,
      usuariosActivos: usuarios.filter(u => u.activo).length
    };
  }, [contratos, pagos, usuarios]);

  return (
    <div className="p-8 w-full space-y-6">
      
      {/* Encabezado Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
            Panel General {esAdmin && <span className="text-indigo-600 font-extrabold">• Modo Administrador</span>}
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Supervisión integral de recaudaciones, contratos, estado de mora y usuarios
          </p>
        </div>

        {esAdmin && (
          <button
            type="button"
            onClick={() => setModalUsuariosAbierto(true)}
            className="btn-primario text-sm py-2.5 px-5 flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 shadow-md cursor-pointer font-semibold"
          >
            <ShieldCheck size={18} /> Gestionar Usuarios y Accesos
          </button>
        )}
      </div>

      {/* Grilla de Tarjetas KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card-ergonomica p-5 bg-white border border-slate-200">
          <div className="flex justify-between items-start">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Contratos
            </span>
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
              <FileText size={18} />
            </div>
          </div>
          <h3 className="text-3xl font-bold text-slate-900 mt-2">{metricas.totalContratos}</h3>
          <span className="text-xs text-slate-500 mt-1 block">Expedientes activos en loteos</span>
        </div>

        <div className="card-ergonomica p-5 bg-white border border-emerald-200">
          <div className="flex justify-between items-start">
            <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">
              Recaudación Percibida
            </span>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
              <DollarSign size={18} />
            </div>
          </div>
          <h3 className="text-3xl font-bold text-emerald-900 mt-2">
            ${metricas.totalCobrado.toLocaleString('es-AR')}
          </h3>
          <span className="text-xs text-emerald-700 mt-1 block font-medium">
            Representa el {metricas.porcentajeCobrado}% del total
          </span>
        </div>

        <div className="card-ergonomica p-5 bg-white border border-amber-200">
          <div className="flex justify-between items-start">
            <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider">
              Cartera Total Lotes
            </span>
            <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
              <TrendingUp size={18} />
            </div>
          </div>
          <h3 className="text-3xl font-bold text-amber-900 mt-2">
            ${metricas.totalCartera.toLocaleString('es-AR')}
          </h3>
          <span className="text-xs text-amber-700 mt-1 block">
            Mora cobrada: ${metricas.totalMoraCobrada.toLocaleString('es-AR')}
          </span>
        </div>

        <div className="card-ergonomica p-5 bg-white border border-rose-200">
          <div className="flex justify-between items-start">
            <span className="text-xs font-semibold text-rose-700 uppercase tracking-wider">
              Cuotas Vencidas
            </span>
            <div className="p-2 rounded-lg bg-rose-50 text-rose-600">
              <AlertTriangle size={18} />
            </div>
          </div>
          <h3 className="text-3xl font-bold text-rose-900 mt-2">{metricas.cuotasVencidas}</h3>
          <span className="text-xs text-rose-700 mt-1 block font-medium">
            Cuotas impagas en mora
          </span>
        </div>
      </div>

      {/* Sección Admin: Operadores y Bitácora */}
      {esAdmin && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="card-ergonomica p-6 bg-white space-y-4 border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border-warm)]">
              <div className="flex items-center gap-2">
                <Users size={18} className="text-indigo-600" />
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Estado de Operadores
                </h3>
              </div>
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded">
                {metricas.usuariosActivos} activos / {usuarios.length} total
              </span>
            </div>

            <div className="space-y-3">
              {usuarios.slice(0, 4).map((u) => (
                <div key={u.id} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-semibold text-slate-900">{u.nombre_completo || u.email}</p>
                    <span className="text-xs uppercase font-medium text-slate-500">{u.rol}</span>
                  </div>
                  <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full ${
                    u.activo ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                  }`}>
                    {u.activo ? 'Activo' : 'Pausado'}
                  </span>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setModalUsuariosAbierto(true)}
              className="w-full mt-2 py-2.5 text-xs text-indigo-600 font-semibold bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors cursor-pointer"
            >
              Ver todos los usuarios
            </button>
          </div>

          <div className="card-ergonomica p-6 bg-white space-y-4 lg:col-span-2 border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border-warm)]">
              <div className="flex items-center gap-2">
                <HistoryIcon size={18} className="text-slate-600" />
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Últimos Movimientos de Auditoría
                </h3>
              </div>
              <span className="text-xs text-slate-500 font-medium">Tiempo real</span>
            </div>

            <div className="divide-y divide-slate-100">
              {ultimosMovimientos.length === 0 ? (
                <p className="text-sm text-slate-400 py-4 italic">Aún no hay movimientos registrados.</p>
              ) : (
                ultimosMovimientos.map((m) => (
                  <div key={m.id} className="py-3 flex items-center justify-between text-sm">
                    <div>
                      <span className="font-semibold text-slate-900">[{m.modulo}] {m.accion}:</span>{' '}
                      <span className="text-slate-600">{m.descripcion}</span>
                    </div>
                    <span className="text-xs text-slate-400 font-mono shrink-0 ml-3">
                      {new Date(m.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tabla de Contratos Recientes */}
      <div className="card-ergonomica bg-white overflow-hidden shadow-xs border border-slate-200 w-full space-y-4 p-6">
        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
          Últimos Contratos Registrados
        </h3>
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-5 font-semibold">Expediente</th>
                <th className="py-3.5 px-5 font-semibold">Titular</th>
                <th className="py-3.5 px-5 font-semibold">Catastro</th>
                <th className="py-3.5 px-5 font-semibold">Importe Contrato</th>
                <th className="py-3.5 px-5 font-semibold">Cuotas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {contratos.slice(0, 6).map((c) => {
                const fechaAlta = c.created_at || c.fecha_carga;
                const fechaFormateada = fechaAlta 
                  ? new Date(fechaAlta).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                  : '-';

                return (
                  <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-4 px-5 whitespace-nowrap">
                      <div className="font-semibold text-indigo-950">{c.numero_expediente}</div>
                      <span className="text-[11px] text-slate-400 font-mono block mt-0.5">
                        Alta: {fechaFormateada}
                      </span>
                    </td>
                    <td className="py-4 px-5 font-medium text-slate-800">{c.titular_nombre}</td>
                    <td className="py-4 px-5 text-slate-600 text-xs">
                      Mz: <span className="font-semibold text-slate-800">{c.manzana}</span> | Parc: <span className="font-semibold text-slate-800">{c.parcela}</span>
                    </td>
                    <td className="py-4 px-5 font-semibold text-slate-900">
                      ${Number(c.monto_total).toLocaleString('es-AR')}
                    </td>
                    <td className="py-4 px-5 text-slate-600 text-xs">
                      {c.cantidad_cuotas} cuotas
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <GestionUsuariosModal
        isOpen={modalUsuariosAbierto}
        onClose={() => setModalUsuariosAbierto(false)}
      />
    </div>
  );
}