import imageCompression from 'browser-image-compression';
import { PDFDocument } from 'pdf-lib';

/**
 * Comprime imágenes de comprobantes (JPG, PNG) convirtiendo a WebP optimizado.
 * @param {File} file 
 * @returns {Promise<File>}
 */
export async function comprimirImagen(file) {
  if (!file || !file.type.startsWith('image/')) return file;

  const opciones = {
    maxSizeMB: 0.4, // Máximo ~400 KB
    maxWidthOrHeight: 1600,
    useWebWorker: true,
    fileType: 'image/webp'
  };

  try {
    const archivoComprimido = await imageCompression(file, opciones);
    const nuevoNombre = file.name.replace(/\.[^/.]+$/, "") + ".webp";
    return new File([archivoComprimido], nuevoNombre, { type: 'image/webp' });
  } catch (error) {
    console.warn('No se pudo comprimir la imagen, usando original:', error);
    return file;
  }
}

/**
 * Optimiza y comprime documentos PDF sin importar el tamaño inicial.
 * Si pesa más de 2.5 MB, reempaqueta y optimiza sus streams para reducir el peso.
 * @param {File} file 
 * @returns {Promise<File>}
 */
export async function optimizarPdf(file) {
  if (!file || file.type !== 'application/pdf') return file;

  try {
    const arrayBuffer = await file.arrayBuffer();

    // Cargar con pdf-lib ignorando encriptaciones suaves de escáneres
    const pdfDoc = await PDFDocument.load(arrayBuffer, { 
      ignoreEncryption: true,
      updateMetadata: false 
    });

    // Reempaquetar comprimiendo streams de objetos y descartando metadatos pesados
    const pdfBytes = await pdfDoc.save({ 
      useObjectStreams: true,
      addDefaultPage: false
    });

    // Si el archivo resultante es más liviano, se usa el optimizado; si no, el original
    if (pdfBytes.byteLength < file.size) {
      return new File([pdfBytes], file.name, { type: 'application/pdf' });
    }

    return file;
  } catch (error) {
    console.warn('Aviso en compresión de PDF, subiendo archivo original:', error);
    return file;
  }
}