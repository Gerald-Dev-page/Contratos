import { useEffect, useState } from 'react';
import { FileText, ExternalLink, X, Loader2 } from 'lucide-react';
import { obtenerUrlVisualizacion } from '../../services/storage';

export default function PdfViewerModal({ isOpen, onClose, bucket = 'contratos-pdf', filePath, titulo = 'Documento PDF' }) {
  const [url, setUrl] = useState(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (isOpen && filePath) {
      setCargando(true);
      obtenerUrlVisualizacion(bucket, filePath)
        .then((signedUrl) => setUrl(signedUrl))
        .finally(() => setCargando(false));
    } else {
      setUrl(null);
    }
  }, [isOpen, filePath, bucket]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
      <div className="card-ergonomica w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden shadow-2xl border-slate-700">
        
        {/* Cabecera */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-[var(--color-border-warm)] bg-[var(--color-bg-surface)]">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-[var(--color-brand-primary)]" />
            <h3 className="font-semibold text-sm text-[var(--color-text-primary)]">{titulo}</h3>
          </div>

          <div className="flex items-center gap-2">
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                download
                className="btn-icono text-xs flex items-center gap-1.5"
                title="Abrir en pestaña nueva / Descargar"
              >
                <ExternalLink size={14} /> Descargar
              </a>
            )}
            <button
              onClick={onClose}
              className="btn-icono hover:bg-rose-100 hover:text-rose-600 transition-colors"
              title="Cerrar visor"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Contenido / Iframe */}
        <div className="flex-1 bg-slate-200 relative">
          {cargando ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-slate-600">
              <Loader2 size={24} className="animate-spin text-[var(--color-brand-primary)]" />
              <span>Cargando documento...</span>
            </div>
          ) : url ? (
            <iframe
              src={`${url}#toolbar=1&navpanes=0`}
              title={titulo}
              className="w-full h-full border-none"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-secondary)]">
              No se pudo cargar el archivo o no se encuentra disponible.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}