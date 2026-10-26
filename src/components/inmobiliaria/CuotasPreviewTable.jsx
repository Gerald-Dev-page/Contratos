export default function CuotasPreviewTable({ cuotas }) {
  if (!cuotas || cuotas.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
          Plan Proyectado ({cuotas.length} Cuotas)
        </h4>
        {cuotas.length > 12 && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--color-status-warn-bg)] text-[var(--color-status-warn)] font-medium">
            Indexación IPC activa a partir de Cuota 13
          </span>
        )}
      </div>

      <div className="max-h-52 overflow-y-auto border border-[var(--color-border-warm)] rounded-lg">
        <table className="w-full text-left text-xs">
          <thead className="bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] sticky top-0">
            <tr>
              <th className="py-2 px-3">#</th>
              <th className="py-2 px-3">Período</th>
              <th className="py-2 px-3">Vencimiento</th>
              <th className="py-2 px-3">Base</th>
              <th className="py-2 px-3">Condición</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border-warm)]">
            {cuotas.map((c) => (
              <tr key={c.numero_cuota} className="hover:bg-[var(--color-bg-egg)]">
                <td className="py-2 px-3 font-medium">{c.numero_cuota}</td>
                <td className="py-2 px-3 text-[var(--color-text-secondary)]">{c.periodo}</td>
                <td className="py-2 px-3">{c.fecha_vencimiento}</td>
                <td className="py-2 px-3 font-semibold">${c.monto_base.toLocaleString('es-AR')}</td>
                <td className="py-2 px-3">
                  {c.aplica_ipc ? (
                    <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                      Sujeta a IPC
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-500">Cuota Fija</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}