// src/utils/exportUtils.js

/**
 * Formatea valores numéricos a moneda argentina
 */
export const formatearMoneda = (valor) => {
  return `$${Number(valor || 0).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

/**
 * Exporta un dataset a archivo CSV con BOM UTF-8 para apertura correcta en Excel
 */
export const exportarCSV = (columnas, filas, nombreArchivo = 'reporte') => {
  const encabezados = columnas.map((c) => `"${c.header.replace(/"/g, '""')}"`).join(';');
  const lineas = filas.map((fila) => {
    return columnas
      .map((col) => {
        let val = fila[col.key];
        if (val === null || val === undefined) val = '';
        if (typeof val === 'number') val = val.toFixed(2).replace('.', ',');
        return `"${String(val).replace(/"/g, '""')}"`;
      })
      .join(';');
  });

  const contenido = '\uFEFF' + [encabezados, ...lineas].join('\r\n');
  const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nombreArchivo}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/**
 * Exporta a Excel compatible (XML Spreadsheet 2003) preservando formatos numéricos y subtotales
 */
export const exportarExcel = (columnas, filas, titulo, nombreArchivo = 'reporte') => {
  let xml = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Header">
   <Font ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#1E293B" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="Currency">
   <NumberFormat ss:Format="$#,##0.00"/>
  </Style>
  <Style ss:ID="BoldText">
   <Font ss:Bold="1"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="Reporte">
  <Table>
   <Row ss:Height="25">
    <Cell ss:MergeAcross="${columnas.length - 1}" ss:StyleID="BoldText">
      <Data ss:Type="String">${titulo} - Emisión: ${new Date().toLocaleDateString('es-AR')}</Data>
    </Cell>
   </Row>
   <Row ss:Height="20">`;

  columnas.forEach((c) => {
    xml += `<Cell ss:StyleID="Header"><Data ss:Type="String">${c.header}</Data></Cell>`;
  });
  xml += `</Row>`;

  filas.forEach((fila) => {
    xml += `<Row>`;
    columnas.forEach((c) => {
      const val = fila[c.key];
      if (typeof val === 'number') {
        xml += `<Cell ss:StyleID="Currency"><Data ss:Type="Number">${val}</Data></Cell>`;
      } else {
        xml += `<Cell><Data ss:Type="String">${val ?? ''}</Data></Cell>`;
      }
    });
    xml += `</Row>`;
  });

  xml += `</Table></Worksheet></Workbook>`;

  const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nombreArchivo}_${new Date().toISOString().slice(0, 10)}.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/**
 * Abre una ventana con el reporte institucional formateado y dispara el diálogo de impresión / Guardar como PDF
 */
export const imprimirPDF = ({ titulo, subtitulo, columnas, filas, totales, filtrosAplicados, usuarioEmisor }) => {
  const ventana = window.open('', '_blank');
  if (!ventana) return;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${titulo}</title>
        <meta charset="utf-8" />
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; margin: 25px; color: #1e293b; font-size: 11px; }
          .header { border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 15px; }
          .header-top { display: flex; justify-content: space-between; align-items: flex-start; }
          .title { font-size: 16px; font-weight: 800; color: #0f172a; margin: 0; }
          .subtitle { font-size: 11px; color: #64748b; margin-top: 2px; }
          .meta-box { background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 6px; margin-bottom: 15px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; font-size: 10px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th { background: #f1f5f9; color: #334155; font-weight: 700; text-align: left; padding: 6px 8px; border: 1px solid #cbd5e1; font-size: 10px; }
          td { padding: 5px 8px; border: 1px solid #e2e8f0; }
          tr:nth-child(even) { background-color: #f8fafc; }
          .num { text-align: right; font-family: "Courier New", monospace; font-weight: 600; }
          .totales { margin-top: 15px; border-top: 2px solid #0f172a; padding-top: 8px; font-size: 11px; font-weight: 700; }
          .footer { margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 8px; font-size: 9px; color: #94a3b8; display: flex; justify-content: space-between; }
          @media print {
            body { margin: 10mm; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="header-top">
            <div>
              <h1 class="title">CAJA SOCIAL DE SAN LUIS</h1>
              <div class="subtitle">${titulo} • ${subtitulo || 'Módulo de Control Contable'}</div>
            </div>
            <div style="text-align: right; font-size: 10px; color: #64748b;">
              Fecha de Emisión: <b>${new Date().toLocaleDateString('es-AR')} ${new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</b>
            </div>
          </div>
        </div>

        <div class="meta-box">
          <div><b>Usuario Emisor:</b> ${usuarioEmisor || 'Operador Contable'}</div>
          <div><b>Filtros aplicados:</b> ${filtrosAplicados || 'Ninguno (Cartera Completa)'}</div>
          <div><b>Registros emitidos:</b> ${filas.length} filas</div>
        </div>

        <table>
          <thead>
            <tr>
              ${columnas.map((c) => `<th style="text-align: ${c.isNumber ? 'right' : 'left'}">${c.header}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${filas
              .map(
                (fila) => `
              <tr>
                ${columnas
                  .map((c) => {
                    const val = fila[c.key];
                    const txt = c.isNumber && typeof val === 'number' ? formatearMoneda(val) : (val ?? '-');
                    return `<td class="${c.isNumber ? 'num' : ''}">${txt}</td>`;
                  })
                  .join('')}
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>

        ${
          totales && Object.keys(totales).length > 0
            ? `
          <div class="totales">
            ${Object.entries(totales)
              .map(([label, valor]) => `<span>${label}: <b>${typeof valor === 'number' ? formatearMoneda(valor) : valor}</b> &nbsp;&nbsp;&nbsp;&nbsp;</span>`)
              .join('')}
          </div>
        `
            : ''
        }

        <div class="footer">
          <span>Sistema de Administración de Loteos y Contratos — Control Financiero Interno</span>
          <span>Página 1 de 1</span>
        </div>

        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
    </html>
  `;

  ventana.document.write(html);
  ventana.document.close();
};