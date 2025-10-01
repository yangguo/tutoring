// PDF utilities: convert a PDF File into page images (PNG blobs)
// Uses pdfjs-dist with a worker via Vite's ?worker import.

// pdfjs-dist ESM build
// eslint-disable-next-line import/no-unresolved
import * as pdfjsLib from 'pdfjs-dist';
// Vite worker import to initialize PDF.js worker
// eslint-disable-next-line import/no-unresolved
// @ts-ignore - Vite query import provides a Worker constructor
import PDFWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker';

// Initialize worker (must be done once)
// @ts-ignore - types for workerPort are not exported in pdfjs types
pdfjsLib.GlobalWorkerOptions.workerPort = new PDFWorker();

export interface PageImage {
  pageNumber: number;
  blob: Blob;
}

/**
 * Convert a PDF file into PNG page images.
 * - Renders each page to an offscreen canvas and exports as PNG blob.
 * - Returns images in page-number order starting from startPage.
 * - Optional startPage and endPage to convert partial pages.
 */
export async function convertPdfFileToImages(file: File, scale = 2, startPage = 1, endPage?: number): Promise<PageImage[]> {
  if (file.type !== 'application/pdf') {
    throw new Error('File is not a PDF');
  }

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  const actualEndPage = endPage ? Math.min(endPage, pdf.numPages) : pdf.numPages;
  if (startPage > actualEndPage) {
    return [];
  }

  const images: PageImage[] = [];
  for (let pageNum = startPage; pageNum <= actualEndPage; pageNum++) {
    // eslint-disable-next-line no-await-in-loop
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    // Create a canvas (prefer OffscreenCanvas when available)
    const useOffscreen = typeof (globalThis as any).OffscreenCanvas !== 'undefined';
    const canvas: HTMLCanvasElement | OffscreenCanvas = useOffscreen
      ? new (globalThis as any).OffscreenCanvas(viewport.width, viewport.height)
      : ((): HTMLCanvasElement => {
          const c = document.createElement('canvas');
          c.width = Math.ceil(viewport.width);
          c.height = Math.ceil(viewport.height);
          return c;
        })();

    // Get 2D context
    // @ts-ignore - OffscreenCanvas has getContext but TS lib typing may vary
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Failed to create canvas context');

    const renderTask = page.render({ canvasContext: ctx as any, viewport });
    // eslint-disable-next-line no-await-in-loop
    await renderTask.promise;

    // Export to blob
    let blob: Blob;
    if (useOffscreen) {
      // @ts-ignore OffscreenCanvas supports convertToBlob
      blob = await (canvas as any).convertToBlob({ type: 'image/png' });
    } else {
      const htmlCanvas = canvas as HTMLCanvasElement;
      // Convert canvas to blob
      // eslint-disable-next-line no-await-in-loop
      blob = await new Promise<Blob>((resolve, reject) => {
        htmlCanvas.toBlob((b) => {
          if (b) resolve(b);
          else reject(new Error('Canvas toBlob failed'));
        }, 'image/png');
      });
    }

    images.push({ pageNumber: pageNum, blob });
  }

  return images;
}

/**
 * Extract text content from specific PDF pages.
 * - Uses pdfjs to get text content per page.
 * - Returns text in page-number order.
 */
export interface PageText {
  pageNumber: number;
  text: string;
}

export async function extractPdfTextPerPage(file: File, pageNumbers?: number[]): Promise<PageText[]> {
  if (file.type !== 'application/pdf') {
    throw new Error('File is not a PDF');
  }

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  const allPageNumbers = pageNumbers || Array.from({ length: pdf.numPages }, (_, i) => i + 1);
  const texts: PageText[] = [];

  for (const pageNum of allPageNumbers) {
    if (pageNum > pdf.numPages) continue;

    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const textItems = textContent.items.map(item => (item as any).str).join(' ');
    texts.push({ pageNumber: pageNum, text: textItems.trim() });
  }

  return texts;
}

/**
 * Get the total number of pages in a PDF file.
 */
export async function getPdfPageCount(file: File): Promise<number> {
  if (file.type !== 'application/pdf') {
    throw new Error('File is not a PDF');
  }

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  return pdf.numPages;
}
