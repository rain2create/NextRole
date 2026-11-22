import path from "node:path";

// HTTP headers are byte strings. RFC 5987 carries the original Unicode filename
// while an ASCII fallback keeps older PDF viewers and download clients working.
export function contentDisposition(fileName: string, download = false) {
  const name = path.basename(fileName).replace(/[\x00-\x1f\x7f]/g, "") || "Resume.pdf";
  const ascii = /^[\x20-\x7e]+$/.test(name)
    ? name
    : `Resume${path.extname(name).replace(/[^a-zA-Z0-9.]/g, "")}`;
  const fallback = ascii.replace(/["\\]/g, "\\$&");
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${download ? "attachment" : "inline"}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
