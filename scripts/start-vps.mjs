import { createServer } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Readable } from "node:stream";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");

const candidates = [
  resolve(rootDir, ".output/server/index.mjs"),
  resolve(rootDir, "dist/server/index.mjs"),
];

const entryPath = candidates.find((candidate) => existsSync(candidate));

if (!entryPath) {
  console.error("Build do servidor não encontrado. Rode: bun run build:vps");
  process.exit(1);
}

const mod = await import(pathToFileURL(entryPath).href);
const entry = mod.default ?? mod;
const fetchHandler = entry.fetch ?? mod.fetch;

if (typeof fetchHandler !== "function") {
  console.error(`O arquivo ${entryPath} não exporta um handler fetch válido.`);
  process.exit(1);
}

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";
const publicDir = resolve(rootDir, "dist/client");

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

async function fetchStaticAsset(request) {
  const url = new URL(request.url);
  const safePath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const filePath = resolve(publicDir, safePath || "index.html");

  if (!filePath.startsWith(publicDir)) return new Response("Not found", { status: 404 });

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) return new Response("Not found", { status: 404 });

    const extension = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
    return new Response(Readable.toWeb(createReadStream(filePath)), {
      headers: {
        "content-type": contentTypes[extension] || "application/octet-stream",
        "cache-control": safePath.includes("assets/")
          ? "public, max-age=31536000, immutable"
          : "public, max-age=300",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

function toWebRequest(req) {
  const proto = req.headers["x-forwarded-proto"]?.toString() || "http";
  const requestHost = req.headers.host || `127.0.0.1:${port}`;
  const url = `${proto}://${requestHost}${req.url || "/"}`;
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "undefined") continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.set(key, value);
    }
  }

  const init = {
    method: req.method,
    headers,
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = req;
    init.duplex = "half";
  }

  return new Request(url, init);
}

function writeWebResponse(res, webResponse) {
  res.statusCode = webResponse.status;
  res.statusMessage = webResponse.statusText;

  const setCookies =
    typeof webResponse.headers.getSetCookie === "function"
      ? webResponse.headers.getSetCookie()
      : [];

  webResponse.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie" && setCookies.length) return;
    res.setHeader(key, value);
  });

  if (setCookies.length) res.setHeader("set-cookie", setCookies);

  if (!webResponse.body) {
    res.end();
    return;
  }

  Readable.fromWeb(webResponse.body).pipe(res);
}

const server = createServer(async (req, res) => {
  try {
    const webRequest = toWebRequest(req);
    const webResponse = await fetchHandler(
      webRequest,
      { ...process.env, ASSETS: { fetch: fetchStaticAsset } },
      { waitUntil: () => undefined },
    );
    writeWebResponse(res, webResponse);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("content-type", "text/plain; charset=utf-8");
    }
    res.end("Erro interno do servidor");
  }
});

server.listen(port, host, () => {
  console.log(`Portal VOD online em http://${host}:${port}`);
  console.log(`Entrada carregada: ${entryPath}`);
});