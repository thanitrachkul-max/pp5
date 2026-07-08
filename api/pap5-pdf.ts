import type { IncomingMessage, ServerResponse } from "node:http";
import { createPap5PdfHttpResult, parsePap5PdfRequestPayload } from "../src/server/pap5PdfHttp.js";

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function getOrigin(req: IncomingMessage) {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  const host = req.headers["x-forwarded-host"] ?? req.headers.host;
  return `${proto || "https"}://${Array.isArray(host) ? host[0] : host}`;
}

function getHeaderValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value.join("; ") : value;
}

function getPrintRouteHeaders(req: IncomingMessage) {
  const headers: Record<string, string> = {};
  const cookie = getHeaderValue(req.headers.cookie);
  const bypass = getHeaderValue(req.headers["x-vercel-protection-bypass"]);
  const authorization = getHeaderValue(req.headers.authorization);

  if (cookie) headers.cookie = cookie;
  if (bypass) headers["x-vercel-protection-bypass"] = bypass;
  if (authorization) headers.authorization = authorization;

  return headers;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message;
  const message = String(error ?? "").trim();
  return message || "Pap5 PDF export failed";
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  try {
    const rawBody = await readRequestBody(req);
    const payload = parsePap5PdfRequestPayload(rawBody, getHeaderValue(req.headers["content-type"]) ?? "");
    const result = await createPap5PdfHttpResult({
      payload,
      origin: getOrigin(req),
      headers: getPrintRouteHeaders(req),
    });

    res.statusCode = result.status;
    Object.entries(result.headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    res.end(result.body);
  } catch (error) {
    console.error("Pap5 PDF export failed", error);
    const message = getErrorMessage(error);
    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: message }));
  }
}
