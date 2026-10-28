import imageCompression from 'browser-image-compression';
import { PDFDocument } from 'pdf-lib';

/**
 * Comprime imágenes de comprobantes (JPG, PNG) convirtiendo a WebP optimizado.
 * @param {File} file 
 * @returns {Promise<File>}
 */
export async function comprimirImagen(file) {
  // Si no es imagen, retornar tal cual
  if (!file.type.startsWith('image/')) return file;

  const opciones = {
    maxSizeMB: 0.4, // Máximo ~400 KB
    maxWidthOrHeight: 1600, // Resolución óptima para lectura de comprobantes bancarios
    useWebWorker: true,
    fileType: 'image/webp'
  };

  try {
    const archivoComprimido = await imageCompression(file, opciones);
    // Retornar un File con nombre adaptado
    const nuevoNombre = file.name.replace(/\.[^/.]+$/, "") + ".webp";
    return new File([archivoComprimido], nuevoNombre, { type: 'image/webp' });
  } catch (error) {
    console.warn('No se pudo comprimir la imagen, usando original:', error);
    return file;
  }
}

/**
 * Optimiza y valida archivos PDF de contratos antes de subirlos.
 * @param {File} file 
 * @returns {Promise<File>}
 */
export async function optimizarPdf(file) {
  if (file.type !== 'application/pdf') return file;

  // Límite preventivo de 15 MB
  const limiteMax = 15 * 1024 * 1024;
  if (file.size > limiteMax) {
    throw new Error('El archivo PDF supera los 15 MB permitidos. Por favor reduzca la resolución del escaneo.');
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    // Carga y reempaqueta el PDF limpiando metadatos residuales
    const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    const pdfBytes = await pdfDoc.save({ useObjectStreams: true });

    return new File([pdfBytes], file.name, { type: 'application/pdf' });
  } catch (error) {
    console.warn('No se pudo optimizar el PDF, usando original:', error);
    return file;
  }
}