import { useEffect, useState, useMemo } from 'react';
import { 
  History as HistoryIcon, 
  Search, 
  Filter, 
  ChevronLeft, 
  ChevronRight,
  ShieldAlert
} from 'lucide-react';
import { supabase } from '../services/supabase';

const FILAS_POR_PAGINA = 10;

export default function HistorialMovimientos() {
  const [movimientos, setMovimientos] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [filtroModulo, setFiltroModulo] = useState('TODOS');
  const [paginaActual, setPaginaActual] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cargarHistorial();
  }, []);

  const cargarHistorial = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('historial_movimientos')
        .select('*, perfiles:usuario_id(nombre_completo, email, rol)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMovimientos(data || []);
    } catch (err) {
      console.error('Error al cargar auditoría:', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Filtrado combinado
  const filtrados = useMemo(() => {
    return movimientos.filter((m) => {
      const coincideModulo = filtroModulo === 'TODOS' || m.modulo === filtroModulo;
      
      const texto = busqueda.toLowerCase();
      const coincideTexto = 
        m.modulo?.toLowerCase().includes(texto) ||
        m.accion?.toLowerCase().includes(texto) ||
        m.descripcion?.toLowerCase().includes(texto) ||
        m.perfiles?.nombre_completo?.toLowerCase().includes(texto) ||
        m.perfiles?.email?.toLowerCase().includes(texto);

      return coincideModulo && coincideTexto;
    });
  }, [movimientos, busqueda, filtroModulo]);

  // Paginación matemática
  const totalPaginas = Math.ceil(filtrados.length / FILAS_POR_PAGINA) || 1;
  const inicio = (paginaActual - 1) * FILAS_POR_PAGINA;
  const movimientosPaginados = filtrados.slice(inicio, inicio + FILAS_POR_PAGINA);

  // Reiniciar a página 1 si cambia el filtro
  const handleCambioFiltro = (nuevoModulo) => {
    setFiltroModulo(nuevoModulo);
    setPaginaActual(1);
  };

  const handleCambioBusqueda = (e) => {
    setBusqueda(e.target.value);
    setPaginaActual(1);
  };

  return (
    <div className="p-8 w-full space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
          Registro de Auditoría y Movimientos
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Control de trazabilidad y cronología de operaciones (Acceso exclusivo Administrador)
        </p>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="card-ergonomica p-4 bg-white border border-slate-200 flex flex-col md:flex-row gap-4 justify-between items-center w-full">
        
        {/* Buscador */}
        <div className="flex items-center gap-3 w-full md:w-2/3">
          <Search size={18} className="text-slate-400 ml-1" />
          <input
            type="text"
            placeholder="Buscar por operador, acción, expediente o nota..."
            value={busqueda}
            onChange={handleCambioBusqueda}
            className="w-full bg-transparent text-sm text-[var(--color-text-primary)] outline-none"
          />
        </div>

        {/* Filtro por Módulo */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <Filter size={16} className="text-slate-500" />
          <span className="text-xs font-bold text-slate-600 uppercase">Módulo:</span>
          <select
            value={filtroModulo}
            onChange={(e) => handleCambioFiltro(e.target.value)}
            className="input-ergonomico text-xs font-semibold py-1.5 px-3"
          >
            <option value="TODOS">Todos los Módulos</option>
            <option value="TESORERIA">Tesorería</option>
            <option value="INMOBILIARIA">Inmobiliaria</option>
            <option value="SISTEMA">Sistema / Admin</option>
          </select>
        </div>
      </div>

      {/* Tabla Paginada */}
      <div className="card-ergonomica bg-white overflow-hidden border border-slate-200 w-full shadow-xs">
        {loading ? (
          <div className="py-12 text-center text-sm text-slate-500">Cargando bitácora de auditoría...</div>
        ) : filtrados.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">No se encontraron movimientos registrados con esos filtros.</div>
        ) : (
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="py-3.5 px-5 font-bold">Fecha y Hora</th>
                  <th className="py-3.5 px-5 font-bold">Módulo</th>
                  <th className="py-3.5 px-5 font-bold">Acción</th>
                  <th className="py-3.5 px-5 font-bold">Operador</th>
                  <th className="py-3.5 px-5 font-bold">Descripción del Evento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {movimientosPaginados.map((m) => {
                  const fecha = new Date(m.created_at).toLocaleString('es-AR', {
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit', second: '2-digit'
                  });

                  return (
                    <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3.5 px-5 font-mono text-xs text-slate-600 whitespace-nowrap">
                        {fecha}
                      </td>
                      <td className="py-3.5 px-5 font-bold text-slate-800 text-xs">
                        {m.modulo}
                      </td>
                      <td className="py-3.5 px-5">
                        <span className="inline-block px-2.5 py-1 rounded text-xs font-bold bg-indigo-100 text-indigo-800">
                          {m.accion}
                        </span>
                      </td>
                      <td className="py-3.5 px-5">
                        <div className="font-semibold text-slate-900 text-xs">
                          {m.perfiles?.nombre_completo || m.perfiles?.email || 'Sistema'}
                        </div>
                        <span className="text-[10px] uppercase font-bold text-slate-500">
                          {m.perfiles?.rol || '-'}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 text-slate-700 text-xs font-medium">
                        {m.descripcion}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Barra de Paginación */}
        {filtrados.length > 0 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
            <span>
              Mostrando <b>{inicio + 1}</b> a <b>{Math.min(inicio + FILAS_POR_PAGINA, filtrados.length)}</b> de <b>{filtrados.length}</b> eventos
            </span>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPaginaActual((prev) => Math.max(prev - 1, 1))}
                disabled={paginaActual === 1}
                className="btn-icono py-1 px-2.5 flex items-center gap-1 border border-slate-300 bg-white rounded-md hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={16} /> Anterior
              </button>

              <span className="px-2 font-bold text-slate-800">
                Pág. {paginaActual} de {totalPaginas}
              </span>

              <button
                onClick={() => setPaginaActual((prev) => Math.min(prev + 1, totalPaginas))}
                disabled={paginaActual === totalPaginas}
                className="btn-icono py-1 px-2.5 flex items-center gap-1 border border-slate-300 bg-white rounded-md hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Siguiente <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}