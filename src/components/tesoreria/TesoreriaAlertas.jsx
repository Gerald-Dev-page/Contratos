import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Users, FileText } from 'lucide-react';

export default function TesoreriaAlertas({ contratos = [], onSeleccionarContrato }) {
  const hoy = new Date();
  const diaActual = hoy.getDate();

  const titularesEnMora = useMemo(() => {
    return contratos.filter((c) => {
      const cuotas = c.cuotas || [];
      return cuotas.some((q) => {
        if (q.estado !== 'pendiente' || q.mora_saldada) return false;
        const fVenc = new Date(q.fecha_vencimiento);
        return hoy > fVenc || (
          hoy.getMonth() === fVenc.getMonth() &&
          hoy.getFullYear() === fVenc.getFullYear() &&
          diaActual > 10
        );
      });
    });
  }, [contratos, hoy, diaActual]);

  const contratosActivos = contratos.filter((c) => c.estado === 'activo').length || contratos.length;

  return (
    <div className="space-y-4">
      {/* 3 Tarjetas Superiores */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Titulares en Mora (Rojo) */}
        <div className="card-ergonomica p-5 bg-white border border-rose-200">
          <div className="flex justify-between items-start">
            <span className="text-xs font-semibold text-rose-700 uppercase tracking-wider">
              Titulares en Mora
            </span>
            <div className="p-2 bg-rose-50 text-rose-600 rounded-lg">
              <AlertTriangle size={18} />
            </div>
          </div>
          <p className="text-3xl font-bold text-rose-600 mt-2">
            {titularesEnMora.length}
          </p>
          <span className="text-xs text-slate-500 mt-1 block">
            {titularesEnMora.length === 0 ? 'Sin atrasos registrados' : 'Requieren seguimiento'}
          </span>
        </div>

        {/* Contratos Activos */}
        <div className="card-ergonomica p-5 bg-white border border-slate-200">
          <div className="flex justify-between items-start">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Contratos Activos
            </span>
            <div className="p-2 bg-slate-50 text-slate-600 rounded-lg">
              <FileText size={18} />
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-800 mt-2">
            {contratosActivos}
          </p>
          <span className="text-xs text-slate-500 mt-1 block">
            En cartera general
          </span>
        </div>

        {/* Estado de Caja (Verde) */}
        <div className="card-ergonomica p-5 bg-emerald-50/60 border border-emerald-200">
          <div className="flex justify-between items-start">
            <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">
              Estado de Caja
            </span>
            <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
              <CheckCircle2 size={18} />
            </div>
          </div>
          <p className="text-base font-bold text-emerald-700 mt-2 flex items-center gap-2">
            Cobranzas habilitadas
          </p>
          <span className="text-xs text-emerald-600 mt-1 block">
            Recepción de pagos activa
          </span>
        </div>
      </div>

      {/* Atención Requerida: Formato compacto de solo Nombre y Exp, pero con tipografía text-sm legible */}
      {titularesEnMora.length > 0 && (
        <div className="rounded-xl border border-rose-300 bg-rose-50/70 p-4 space-y-2">
          <div className="flex items-center gap-2 text-rose-800 font-semibold text-sm">
            <AlertTriangle size={16} className="text-rose-600" />
            <span>Atención Requerida: Titulares con cuotas vencidas</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {titularesEnMora.map((t) => (
              <div
                key={t.id}
                onClick={() => onSeleccionarContrato(t)}
                className="bg-white p-3 rounded-lg border border-rose-200 hover:border-rose-400 transition-all cursor-pointer shadow-2xs group"
              >
                <p className="font-semibold text-slate-900 text-sm group-hover:text-rose-700 transition-colors">
                  {t.titular_nombre}
                </p>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  Exp: {t.numero_expediente}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}