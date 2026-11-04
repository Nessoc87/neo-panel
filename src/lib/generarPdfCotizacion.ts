"use client";

import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";

export type CotizacionPdfPartida = {
  descripcion: string;
  cantidad: number | string;
  precio_unitario: number | string;
  iva_porcentaje?: number | string;
  retencion_porcentaje?: number | string;
  subtotal?: number | string;
  iva?: number | string;
  retencion?: number | string;
  total?: number | string;
};
export type CotizacionPdfData = {
  id?: string;
  folio?: string | null;
  cliente: string;
  contacto?: string | null;
  telefono?: string | null;
  servicio: string;
  origen?: string | null;
  destino?: string | null;
  mercancia?: string | null;
  peso?: string | null;
  tipo_unidad?: string | null;
  tipo_flete?: string | null;
  fecha_servicio?: string | null;
  monto_estimado?: number | string | null;
  subtotal?: number | string | null;
  iva?: number | string | null;
  retencion?: number | string | null;
  total?: number | string | null;
  partidas?: CotizacionPdfPartida[] | null;
  notas?: string | null;
  condiciones?: string | null;
  vigencia_dias?: number | null;
  created_at?: string | null;
};

const navy: [number, number, number] = [16, 43, 68];
const blue: [number, number, number] = [31, 91, 143];
const lightBlue: [number, number, number] = [243, 248, 252];
const textMuted: [number, number, number] = [83, 101, 119];
const border: [number, number, number] = [211, 224, 235];

const dinero = (value: unknown) => new Intl.NumberFormat("es-MX", {
  style: "currency", currency: "MXN", minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(Number(value ?? 0));

function dosDecimales(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}
function fechaBonita(value: string | null | undefined): string {
  if (!value) return "Por confirmar";
  const parsed = new Date(value + (value.length === 10 ? "T00:00:00" : ""));
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit", month: "long", year: "numeric", timeZone: "America/Monterrey",
  }).format(parsed);
}
async function imagenDataUrl(path: string): Promise<string | null> {
  try {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) return null;
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = typeof reader.result === "string" ? reader.result : null;
        resolve(dataUrl?.startsWith("data:image/jpeg;base64,") ? dataUrl : null);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn("No se pudo cargar el logotipo para el PDF:", path, error);
    return null;
  }
}

function normalizarCondiciones(value: string | null | undefined): string[] {
  return (value || "").split(/\r?\n/)
    .map((line) => line.trim().replace(/^\s*(?:\d{1,2}[.)]|[•●▪*-])\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 7);
}

export async function generarPdfCotizacion(cotizacion: CotizacionPdfData): Promise<void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  doc.setProperties({
    title: "Cotización " + (cotizacion.folio || "Neo"),
    subject: "Propuesta comercial de servicios de transporte y logística",
    author: "Neo Transportaciones",
    creator: "Neo Panel",
  });

  const [capsLogo, neoLogo] = await Promise.all([
    imagenDataUrl("/caps-logo.jpg"),
    imagenDataUrl("/neo-logo.jpg"),
  ]);

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;
  const formatPercent = (value: unknown) =>
    Number(value ?? 0).toLocaleString("es-MX", { maximumFractionDigits: 2 }) + "%";

  doc.setFillColor(...navy);
  doc.rect(0, 0, pageWidth, 2.2, "F");

  const logoX = pageWidth - margin - 45;
  const logoWidth = 45;
  const logoHeight = 17;
  const leftAreaWidth = logoX - margin - 5;
  const titleCenterX = margin + leftAreaWidth / 2;

  doc.setTextColor(...navy);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.text("COTIZACIÓN DE SERVICIOS", titleCenterX, 22, { align: "center" });
  doc.setTextColor(...blue);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Propuesta comercial", titleCenterX, 29, { align: "center" });

  const insertarLogo = (data: string | null, x: number, y: number, texto: string, color: [number, number, number]) => {
    if (data) {
      try {
        doc.addImage(data, "JPEG", x, y, logoWidth, logoHeight);
        return;
      } catch (error) {
        console.warn("No se pudo insertar el logotipo " + texto + "; se usará texto.", error);
      }
    }
    doc.setTextColor(...color);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(texto, x + logoWidth / 2, y + 10, { align: "center" });
  };
  insertarLogo(capsLogo, logoX, 6, "CAPS", blue);
  insertarLogo(neoLogo, logoX, 25, "NEO", navy);

  const folio = cotizacion.folio || ("COT-" + (cotizacion.id || "PENDIENTE").slice(0, 8).toUpperCase());
  const fechaEmision = fechaBonita(cotizacion.fecha_servicio || cotizacion.created_at || new Date().toISOString());

  const cardGap = 4;
  const cardWidth = (contentWidth - cardGap) / 2;
  const cardHeight = 16.5;
  const cardX1 = margin;
  const cardX2 = margin + cardWidth + cardGap;

  const infoCard = (x: number, y: number, label: string, value: string) => {
    doc.setDrawColor(...border);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, y, cardWidth, cardHeight, 2, 2, "FD");
    doc.setTextColor(...blue);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.1);
    doc.text(label.toUpperCase(), x + 3, y + 4.8);
    doc.setTextColor(...navy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.2);
    const wrapped = doc.splitTextToSize(value || "No especificado", cardWidth - 6).slice(0, 2);
    doc.text(wrapped, x + 3, y + 11, { lineHeightFactor: 1.08 });
  };

  infoCard(cardX1, 47, "Número de cotización", folio);
  infoCard(cardX2, 47, "Fecha", fechaEmision);
  infoCard(cardX1, 65.5, "Cliente", cotizacion.cliente || "No especificado");
  infoCard(cardX2, 65.5, "Contacto", cotizacion.contacto || "No especificado");

  const sourceLines = Array.isArray(cotizacion.partidas) ? cotizacion.partidas : [];
  const isLegacy = sourceLines.length === 0;
  const lines: CotizacionPdfPartida[] = isLegacy ? [{
    descripcion: (cotizacion.servicio || "Servicio cotizado") + "\nMonto estimado registrado; desglose fiscal no disponible en el registro original.",
    cantidad: 1,
    precio_unitario: dosDecimales(cotizacion.monto_estimado),
    iva_porcentaje: 0,
    retencion_porcentaje: 0,
    subtotal: dosDecimales(cotizacion.monto_estimado),
    iva: 0,
    retencion: 0,
    total: dosDecimales(cotizacion.monto_estimado),
  }] : sourceLines;

  const subtotal = cotizacion.subtotal !== null && cotizacion.subtotal !== undefined
    ? dosDecimales(cotizacion.subtotal)
    : lines.reduce((sum, line) => sum + dosDecimales(line.subtotal ?? dosDecimales(line.cantidad) * dosDecimales(line.precio_unitario)), 0);
  const iva = cotizacion.iva !== null && cotizacion.iva !== undefined
    ? dosDecimales(cotizacion.iva)
    : lines.reduce((sum, line) => sum + dosDecimales(line.iva), 0);
  const retencion = cotizacion.retencion !== null && cotizacion.retencion !== undefined
    ? dosDecimales(cotizacion.retencion)
    : lines.reduce((sum, line) => sum + dosDecimales(line.retencion), 0);
  const total = cotizacion.total !== null && cotizacion.total !== undefined
    ? dosDecimales(cotizacion.total)
    : subtotal + iva - retencion;

  const tableRows = lines.map((line) => {
    const ivaPct = formatPercent(line.iva_porcentaje ?? 0);
    const retPct = formatPercent(line.retencion_porcentaje ?? 0);
    return [
      line.descripcion + "\nIVA " + ivaPct + "  ·  Retención " + retPct,
      Number(line.cantidad).toLocaleString("es-MX", { maximumFractionDigits: 3 }),
      dinero(line.precio_unitario),
      dinero(line.subtotal ?? dosDecimales(line.cantidad) * dosDecimales(line.precio_unitario)),
      dinero(line.total ?? line.subtotal ?? 0),
    ];
  });

  const itemFontSize = Math.max(5.7, lines.length > 5 ? 6.1 : 6.7 - Math.max(0, lines.length - 2) * 0.12);
  autoTable(doc, {
    startY: 88,
    head: [["DESCRIPCIÓN", "CANT.", "COSTO UNITARIO", "SUBTOTAL", "TOTAL"]],
    body: tableRows,
    theme: "grid",
    pageBreak: "avoid",
    rowPageBreak: "avoid",
    margin: { left: margin, right: margin, bottom: 17 },
    styles: {
      font: "helvetica", fontSize: itemFontSize, cellPadding: 1.8,
      textColor: navy, lineColor: border, lineWidth: 0.12,
      overflow: "linebreak", valign: "middle",
    },
    headStyles: { fillColor: navy, textColor: 255, fontStyle: "bold", fontSize: 6.1, cellPadding: 2.2 },
    alternateRowStyles: { fillColor: lightBlue },
    columnStyles: {
      0: { cellWidth: 78 },
      1: { cellWidth: 16, halign: "center" },
      2: { cellWidth: 31, halign: "right" },
      3: { cellWidth: 29, halign: "right" },
      4: { cellWidth: 30, halign: "right", fontStyle: "bold" },
    },
  });

  const itemBottom = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 100;
  const totalsY = itemBottom + 3.5;
  autoTable(doc, {
    startY: totalsY,
    body: [
      ["Subtotal", dinero(subtotal)],
      ["IVA", dinero(iva)],
      ["Retención", "- " + dinero(retencion)],
      ["TOTAL DE LA COTIZACIÓN", dinero(total)],
    ],
    theme: "plain",
    pageBreak: "avoid",
    tableWidth: 82,
    margin: { left: pageWidth - margin - 82, right: margin, bottom: 17 },
    styles: {
      font: "helvetica", fontSize: 7.8, cellPadding: 1.7,
      textColor: navy, lineWidth: 0, halign: "right",
    },
    columnStyles: {
      0: { cellWidth: 45, halign: "left", textColor: textMuted },
      1: { cellWidth: 37, halign: "right" },
    },
    didParseCell: (data) => {
      if (data.row.index === 3) {
        data.cell.styles.fillColor = navy;
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fontSize = 8.8;
        data.cell.styles.cellPadding = 2.2;
        data.cell.styles.halign = "center";
      }
    },
  });

  const totalsBottom = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? totalsY + 25;
  let contentBottom = totalsBottom;

  if (cotizacion.notas?.trim()) {
    const noteX = margin;
    const noteY = totalsY + 1;
    const noteWidth = contentWidth - 88;
    doc.setTextColor(...blue);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.3);
    doc.text("OBSERVACIONES", noteX, noteY + 3);
    doc.setTextColor(...textMuted);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.2);
    const noteLines = doc.splitTextToSize(cotizacion.notas.trim(), noteWidth);
    doc.text(noteLines, noteX, noteY + 7, { lineHeightFactor: 1.08 });
    const noteBottom = noteY + 7 + noteLines.length * 2.5;
    contentBottom = Math.max(contentBottom, noteBottom);
  }

  const conditions = normalizarCondiciones(cotizacion.condiciones);
  let termsY = contentBottom + 5;
  if (conditions.length) {
    const termsHeaderHeight = 6;
    doc.setFillColor(...navy);
    doc.rect(margin, termsY, contentWidth, termsHeaderHeight, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.4);
    doc.text("TÉRMINOS Y CONDICIONES", margin + 3, termsY + 4.1);

    const termsStartY = termsY + termsHeaderHeight;
    const availableTermsHeight = Math.max(18, pageHeight - 23 - termsStartY);
    let termsFontSize = 6.0;
    let measuredRows: { text: string[]; height: number }[] = [];

    const measureTerms = (fontSize: number) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(fontSize);
      const lineHeight = fontSize * 0.43;
      return conditions.map((condition) => {
        const wrapped = doc.splitTextToSize(condition, contentWidth - 13);
        return { text: wrapped, height: Math.max(4.4, wrapped.length * lineHeight + 2.2) };
      });
    };

    measuredRows = measureTerms(termsFontSize);
    let measuredHeight = measuredRows.reduce((sum, row) => sum + row.height, 0);
    while (measuredHeight > availableTermsHeight && termsFontSize > 4.8) {
      termsFontSize -= 0.2;
      measuredRows = measureTerms(termsFontSize);
      measuredHeight = measuredRows.reduce((sum, row) => sum + row.height, 0);
    }

    let rowY = termsStartY;
    measuredRows.forEach((row) => {
      doc.setDrawColor(...border);
      doc.setLineWidth(0.12);
      doc.rect(margin, rowY, contentWidth, row.height);
      doc.setFillColor(...blue);
      doc.circle(margin + 4, rowY + row.height / 2, 0.55, "F");
      doc.setTextColor(...textMuted);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(termsFontSize);
      doc.text(row.text, margin + 8, rowY + 2.4, { lineHeightFactor: 1.08 });
      rowY += row.height;
    });
    contentBottom = rowY;
  }

  if (contentBottom + 17 < pageHeight - 18) {
    const signY = contentBottom + 5;
    doc.setDrawColor(...border);
    doc.setLineWidth(0.2);
    doc.line(margin, signY, pageWidth - margin, signY);
    doc.setTextColor(...textMuted);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.6);
    doc.text("Aceptación del cliente", margin + 2, signY + 5);
    doc.text("Nombre, firma y fecha", margin + 2, signY + 9);
    doc.line(pageWidth - 74, signY + 7, pageWidth - margin - 2, signY + 7);
  }

  doc.setDrawColor(...border);
  doc.setLineWidth(0.2);
  doc.line(margin, pageHeight - 13, pageWidth - margin, pageHeight - 13);
  doc.setTextColor(...textMuted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.3);
  doc.text("Documento de cotización comercial. No sustituye una factura o CFDI.", margin, pageHeight - 7.5);
  doc.text(folio, pageWidth - margin, pageHeight - 7.5, { align: "right" });

  const safeFolio = folio.replace(/[^a-zA-Z0-9_-]/g, "-");
  doc.save("Neo-Cotizacion-" + safeFolio + ".pdf");
}
