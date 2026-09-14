// Test-only static listener. Port 0 stays owned by this server from listen to close.
// No child process, external server reuse, runtime API, or filesystem writes.
import { createServer } from "node:http";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
  ".flac": "audio/flac",
  ".wav": "audio/wav",
  ".wasm": "application/wasm",
};

export async function startBrowserTestServer() {
  const root = await realpath(
    fileURLToPath(new URL("../web/", import.meta.url)),
  );
  const server = createServer(async (request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405).end();
      return;
    }
    try {
      const pathname = decodeURIComponent(
        new URL(request.url, "http://localhost").pathname,
      );
      const parts = pathname.split("/");
      if (
        pathname.includes("\\") ||
        pathname.includes("\0") ||
        parts.some(
          (part) =>
            part.startsWith(".") ||
            /^(?:api|save\.dat|save\.json|save\.webmeta\.json)$/i.test(part),
        )
      ) {
        response.writeHead(403).end();
        return;
      }
      const resource = await realpath(
        path.join(root, pathname === "/" ? "index.html" : pathname),
      );
      const relative = path.relative(root, resource);
      if (
        relative.startsWith(`..${path.sep}`) ||
        relative === ".." ||
        path.isAbsolute(relative)
      ) {
        response.writeHead(403).end();
        return;
      }
      const bytes = await readFile(resource);
      response.writeHead(200, {
        "Content-Type":
          contentTypes[path.extname(resource)] || "application/octet-stream",
        "Content-Length": bytes.length,
        "Cache-Control": "no-store",
      });
      response.end(request.method === "HEAD" ? undefined : bytes);
    } catch (error) {
      response.writeHead(error instanceof URIError ? 400 : 404).end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  let closing;
  return {
    port,
    close() {
      closing ??= new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
      return closing;
    },
  };
}
