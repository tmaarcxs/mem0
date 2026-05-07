import { NextRequest } from "next/server";
import { getServerApiUrl } from "@/lib/server-api-url";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-length",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function targetUrl(request: NextRequest, path: string[]) {
  const url = new URL(request.url);
  const target = new URL(
    path.join("/"),
    `${getServerApiUrl().replace(/\/+$/, "")}/`,
  );
  target.search = url.search;
  return target;
}

function forwardedHeaders(request: NextRequest) {
  const headers = new Headers(request.headers);
  for (const header of HOP_BY_HOP_HEADERS) headers.delete(header);
  headers.delete("host");
  return headers;
}

async function proxy(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const response = await fetch(targetUrl(request, path), {
    method: request.method,
    headers: forwardedHeaders(request),
    body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });

  const headers = new Headers(response.headers);
  for (const header of HOP_BY_HOP_HEADERS) headers.delete(header);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
