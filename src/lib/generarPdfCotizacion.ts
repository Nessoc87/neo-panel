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
const teal: [number, number, number] = [12, 132, 145];
const pale: [number, number, number] = [241, 246, 249];
const slate: [number, number, number] = [94, 111, 128];
const border: [number, number, number] = [218, 228, 236];

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
    // Load a known JPEG asset. A missing or unreadable logo must never stop PDF generation.
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
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  const formatPercent = (value: unknown) => Number(value ?? 0).toLocaleString("es-MX", { maximumFractionDigits: 2 }) + "%";

  doc.setFillColor(...navy);
  doc.rect(0, 0, pageWidth, 3, "F");
  doc.setTextColor(...teal);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text("NEO TRANSPORTACIONES  /  OPERACIÓN Y LOGÍSTICA", margin, 12);

  doc.setTextColor(...navy);
  doc.setFontSize(17);
  doc.text("COTIZACIÓN DE SERVICIOS", margin, 22);
  doc.setTextColor(...slate);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Propuesta comercial", margin, 27);

  if (capsLogo) {
    try {
      doc.addImage(capsLogo, "JPEG", pageWidth - 58, 7, 43, 14.8);
    } catch (error) {
      console.warn("No se pudo insertar el logotipo CAPS; se usará texto.", error);
      doc.setTextColor(99, 42, 142);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.text("CAPS", pageWidth - 36, 16, { align: "center" });
    }
  } else {
    doc.setTextColor(99, 42, 142);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text("CAPS", pageWidth - 36, 16, { align: "center" });
  }

  if (neoLogo) {
    try {
      doc.addImage(neoLogo, "JPEG", pageWidth - 57, 24, 42, 22.7);
    } catch (error) {
      console.warn("No se pudo insertar el logotipo Neo; se usará texto.", error);
      doc.setTextColor(...navy);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("NEO", pageWidth - 36, 37, { align: "center" });
    }
  } else {
    doc.setTextColor(...navy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("NEO", pageWidth - 36, 37, { align: "center" });
  }

  const folio = cotizacion.folio || ("COT-" + (cotizacion.id || "PENDIENTE").slice(0, 8).toUpperCase());
  const fechaEmision = fechaBonita(cotizacion.fecha_servicio || cotizacion.created_at || new Date().toISOString());

  // The customer-facing header contains only the four requested data points.
  const cardGap = 4;
  const cardWidth = (contentWidth - cardGap) / 2;
  const cardHeight = 19;
  const cardX1 = margin;
  const cardX2 = margin + cardWidth + cardGap;

  const infoCard = (x: number, y: number, label: string, value: string) => {
    doc.setDrawColor(...border);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, y, cardWidth, cardHeight, 2, 2, "FD");

    doc.setTextColor(...teal);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.3);
    doc.text(label.toUpperCase(), x + 3.5, y + 5.2);

    doc.setTextColor(...navy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.8);
    const wrapped = doc.splitTextToSize(value || "No especificado", cardWidth - 7).slice(0, 2);
    doc.text(wrapped, x + 3.5, y + 12.4, { lineHeightFactor: 1.15 });
  };

  infoCard(cardX1, 51, "Número de cotización", folio);
  infoCard(cardX2, 51, "Fecha", fechaEmision);
  infoCard(cardX1, 73, "Cliente", cotizacion.cliente || "No especificado");
  infoCard(cardX2, 73, "Contacto", cotizacion.contacto || "No especificado");

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

  const serviceTable = [
    ["DESCRIPCIÓN", "CANT.", "COSTO UNITARIO", "SUBTOTAL", "TOTAL"],
  ];
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

  autoTable(doc, {
    startY: (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY
      ? (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable!.finalY + 8
      : 101,
    head: [serviceTable[0]],
    body: tableRows,
    theme: "grid",
    margin: { left: margin, right: margin, bottom: 22 },
    styles: { font: "helvetica", fontSize: 7.5, cellPadding: 3, textColor: navy, lineColor: border, lineWidth: 0.15, overflow: "linebreak", valign: "middle" },
    headStyles: { fillColor: teal, textColor: 255, fontStyle: "bold", fontSize: 6.6, cellPadding: 3.2 },
    alternateRowStyles: { fillColor: [248, 251, 252] },
    columnStyles: {
      0: { cellWidth: 76 },
      1: { cellWidth: 18, halign: "center" },
      2: { cellWidth: 31, halign: "right" },
      3: { cellWidth: 29, halign: "right" },
      4: { cellWidth: 28, halign: "right", fontStyle: "bold" },
    },
  });

  let cursorY = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 110) + 8;
  if (cursorY + 39 > pageHeight - 22) {
    doc.addPage();
    cursorY = 20;
  }

  autoTable(doc, {
    startY: cursorY,
    body: [
      ["Subtotal", dinero(subtotal)],
      ["IVA", dinero(iva)],
      ["Retención", "- " + dinero(retencion)],
      ["TOTAL DE LA COTIZACIÓN", dinero(total)],
    ],
    theme: "plain",
    tableWidth: 78,
    margin: { left: pageWidth - margin - 78, right: margin, bottom: 22 },
    styles: { font: "helvetica", fontSize: 8, cellPadding: 2.2, textColor: navy, lineWidth: 0, halign: "right" },
    columnStyles: { 0: { cellWidth: 42, halign: "left", textColor: slate }, 1: { cellWidth: 36, halign: "right" } },
    didParseCell: (data) => {
      if (data.row.index === 3) {
        data.cell.styles.fillColor = navy;
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fontSize = 9;
      }
    },
  });
  cursorY = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? cursorY) + 6;

  if (cotizacion.notas?.trim()) {
    if (cursorY + 23 > pageHeight - 24) { doc.addPage(); cursorY = 18; }
    autoTable(doc, {
      startY: cursorY,
      head: [["OBSERVACIONES"]],
      body: [[cotizacion.notas.trim()]],
      theme: "grid",
      margin: { left: margin, right: margin, bottom: 22 },
      styles: { font: "helvetica", fontSize: 7.2, cellPadding: 3, textColor: navy, lineColor: border, lineWidth: 0.15 },
      headStyles: { fillColor: pale, textColor: navy, fontStyle: "bold", fontSize: 6.6 },
    });
    cursorY = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? cursorY) + 5;
  }

  const conditions = (cotizacion.condiciones || "").trim();
  if (conditions) {
    if (cursorY + 22 > pageHeight - 24) { doc.addPage(); cursorY = 18; }
    autoTable(doc, {
      startY: cursorY,
      head: [["TÉRMINOS Y CONDICIONES"]],
      body: conditions.split(/\r?\n/).map((line) => [line.trim()]).filter((row) => row[0]),
      theme: "grid",
      margin: { left: margin, right: margin, bottom: 22 },
      styles: { font: "helvetica", fontSize: 6.8, cellPadding: 2.4, textColor: slate, lineColor: border, lineWidth: 0.12, overflow: "linebreak" },
      headStyles: { fillColor: navy, textColor: 255, fontStyle: "bold", fontSize: 6.6 },
    });
    cursorY = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? cursorY) + 7;
  }

  if (cursorY + 18 < pageHeight - 20) {
    doc.setDrawColor(...border);
    doc.line(margin, cursorY + 3, pageWidth - margin, cursorY + 3);
    doc.setTextColor(...slate);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text("Aceptación del cliente", margin + 2, cursorY + 10);
    doc.text("Nombre, firma y fecha", margin + 2, cursorY + 15);
    doc.line(pageWidth - 72, cursorY + 9, pageWidth - margin - 2, cursorY + 9);
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...border);
    doc.line(margin, pageHeight - 13, pageWidth - margin, pageHeight - 13);
    doc.setTextColor(...slate);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.text("Documento de cotización comercial. No sustituye una factura o CFDI.", margin, pageHeight - 8);
    doc.text("NEO TRANSPORTACIONES  ·  " + folio + "  ·  Página " + page + " de " + pageCount, pageWidth - margin, pageHeight - 8, { align: "right" });
  }

  const safeFolio = folio.replace(/[^a-zA-Z0-9_-]/g, "-");
  doc.save("Neo-Cotizacion-" + safeFolio + ".pdf");
}
