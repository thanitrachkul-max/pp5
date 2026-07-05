import { Buffer } from "node:buffer";
import { PDFDocument } from "pdf-lib";
import type { Browser } from "puppeteer-core";
import { getPap5PrintPageSpecs } from "../utils/pap5PrintLayout.js";
import type { AppData, GradebookApprovalStatus } from "../types";

export interface Pap5PdfPayload {
  id?: string;
  data: AppData;
  approvalStatus?: GradebookApprovalStatus | null;
}

export interface Pap5PdfGenerateOptions {
  origin: string;
  headers?: Record<string, string>;
}

const PDF_MARGIN_ZERO = {
  top: "0mm",
  right: "0mm",
  bottom: "0mm",
  left: "0mm",
};

const A4_POINTS = {
  portrait: { width: 595.28, height: 841.89 },
  landscape: { width: 841.89, height: 595.28 },
} as const;

const PAGE_SIZE_TOLERANCE_PT = 2;

function safePrintId(value: string | undefined) {
  return encodeURIComponent(value || `pap5-${Date.now()}`);
}

async function appendPdf(target: PDFDocument, sourceBytes: Uint8Array) {
  const source = await PDFDocument.load(sourceBytes);
  const pages = await target.copyPages(source, source.getPageIndices());
  pages.forEach((page) => target.addPage(page));
}

function isCloseToA4(actual: number, expected: number) {
  return Math.abs(actual - expected) <= PAGE_SIZE_TOLERANCE_PT;
}

export async function assertPap5PdfPageSizes(
  pdfBytes: Uint8Array,
  specs: ReturnType<typeof getPap5PrintPageSpecs>,
) {
  const pdf = await PDFDocument.load(pdfBytes);
  const pages = pdf.getPages();

  if (pages.length !== specs.length) {
    throw new Error(`Pap5 PDF page count mismatch: expected ${specs.length}, got ${pages.length}`);
  }

  const results = pages.map((page, index) => {
    const { width, height } = page.getSize();
    const expected = A4_POINTS[specs[index].orientation];
    const ok =
      isCloseToA4(width, expected.width) &&
      isCloseToA4(height, expected.height);

    if (!ok) {
      throw new Error(
        `Pap5 PDF page ${index + 1} size mismatch: expected ${expected.width.toFixed(0)}x${expected.height.toFixed(0)} pt, got ${width.toFixed(2)}x${height.toFixed(2)} pt`,
      );
    }

    return {
      page: index + 1,
      id: specs[index].id,
      orientation: specs[index].orientation,
      width,
      height,
    };
  });

  return results;
}

async function renderSinglePagePdf({
  browser,
  origin,
  printId,
  payload,
  pageId,
  landscape,
  headers,
}: {
  browser: Browser;
  origin: string;
  printId: string;
  payload: Pap5PdfPayload;
  pageId: string;
  landscape: boolean;
  headers?: Record<string, string>;
}) {
  const page = await browser.newPage();
  if (headers && Object.keys(headers).length > 0) {
    await page.setExtraHTTPHeaders(headers);
  }

  await page.evaluateOnNewDocument(
    ({ storageKey, storagePayload }) => {
      (window as typeof window & { __PAP5_PRINT_PAYLOAD__?: unknown }).__PAP5_PRINT_PAYLOAD__ = storagePayload;
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(storagePayload));
      } catch {
        // Large gradebooks can exceed localStorage quota; the in-memory payload above is primary.
      }
    },
    {
      storageKey: `pap5-print-payload:${printId}`,
      storagePayload: payload,
    },
  );

  try {
    await page.goto(`${origin}/print/pap5/${printId}?page=${encodeURIComponent(pageId)}`, {
      waitUntil: "networkidle0",
    });
    await page.waitForSelector("[data-pap5-ready='true']", { timeout: 30_000 });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        Array.from(document.images)
          .filter((image) => !image.complete)
          .map((image) => new Promise((resolve) => {
            image.addEventListener("load", resolve, { once: true });
            image.addEventListener("error", resolve, { once: true });
          })),
      );
    });

    return await page.pdf({
      format: "A4",
      landscape,
      printBackground: true,
      displayHeaderFooter: false,
      preferCSSPageSize: true,
      margin: PDF_MARGIN_ZERO,
      scale: 1,
    });
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function launchChromium() {
  const { default: puppeteer } = await import("puppeteer-core");

  if (process.env.VERCEL) {
    const { default: serverlessChromium } = await import("@sparticuz/chromium");
    return puppeteer.launch({
      args: serverlessChromium.args,
      executablePath: await serverlessChromium.executablePath(),
      headless: "shell",
    });
  }

  const { chromium: playwrightChromium } = await import("playwright");
  return puppeteer.launch({
    executablePath: playwrightChromium.executablePath(),
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
}

export async function generatePap5Pdf(
  payload: Pap5PdfPayload,
  options: Pap5PdfGenerateOptions,
) {
  const printId = safePrintId(payload.id);
  const specs = getPap5PrintPageSpecs(payload.data);
  const merged = await PDFDocument.create();
  const browser = await launchChromium();

  try {
    for (const spec of specs) {
      const pagePdf = await renderSinglePagePdf({
        browser,
        origin: options.origin,
        printId,
        payload,
        pageId: spec.id,
        landscape: spec.orientation === "landscape",
        headers: options.headers,
      });
      await appendPdf(merged, pagePdf);
    }
  } finally {
    await browser.close();
  }

  const bytes = await merged.save();
  await assertPap5PdfPageSizes(bytes, specs);
  return Buffer.from(bytes);
}
