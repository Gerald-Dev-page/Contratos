import imageCompression from 'browser-image-compression';
import { PDFDocument } from 'pdf-lib';

/**
 * Normaliza y limpia el nombre del archivo para que Supabase / S3 lo acepte siempre.
 * Remueve tildes (ó -> o), eñes (ñ -> n), espacios y caracteres especiales.
 */
export function sanitizarNombreArchivo(nombreOriginal) {
  if (!nombreOriginal) return `doc_${Date.now()}.pdf`;

  const ultimoPunto = nombreOriginal.lastIndexOf('.');
  const nombreBase = ultimoPunto !== -1 ? nombreOriginal.substring(0, ultimoPunto) : nombreOriginal;
  const extension = ultimoPunto !== -1 ? nombreOriginal.substring(ultimoPunto).toLowerCase() : '.pdf';

  const sinTildes = nombreBase
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Elimina acentos: á -> a, ó -> o
    .replace(/ñ/gi, 'n');            // ñ / Ñ -> n

  const limpio = sinTildes
    .replace(/[^a-zA-Z0-9_-]/g, '_') // Todo caracter no alfanumérico pasa a guion bajo
    .replace(/_+/g, '_');            // Evita guiones bajos repetidos

  return `${limpio}${extension}`;
}

/**
 * Comprime imágenes de comprobantes convirtiendo a WebP optimizado.
 */
export async function comprimirImagen(file) {
  if (!file || !file.type.startsWith('image/')) return file;

  const opciones = {
    maxSizeMB: 0.4,
    maxWidthOrHeight: 1600,
    useWebWorker: true,
    fileType: 'image/webp'
  };

  try {
    const archivoComprimido = await imageCompression(file, opciones);
    const nombreLimpio = sanitizarNombreArchivo(file.name.replace(/\.[^/.]+$/, "") + ".webp");
    return new File([archivoComprimido], nombreLimpio, { type: 'image/webp' });
  } catch (error) {
    console.warn('No se pudo comprimir la imagen, usando original saneado:', error);
    return file;
  }
}

/**
 * Optimiza y comprime documentos PDF sin importar el tamaño inicial.
 */
export async function optimizarPdf(file) {
  if (!file || file.type !== 'application/pdf') return file;

  try {
    const arrayBuffer = await file.arrayBuffer();

    const pdfDoc = await PDFDocument.load(arrayBuffer, { 
      ignoreEncryption: true,
      updateMetadata: false 
    });

    const pdfBytes = await pdfDoc.save({ 
      useObjectStreams: true,
      addDefaultPage: false
    });

    const nombreLimpio = sanitizarNombreArchivo(file.name);

    if (pdfBytes.byteLength < file.size) {
      return new File([pdfBytes], nombreLimpio, { type: 'application/pdf' });
    }

    return new File([file], nombreLimpio, { type: 'application/pdf' });
  } catch (error) {
    console.warn('Aviso en compresión de PDF, usando original saneado:', error);
    return new File([file], sanitizarNombreArchivo(file.name), { type: 'application/pdf' });
  }
}