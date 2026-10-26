import { useState } from 'react';
import { Eye, FileX } from 'lucide-react';
import PdfViewerModal from './PdfViewerModal';

export default function BotonVerPdf({ filePath, bucket = 'contratos-pdf', titulo }) {
  const [modalAbierto, setModalAbierto] = useState(false);

  if (!filePath) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-[var(--color-text-muted)] italic">
        <FileX size={14} /> Sin adjunto
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setModalAbierto(true)}
        className="btn-icono"
        title="Visualizar documento"
      >
        <Eye size={16} />
      </button>

      <PdfViewerModal
        isOpen={modalAbierto}
        onClose={() => setModalAbierto(false)}
        bucket={bucket}
        filePath={filePath}
        titulo={titulo}
      />
    </>
  );
}