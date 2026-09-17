import { createServer } from "node:http";
import { readFile, realpath } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import { ROOT } from "./release-lib.mjs";

const root = await realpath(join(ROOT, ".release/site"));
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png" };
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith("/flashlearn/")) { res.writeHead(404); return res.end(); }
    let path = decodeURIComponent(url.pathname.slice("/flashlearn/".length));
    if (!path || path.endsWith("/")) path += "index.html";
    const target = await realpath(join(root, path));
    if (relative(root, target).startsWith(`..${sep}`)) throw new Error("outside root");
    const content = await readFile(target);
    res.writeHead(200, { "content-type": types[extname(target)] ?? "application/octet-stream" });
    res.end(req.method === "HEAD" ? undefined : content);
  } catch { res.writeHead(404); res.end("Not found"); }
}).listen(4182, "127.0.0.1", () => console.log("Preview: http://127.0.0.1:4182/flashlearn/"));
