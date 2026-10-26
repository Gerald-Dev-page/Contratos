import { PDFDocument } from 'pdf-lib';
import { supabase } from './supabase';

/**
 * Optimiza el PDF reconstruyéndolo con streams comprimidos y sin metadatos residuales
 */
export async function optimizarPdf(archivoOriginal) {
  try {
    const arrayBuffer = await archivoOriginal.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

    // Guardar aplicando compresión nativa de objetos
    const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
    
    return new Blob([pdfBytes], { type: 'application/pdf' });
  } catch (error) {
    console.warn('No se pudo recomprimir el PDF, se usará el archivo original:', error);
    return archivoOriginal;
  }
}

/**
 * Sube un PDF de contrato optimizado a Supabase Storage
 */
export async function subirContratoPdf(archivo, numeroExpediente) {
  const archivoOptimizado = await optimizarPdf(archivo);
  const nombreLimpio = numeroExpediente.replace(/[^a-zA-Z0-9_-]/g, '_');
  const path = `expedientes/${nombreLimpio}_${Date.now()}.pdf`;

  const { data, error } = await supabase.storage
    .from('contratos-pdf')
    .upload(path, archivoOptimizado, {
      contentType: 'application/pdf',
      upsert: true
    });

  if (error) throw error;
  return data.path;
}

/**
 * Obtiene URL firmada temporal (válida por 60 min) para previsualizar
 */
export async function obtenerUrlVisualizacion(bucket, path) {
  if (!path) return null;
  
  // Si ya es una URL completa externa
  if (path.startsWith('http')) return path;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 3600); // 1 hora de validez

  if (error) {
    console.error('Error al generar URL firmada:', error.message);
    return null;
  }

  return data.signedUrl;
}