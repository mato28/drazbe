import { type DocumentContent, type DocumentTable } from '@domik/core';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, type PDFFont, type PDFPage, rgb } from 'pdf-lib';
import { BOLD_BASE64, REGULAR_BASE64 } from './fonts.generated';

// A4 in points
const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = { top: 56, bottom: 64, left: 56, right: 56 };
const CONTENT_WIDTH = PAGE.width - MARGIN.left - MARGIN.right;
const LABEL_WIDTH = 150;
const SIZE = { title: 18, subtitle: 11, heading: 11.5, body: 9.5, table: 7.8, footer: 7.5 };
const LEADING = 1.38;
const GREY = rgb(0.4, 0.4, 0.4);
const RULE = rgb(0.82, 0.82, 0.82);

/** Splits a word wider than maxWidth (hashes, IBANs) into pieces that fit. */
function breakWord(word: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (font.widthOfTextAtSize(word, size) <= maxWidth) return [word];
  const pieces: string[] = [];
  let piece = '';
  for (const ch of Array.from(word)) {
    if (piece !== '' && font.widthOfTextAtSize(piece + ch, size) > maxWidth) {
      pieces.push(piece);
      piece = ch;
    } else piece += ch;
  }
  if (piece !== '') pieces.push(piece);
  return pieces;
}

/** Greedy word wrap using real glyph widths. Honours explicit line breaks. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    const words = paragraph
      .split(/\s+/)
      .filter(Boolean)
      .flatMap((w) => breakWord(w, font, size, maxWidth));
    for (const word of words) {
      const candidate = line === '' ? word : `${line} ${word}`;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth || line === '') line = candidate;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

/**
 * Renders a DocumentContent (built by @domik/core) as an A4 PDF.
 * Pure function of its input: fixed metadata dates so the same content gives the same bytes.
 */
export async function renderDocumentPdf(content: DocumentContent): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(Buffer.from(REGULAR_BASE64, 'base64'), { subset: false });
  const bold = await pdf.embedFont(Buffer.from(BOLD_BASE64, 'base64'), { subset: false });

  const supported = new Set(regular.getCharacterSet());
  /** Characters the embedded font cannot draw become "?" instead of breaking the PDF. */
  const safe = (text: string): string =>
    Array.from(text)
      .map((ch) => (ch === '\n' || supported.has(ch.codePointAt(0) ?? 0) ? ch : '?'))
      .join('');

  pdf.setTitle(safe(content.title));
  pdf.setProducer('Domik');
  pdf.setCreator('Domik');
  pdf.setCreationDate(new Date(0));
  pdf.setModificationDate(new Date(0));

  let page: PDFPage = pdf.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - MARGIN.top;

  const ensure = (height: number): void => {
    if (y - height < MARGIN.bottom) {
      page = pdf.addPage([PAGE.width, PAGE.height]);
      y = PAGE.height - MARGIN.top;
    }
  };

  /** Draws wrapped text at x, advancing y. */
  const write = (
    text: string,
    opts: {
      font?: PDFFont;
      size?: number;
      x?: number;
      width?: number;
      color?: ReturnType<typeof rgb>;
    } = {},
  ): void => {
    const font = opts.font ?? regular;
    const size = opts.size ?? SIZE.body;
    const x = opts.x ?? MARGIN.left;
    const width = opts.width ?? CONTENT_WIDTH - (x - MARGIN.left);
    for (const line of wrap(safe(text), font, size, width)) {
      ensure(size * LEADING);
      y -= size * LEADING;
      page.drawText(line, { x, y: y + size * 0.28, size, font, color: opts.color ?? rgb(0, 0, 0) });
    }
  };

  /** A table with a repeated header row; columns get widths proportional to their weights. */
  const drawTable = (table: DocumentTable): void => {
    const size = table.compact ? SIZE.table : SIZE.body;
    const pad = 3;
    const total = table.columns.reduce((sum, c) => sum + c.width, 0);
    const widths = table.columns.map((c) => (c.width / total) * CONTENT_WIDTH);
    const xs = widths.map((_, i) => MARGIN.left + widths.slice(0, i).reduce((a, b) => a + b, 0));
    const lineHeight = size * LEADING;

    const drawRow = (cells: string[], font: PDFFont, shade: boolean): void => {
      const wrapped = cells.map((c, i) =>
        wrap(safe(c || '—'), font, size, (widths[i] ?? 0) - pad * 2),
      );
      const height = Math.max(...wrapped.map((l) => l.length)) * lineHeight + pad;
      if (y - height < MARGIN.bottom) {
        page = pdf.addPage([PAGE.width, PAGE.height]);
        y = PAGE.height - MARGIN.top;
        if (!shade) drawHeader();
      }
      if (shade) {
        page.drawRectangle({
          x: MARGIN.left,
          y: y - height,
          width: CONTENT_WIDTH,
          height,
          color: rgb(0.94, 0.94, 0.94),
        });
      }
      wrapped.forEach((lines, i) => {
        const column = table.columns[i];
        const cellX = xs[i] ?? MARGIN.left;
        const cellW = widths[i] ?? 0;
        lines.forEach((line, n) => {
          const w = font.widthOfTextAtSize(line, size);
          const x = column?.align === 'right' ? cellX + cellW - pad - w : cellX + pad;
          page.drawText(line, { x, y: y - (n + 1) * lineHeight + size * 0.28, size, font });
        });
      });
      y -= height;
      page.drawLine({
        start: { x: MARGIN.left, y },
        end: { x: PAGE.width - MARGIN.right, y },
        thickness: 0.4,
        color: RULE,
      });
    };
    const drawHeader = (): void => {
      drawRow(
        table.columns.map((c) => c.label),
        bold,
        true,
      );
    };

    y -= 2;
    ensure(lineHeight * 3);
    drawHeader();
    for (const row of table.rows) drawRow(row, regular, false);
    y -= 6;
  };

  write(content.title, { font: bold, size: SIZE.title });
  if (content.subtitle) write(content.subtitle, { size: SIZE.subtitle, color: GREY });
  y -= 10;

  for (const section of content.sections) {
    ensure(SIZE.heading * LEADING + SIZE.body * LEADING * 2);
    y -= 8;
    write(section.heading, { font: bold, size: SIZE.heading });
    y -= 2;
    page.drawLine({
      start: { x: MARGIN.left, y },
      end: { x: PAGE.width - MARGIN.right, y },
      thickness: 0.6,
      color: RULE,
    });
    y -= 4;

    for (const [label, value] of section.rows ?? []) {
      const valueLines = wrap(safe(value || '—'), regular, SIZE.body, CONTENT_WIDTH - LABEL_WIDTH);
      const labelLines = wrap(safe(label), regular, SIZE.body, LABEL_WIDTH - 8);
      ensure(Math.max(valueLines.length, labelLines.length) * SIZE.body * LEADING);
      const top = y;
      write(label, { width: LABEL_WIDTH - 8, color: GREY });
      const afterLabel = y;
      y = top;
      write(value || '—', { x: MARGIN.left + LABEL_WIDTH, width: CONTENT_WIDTH - LABEL_WIDTH });
      y = Math.min(y, afterLabel) - 1.5;
    }

    for (const paragraph of section.paragraphs ?? []) {
      write(paragraph);
      y -= 4;
    }

    (section.items ?? []).forEach((item, i) => {
      const marker = `${i + 1}.`;
      ensure(SIZE.body * LEADING);
      const top = y;
      write(marker, { width: 18 });
      y = top;
      write(item, { x: MARGIN.left + 18, width: CONTENT_WIDTH - 18 });
      y -= 3;
    });

    if (section.table) drawTable(section.table);
  }

  if (content.signature) {
    ensure(90);
    y -= 46;
    const half = (CONTENT_WIDTH - 40) / 2;
    const rightX = MARGIN.left + half + 40;
    for (const x of [MARGIN.left, rightX]) {
      page.drawLine({
        start: { x, y },
        end: { x: x + half, y },
        thickness: 0.7,
        color: rgb(0, 0, 0),
      });
    }
    const lineY = y;
    write(content.signature.placeAndDate, { width: half, size: SIZE.footer + 1, color: GREY });
    y = lineY;
    write(content.signature.signer, { x: rightX, width: half, size: SIZE.footer + 1, color: GREY });
  }

  // Footer + page numbers on every page.
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    const footerLines = content.footer
      ? wrap(safe(content.footer), regular, SIZE.footer, CONTENT_WIDTH - 50)
      : [];
    footerLines.forEach((line, n) => {
      p.drawText(line, {
        x: MARGIN.left,
        y: MARGIN.bottom - 22 - n * SIZE.footer * LEADING,
        size: SIZE.footer,
        font: regular,
        color: GREY,
      });
    });
    const label = `${i + 1} / ${pages.length}`;
    p.drawText(label, {
      x: PAGE.width - MARGIN.right - regular.widthOfTextAtSize(label, SIZE.footer),
      y: MARGIN.bottom - 22,
      size: SIZE.footer,
      font: regular,
      color: GREY,
    });
  });

  return pdf.save();
}
