// Minimal .xlsx reader (first worksheet -> string grid) with no dependency: an xlsx is a zip of XML files, and the platform
// provides DecompressionStream (browsers and Node 18+). Handles shared strings, inline strings and numeric cells (dates and
// times arrive as Excel serial numbers; parse.ts understands those). Not a general spreadsheet library: no formulas, styles or
// multiple sheets.

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** All entries of a zip as name -> (lazy) bytes. */
export async function readZip(buffer: ArrayBuffer): Promise<Map<string, () => Promise<Uint8Array>>> {
  const bytes = new Uint8Array(buffer);
  const v = new DataView(buffer);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (v.getUint32(i, true) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("This is not a valid .xlsx file");
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const files = new Map<string, () => Promise<Uint8Array>>();
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (v.getUint32(p, true) !== SIG_CENTRAL) throw new Error("Corrupt .xlsx file");
    const method = v.getUint16(p + 10, true);
    const compSize = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const commentLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    files.set(name, async () => {
      if (v.getUint32(local, true) !== SIG_LOCAL) throw new Error("Corrupt .xlsx file");
      const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
      const raw = bytes.subarray(start, start + compSize);
      if (method === 0) return raw;
      if (method === 8) return inflateRaw(raw);
      throw new Error("Unsupported compression in .xlsx");
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const decodeEntities = (s: string) =>
  s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

const textOf = (xml: string) => [...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeEntities(m[1])).join("");

/** "C12" -> zero-based column 2. */
const colIndex = (ref: string) => {
  let n = 0;
  for (const ch of ref.replace(/[^A-Z]/gi, "").toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
};

/** Parses worksheet XML (and the shared string list) into a grid of strings. Exported for tests. */
export function sheetToGrid(sheetXml: string, shared: string[]): string[][] {
  const grid: string[][] = [];
  for (const rowM of sheetXml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rn = /\br="(\d+)"/.exec(rowM[1])?.[1];
    const r = rn ? +rn - 1 : grid.length;
    const cells: string[] = [];
    for (const cM of (rowM[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cM[1];
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const type = /\bt="(\w+)"/.exec(attrs)?.[1];
      const inner = cM[2] ?? "";
      let value = "";
      if (type === "inlineStr") value = textOf(inner);
      else {
        const raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? "";
        value = type === "s" ? (shared[+raw] ?? "") : decodeEntities(raw);
      }
      cells[ref ? colIndex(ref) : cells.length] = value.trim();
    }
    while (grid.length < r) grid.push([]);
    grid[r] = Array.from(cells, (c) => c ?? "");
  }
  return grid.filter((row) => row.some((c) => c !== ""));
}

/** Reads the first worksheet of an .xlsx into a grid (first row = headers). */
export async function parseXlsx(buffer: ArrayBuffer): Promise<string[][]> {
  const files = await readZip(buffer);
  const dec = new TextDecoder();
  const read = async (name: string) => {
    const f = files.get(name);
    return f ? dec.decode(await f()) : null;
  };
  const sharedXml = await read("xl/sharedStrings.xml");
  const shared = sharedXml ? [...sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1])) : [];

  // First sheet in workbook order -> its relationship target.
  let path = "xl/worksheets/sheet1.xml";
  const wb = await read("xl/workbook.xml");
  const rels = await read("xl/_rels/workbook.xml.rels");
  const rid = wb ? /<sheet\b[^>]*\br:id="([^"]+)"/.exec(wb)?.[1] : null;
  if (rid && rels) {
    for (const m of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
      if (new RegExp(`\\bId="${rid}"`).test(m[1])) {
        const target = /\bTarget="([^"]+)"/.exec(m[1])?.[1];
        if (target) path = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
      }
    }
  }
  const sheet = (await read(path)) ?? (await read("xl/worksheets/sheet1.xml"));
  if (!sheet) throw new Error("No worksheet found in this .xlsx");
  return sheetToGrid(sheet, shared);
}
