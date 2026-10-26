import { useEffect, useState } from 'react';
import { Sliders, Percent, Save, Loader2, DollarSign, Calendar, History } from 'lucide-react';
import { supabase } from '../services/supabase';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

export default function Configuracion() {
  const { user } = useAuth();
  const { mostrarToast } = useToast();
  const [porcentajeMora, setPorcentajeMora] = useState('5.0');
  const [nuevoIndice, setNuevoIndice] = useState('');
  const [periodoIndice, setPeriodoIndice] = useState(new Date().toISOString().slice(0, 7)); // 'YYYY-MM'
  const [historialIndices, setHistorialIndices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [guardandoMora, setGuardandoMora] = useState(false);
  const [guardandoIndice, setGuardandoIndice] = useState(false);

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    setLoading(true);
    try {
      // 1. Cargar mora global
      const { data: configData } = await supabase
        .from('configuracion_sistema')
        .select('valor')
        .eq('clave', 'porcentaje_mora_default')
        .single();

      if (configData) setPorcentajeMora(configData.valor);

      // 2. Cargar historial de IPC
      const { data: indicesData, error: errIndices } = await supabase
        .from('indices_ipc')
        .select('*')
        .order('periodo', { ascending: false });

      if (errIndices) throw errIndices;
      setHistorialIndices(indicesData || []);

      if (indicesData && indicesData.length > 0) {
        setNuevoIndice(indicesData[0].valor_indice.toString());
      }
    } catch (err) {
      mostrarToast(`Error al cargar datos: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleGuardarMora = async (e) => {
    e.preventDefault();
    setGuardandoMora(true);
    try {
      const moraNum = parseFloat(porcentajeMora);
      const { error } = await supabase
        .from('configuracion_sistema')
        .upsert({
          clave: 'porcentaje_mora_default',
          valor: moraNum.toFixed(2),
          descripcion: 'Recargo de mora post día 10',
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      mostrarToast('Tasa de mora actualizada con éxito.');
    } catch (err) {
      mostrarToast(`Error al guardar mora: ${err.message}`, 'error');
    } finally {
      setGuardandoMora(false);
    }
  };

  const handleGuardarIndice = async (e) => {
    e.preventDefault();
    const valor = parseFloat(nuevoIndice);
    if (!valor || valor <= 0) {
      mostrarToast('Ingrese un valor monetario de índice válido.', 'error');
      return;
    }

    setGuardandoIndice(true);
    try {
      const { error } = await supabase
        .from('indices_ipc')
        .upsert({
          periodo: periodoIndice,
          valor_indice: valor,
          descripcion: `Valor fijado para el período ${periodoIndice}`,
          registrado_por: user?.id,
          fecha_vigencia: new Date().toISOString().split('T')[0]
        }, { onConflict: 'periodo' });

      if (error) throw error;
      mostrarToast(`Índice de ${periodoIndice} registrado en $${valor.toLocaleString('es-AR')}`);
      cargarDatos();
    } catch (err) {
      mostrarToast(`Error guardando índice: ${err.message}`, 'error');
    } finally {
      setGuardandoIndice(false);
    }
  };

  return (
    <div className="p-8 w-full mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Configuración y Parámetros</h1>
        <p className="text-xs text-[var(--color-text-secondary)]">
          Control de tasa de mora y fijación del valor del índice de actualización (IPC)
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Panel 1: Tasa de Mora */}
        <div className="card-ergonomica p-6 bg-white space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-[var(--color-border-warm)]">
            <Percent size={18} className="text-amber-600" />
            <h2 className="text-sm font-bold text-[var(--color-text-primary)]">Régimen de Mora</h2>
          </div>

          <form onSubmit={handleGuardarMora} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1">
                Recargo por Vencimiento (%)
              </label>
              <div className="relative flex items-center">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  required
                  value={porcentajeMora}
                  onChange={(e) => setPorcentajeMora(e.target.value)}
                  className="input-ergonomico pr-8 text-xs font-medium"
                />
                <Percent size={14} className="absolute right-3 text-slate-400 pointer-events-none" />
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Aplica pasadas las 23:59 del día 10 del mes.</p>
            </div>

            <button type="submit" disabled={guardandoMora} className="btn-primario text-xs">
              {guardandoMora ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Guardar Mora
            </button>
          </form>
        </div>

        {/* Panel 2: Fijación del Valor IPC */}
        <div className="card-ergonomica p-6 bg-white space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-[var(--color-border-warm)]">
            <DollarSign size={18} className="text-indigo-600" />
            <h2 className="text-sm font-bold text-[var(--color-text-primary)]">Cargar Valor IPC del Mes</h2>
          </div>

          <form onSubmit={handleGuardarIndice} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1">
                  Período (Mes)
                </label>
                <input
                  type="month"
                  required
                  value={periodoIndice}
                  onChange={(e) => setPeriodoIndice(e.target.value)}
                  className="input-ergonomico text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1">
                  Valor Índice ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="Ej: 45380"
                  value={nuevoIndice}
                  onChange={(e) => setNuevoIndice(e.target.value)}
                  className="input-ergonomico text-xs font-bold"
                />
              </div>
            </div>

            <p className="text-[11px] text-slate-500">
              Este valor se aplicará a las cuotas correspondientes a partir de la 13 que se liquiden para este período.
            </p>

            <button type="submit" disabled={guardandoIndice} className="btn-primario bg-indigo-600 hover:bg-indigo-700 text-xs">
              {guardandoIndice ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Publicar Valor IPC
            </button>
          </form>
        </div>

      </div>

      {/* Historial de Valores Publicados */}
      <div className="card-ergonomica p-6 bg-white space-y-3">
        <div className="flex items-center gap-2">
          <History size={16} className="text-slate-600" />
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Historial Registrado de Valores IPC</h3>
        </div>

        <div className="border border-[var(--color-border-warm)] rounded-lg overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] border-b border-[var(--color-border-warm)]">
              <tr>
                <th className="py-2.5 px-4 font-semibold">Período</th>
                <th className="py-2.5 px-4 font-semibold">Valor Registrado</th>
                <th className="py-2.5 px-4 font-semibold">Fecha de Publicación</th>
                <th className="py-2.5 px-4 font-semibold">Descripción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-warm)]">
              {historialIndices.length === 0 ? (
                <tr>
                  <td colSpan="4" className="py-4 text-center text-slate-400 italic">No hay índices registrados aún.</td>
                </tr>
              ) : (
                historialIndices.map((idx) => (
                  <tr key={idx.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-bold text-slate-900">{idx.periodo}</td>
                    <td className="py-2.5 px-4 font-bold text-indigo-700">
                      ${Number(idx.valor_indice).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600">{idx.fecha_vigencia || '-'}</td>
                    <td className="py-2.5 px-4 text-slate-500">{idx.descripcion || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}