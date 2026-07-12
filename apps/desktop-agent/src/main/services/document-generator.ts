import { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun } from 'docx';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import writeXlsxFile from 'write-excel-file/node';

export type GeneratedDocumentFormat = 'pdf' | 'xlsx' | 'docx' | 'csv' | 'txt' | 'md' | 'html';

export interface GeneratedDocumentSpec {
  title: string;
  content?: string;
  sections?: Array<{ heading?: string; content: string }>;
  table?: { columns: string[]; rows: Array<Array<string | number | boolean | null>> };
  format: GeneratedDocumentFormat;
}

export async function generateDocument(spec: GeneratedDocumentSpec): Promise<Buffer> {
  switch (spec.format) {
    case 'pdf': return generatePdf(spec);
    case 'xlsx': return generateXlsx(spec);
    case 'docx': return generateDocx(spec);
    case 'csv': return Buffer.from(generateCsv(spec), 'utf8');
    case 'html': return Buffer.from(generateHtml(spec), 'utf8');
    case 'md': return Buffer.from(generateMarkdown(spec), 'utf8');
    case 'txt': return Buffer.from(generateText(spec), 'utf8');
  }
}

export const DOCUMENT_MIME: Record<GeneratedDocumentFormat, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  csv: 'text/csv', txt: 'text/plain', md: 'text/markdown', html: 'text/html',
};

async function generatePdf(spec: GeneratedDocumentSpec): Promise<Buffer> {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const margin = 52;
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const maxWidth = pageWidth - margin * 2;
  let page = document.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;
  const newPage = () => { page = document.addPage([pageWidth, pageHeight]); y = pageHeight - margin; };
  const write = (text: string, size: number, isBold = false, gap = 7) => {
    const font = isBold ? bold : regular;
    for (const line of wrapPdfText(toPdfText(text), font, size, maxWidth)) {
      if (y < margin + size) newPage();
      page.drawText(line, { x: margin, y, size, font, color: rgb(.12, .15, .2) });
      y -= size + gap;
    }
  };
  write(spec.title || 'Documento', 22, true, 10);
  y -= 8;
  if (spec.content) { write(spec.content, 11, false, 5); y -= 8; }
  for (const section of spec.sections ?? []) {
    if (section.heading) { write(section.heading, 15, true, 7); y -= 2; }
    write(section.content, 11, false, 5); y -= 8;
  }
  if (spec.table?.columns.length) {
    write(spec.table.columns.join(' | '), 10, true, 5);
    for (const row of spec.table.rows) write(row.map(cellText).join(' | '), 9, false, 4);
  }
  return Buffer.from(await document.save());
}

async function generateXlsx(spec: GeneratedDocumentSpec): Promise<Buffer> {
  const rows: Array<Array<Record<string, unknown>>> = [[{ value: spec.title || 'Documento', fontWeight: 'bold', fontSize: 18, color: '#1F4F9A' }]];
  if (spec.content) rows.push([], [{ value: spec.content, wrap: true }]);
  for (const section of spec.sections ?? []) {
    rows.push([]);
    if (section.heading) rows.push([{ value: section.heading, fontWeight: 'bold', fontSize: 13 }]);
    rows.push([{ value: section.content, wrap: true }]);
  }
  if (spec.table?.columns.length) {
    rows.push([]);
    rows.push(spec.table.columns.map((value) => ({ value, fontWeight: 'bold', color: '#FFFFFF', backgroundColor: '#246FE5' })));
    rows.push(...spec.table.rows.map((row) => row.map((value) => ({ value: value ?? '', wrap: true }))));
  }
  return writeXlsxFile(rows as never, { sheet: safeSheetName(spec.title || 'Documento'), columns: Array.from({ length: Math.max(1, spec.table?.columns.length ?? 1) }, () => ({ width: 24 })) }).toBuffer();
}

async function generateDocx(spec: GeneratedDocumentSpec): Promise<Buffer> {
  const children: Array<Paragraph | Table> = [new Paragraph({ text: spec.title || 'Documento', heading: HeadingLevel.TITLE })];
  if (spec.content) children.push(new Paragraph({ children: [new TextRun(spec.content)] }));
  for (const section of spec.sections ?? []) {
    if (section.heading) children.push(new Paragraph({ text: section.heading, heading: HeadingLevel.HEADING_1 }));
    children.push(new Paragraph({ children: [new TextRun(section.content)] }));
  }
  if (spec.table?.columns.length) {
    children.push(new Table({ rows: [
      new TableRow({ children: spec.table.columns.map((value) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: value, bold: true })] })] })) }),
      ...spec.table.rows.map((row) => new TableRow({ children: row.map((value) => new TableCell({ children: [new Paragraph(cellText(value))] })) })),
    ] }));
  }
  return Packer.toBuffer(new Document({ sections: [{ children }] }));
}

function generateCsv(spec: GeneratedDocumentSpec): string {
  if (spec.table?.columns.length) return [spec.table.columns, ...spec.table.rows].map((row) => row.map((value) => csvCell(cellText(value))).join(',')).join('\r\n');
  return generateText(spec);
}

function generateMarkdown(spec: GeneratedDocumentSpec): string {
  const lines = [`# ${spec.title || 'Documento'}`];
  if (spec.content) lines.push('', spec.content);
  for (const section of spec.sections ?? []) lines.push('', section.heading ? `## ${section.heading}` : '', section.content);
  if (spec.table?.columns.length) lines.push('', `| ${spec.table.columns.join(' | ')} |`, `| ${spec.table.columns.map(() => '---').join(' | ')} |`, ...spec.table.rows.map((row) => `| ${row.map(cellText).join(' | ')} |`));
  return lines.filter((line, index, all) => line !== '' || all[index - 1] !== '').join('\n');
}

function generateHtml(spec: GeneratedDocumentSpec): string {
  const sections = (spec.sections ?? []).map((section) => `${section.heading ? `<h2>${escapeHtml(section.heading)}</h2>` : ''}<p>${escapeHtml(section.content).replace(/\n/g, '<br>')}</p>`).join('');
  const table = spec.table?.columns.length ? `<table><thead><tr>${spec.table.columns.map((value) => `<th>${escapeHtml(value)}</th>`).join('')}</tr></thead><tbody>${spec.table.rows.map((row) => `<tr>${row.map((value) => `<td>${escapeHtml(cellText(value))}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '';
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>${escapeHtml(spec.title)}</title><style>body{font:15px/1.6 Arial,sans-serif;max-width:920px;margin:48px auto;padding:0 24px;color:#20242c}h1{color:#174f9e}table{width:100%;border-collapse:collapse}th,td{padding:9px;border:1px solid #dfe4eb;text-align:left}th{background:#246fe5;color:#fff}</style></head><body><h1>${escapeHtml(spec.title)}</h1>${spec.content ? `<p>${escapeHtml(spec.content).replace(/\n/g, '<br>')}</p>` : ''}${sections}${table}</body></html>`;
}

function generateText(spec: GeneratedDocumentSpec): string {
  const lines = [spec.title || 'Documento'];
  if (spec.content) lines.push('', spec.content);
  for (const section of spec.sections ?? []) lines.push('', section.heading ?? '', section.content);
  if (spec.table?.columns.length) lines.push('', spec.table.columns.join('\t'), ...spec.table.rows.map((row) => row.map(cellText).join('\t')));
  return lines.join('\n');
}

function wrapPdfText(text: string, font: { widthOfTextAtSize: (text: string, size: number) => number }, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && font.widthOfTextAtSize(candidate, size) > width) { lines.push(line); line = word; } else line = candidate;
    }
    lines.push(line || ' ');
  }
  return lines;
}

function toPdfText(value: string): string { return value.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/\u2013|\u2014/g, '-').replace(/[^\x20-\xFF\n\r\t]/g, ''); }
function safeSheetName(value: string): string { return value.replace(/[\\/*?:[\]]/g, ' ').slice(0, 31) || 'Documento'; }
function cellText(value: unknown): string { return value === null || value === undefined ? '' : String(value); }
function csvCell(value: string): string { return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value; }
function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char)); }
