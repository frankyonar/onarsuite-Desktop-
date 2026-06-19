import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import mammoth from 'mammoth';
import pdf from 'pdf-parse';
import readXlsxFile from 'read-excel-file/node';
import type { ParsedDocument } from '../../shared/types';

const SUPPORTED_EXTENSIONS = new Set(['.pdf', '.docx', '.xlsx', '.csv', '.txt', '.md']);
const MAX_PARSE_BYTES = 25 * 1024 * 1024;

export function isSupportedFile(filePath: string): boolean {
  return SUPPORTED_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export async function parseDocument(filePath: string): Promise<ParsedDocument> {
  const extension = path.extname(filePath).toLowerCase();
  if (!isSupportedFile(filePath)) throw new Error(`Formato non supportato: ${extension || 'sconosciuto'}`);

  const details = await stat(filePath);
  if (details.size > MAX_PARSE_BYTES) throw new Error('Il file supera il limite di 25 MB per il parsing locale.');

  const buffer = await readFile(filePath);
  let text = '';

  if (extension === '.pdf') {
    text = (await pdf(buffer)).text;
  } else if (extension === '.docx') {
    text = (await mammoth.extractRawText({ buffer })).value;
  } else if (extension === '.xlsx') {
    const rows = await readXlsxFile(buffer);
    text = rows.map((row) => row.map(cellText).join(',')).join('\n');
  } else {
    text = buffer.toString('utf8');
  }

  const cleanText = text.replace(/\u0000/g, '').trim().slice(0, 250_000);
  return {
    path: filePath,
    type: extension.slice(1),
    text: cleanText,
    summary: summarize(cleanText),
    metadata: {
      filename: path.basename(filePath),
      size: details.size,
      modifiedAt: details.mtime.toISOString(),
      characters: cleanText.length,
    },
  };
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function summarize(text: string): string {
  if (!text) return 'Nessun testo estraibile dal documento.';
  const compact = text.replace(/\s+/g, ' ').trim();
  const sentences = compact.match(/[^.!?]+[.!?]+/g) ?? [compact];
  return sentences.slice(0, 3).join(' ').slice(0, 700);
}
