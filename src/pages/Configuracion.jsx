import { useEffect, useState } from 'react';
import { Percent, Save, Loader2 } from 'lucide-react';
import { supabase } from '../services/supabase';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

export default function Configuracion() {
  const { user } = useAuth();
  const { mostrarToast } = useToast();
  const [porcentajeMora, setPorcentajeMora] = useState('5.0');
  const [loading, setLoading] = useState(true);
  const [guardandoMora, setGuardandoMora] = useState(false);

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    setLoading(true);
    try {
      // Cargar mora global
      const { data: configData, error } = await supabase
        .from('configuracion_sistema')
        .select('valor')
        .eq('clave', 'porcentaje_mora_default')
        .maybeSingle();

      if (error) throw error;
      if (configData) setPorcentajeMora(configData.valor);
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

  return (
    <div className="p-8 w-full mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Configuración y Parámetros</h1>
        <p className="text-xs text-[var(--color-text-secondary)]">
          Control de tasa de mora
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

      </div>

    </div>
  );
}