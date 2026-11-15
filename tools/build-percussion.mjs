// build-percussion.mjs — gera samples/percussao/*.wav a partir de gravações livres (rodar: node tools/build-percussion.mjs).
// 1) baixa as fontes (VCSL — CC0; Freesound — CC0/CC BY) em tools/.fontes/ (fora do git);
// 2) abre o Chrome sem janela (variável CHROME, ou o caminho padrão do Windows) com tools/percussao.html, que
//    decodifica, acha o golpe, corta, normaliza, aplica fade, converte para mono 32 kHz e devolve WAV 16 bits;
// 3) grava samples/percussao/<peça>-forte.wav (golpe X: forte/principal) e <peça>-leve.wav (x: leve/secundário).
//    (nomes sem diferença só de maiúscula: o Windows e o macOS não distinguem X de x.)
// Créditos de cada fonte: samples/CREDITOS.md.
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';

const ROOT = new URL('../', import.meta.url);
const VCSL = 'https://raw.githubusercontent.com/sgossner/VCSL/master/';
const V = p => ({ url: VCSL + encodeURI(p), file: p.split('/').pop() });
const FS = id => ({ freesound: id, file: `fs-${id}.mp3` });

// peça: { X: [fonte, segundos, qual golpe ('forte' | 'medio')], x: … }
export const PLAN = {
  bumbo: { X: [FS(860524), 0.7] },                                                     // lennartgreen — CC0
  caixa: { X: [V('Membranophones/Struck Membranophones/Snare Drum, Modern 1/Snare2_HitSN_v7_rr1_Mid.wav'), 0.45],
    x: [V('Membranophones/Struck Membranophones/Snare Drum, Modern 1/Snare2_HitSN_v3_rr1_Mid.wav'), 0.3] },
  chimbal: { X: [V('Idiophones/Struck Idiophones/Hi-Hat Cymbal/HiHat_HitC_v3_rr1_Mid.wav'), 0.25],
    x: [V('Idiophones/Struck Idiophones/Hi-Hat Cymbal/HiHat_HitC_v1_rr1_Mid.wav'), 0.18] },
  surdo: { X: [V('Membranophones/Struck Membranophones/Bass Drum 1/BDrumNew_hit_v5_rr1_Sum.wav'), 1.2],
    x: [V('Membranophones/Struck Membranophones/Bass Drum 1/BDrumNew_hit_v2_rr1_Sum.wav'), 0.16] },           // abafado: corte curto
  zabumba: { X: [FS(511275), 0.7],                                                      // alfaia — Sassaby, CC0
    x: [V('Membranophones/Struck Membranophones/Tom 1/TomH_rimS_v2_rr1_Mid.wav'), 0.12] },                    // bacalhau (aro)
  triangulo: { X: [V('Idiophones/Struck Idiophones/Triangles/Triangle1_Hit_v2_rr1_Mid.wav'), 1.3],
    x: [V('Idiophones/Struck Idiophones/Triangles/Triangle1_HitM_v1_rr2_Mid.wav'), 0.15] },
  pandeiro: { X: [FS(182567), 0.3], x: [FS(182566), 0.2] },                              // Paulo Gonçalves — CC BY 4.0
  tamborim: { X: [FS(844753), 0.22, 'forte'], x: [FS(844753), 0.18, 'medio'] },          // MeanRaccoon — CC0
  ganza: { X: [V('Idiophones/Struck Idiophones/Shaker, Small/Mid_ShakerHighFaster_Down_rr1.wav'), 0.2],
    x: [V('Idiophones/Struck Idiophones/Shaker, Small/Mid_ShakerHighFaster_Up_rr1.wav'), 0.15] },
  agogo: { X: [V('Idiophones/Struck Idiophones/Agogo Bells/Agogo_High_v2_rr1_Mid.wav'), 0.6],
    x: [V('Idiophones/Struck Idiophones/Agogo Bells/Agogo_Low_v1_rr1_Mid.wav'), 0.6] },
  conga: { X: [V('Membranophones/Struck Membranophones/Conga/Conga_HitN_v3_rr1_Sum.wav'), 0.55],
    x: [V('Membranophones/Struck Membranophones/Conga/Conga_HitFM_v2_rr1_Sum.wav'), 0.25] },                  // tapa
  palmas: { X: [V('Idiophones/Struck Idiophones/Claps/Clap_rr1.wav'), 0.35], x: [V('Idiophones/Struck Idiophones/Claps/SoloClap_vl2.wav'), 0.25] },
  clave: { X: [V('Idiophones/Struck Idiophones/Claves/Claves1_Hit_v3_rr1_Mid.wav'), 0.3],
    x: [V('Idiophones/Struck Idiophones/Claves/Claves1_Hit_v1_rr1_Mid.wav'), 0.25] },
};

const SRC = new URL('tools/.fontes/', ROOT), OUT = new URL('samples/percussao/', ROOT);
await mkdir(SRC, { recursive: true });
await mkdir(OUT, { recursive: true });

// 1) Fontes
async function download(src) {
  const dest = new URL(src.file, SRC);
  try { await access(dest); return; } catch { /* baixa */ }
  let url = src.url;
  if (src.freesound) { // a prévia em MP3 (alta) é pública; o endereço está na página do som
    const page = await (await fetch(`https://freesound.org/s/${src.freesound}/`, { headers: { 'User-Agent': 'Mozilla/5.0' } })).text();
    url = page.match(/https:\/\/cdn\.freesound\.org\/previews\/[^"]+-hq\.mp3/)[0];
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${src.file}: HTTP ${res.status}`);
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
  console.log('baixado', src.file);
}
for (const part of Object.values(PLAN)) for (const v of Object.values(part)) await download(v[0]);

// 2) Processamento no Chrome
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const body = await readFile(new URL('.' + path, ROOT));
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end(); }
}).listen(0);
const port = server.address().port;
const chromePath = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--remote-debugging-port=9335', `--user-data-dir=${join(tmpdir(), 'perc-build')}`, 'about:blank']);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let tabs;
for (let i = 0; i < 60 && !tabs; i++) { try { tabs = await (await fetch('http://127.0.0.1:9335/json')).json(); } catch { await sleep(250); } }
const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => { ws.onopen = r; });
let seq = 0;
const pend = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); pend.get(m.id)?.(m); pend.delete(m.id); };
const send = (method, params = {}) => new Promise(r => { const id = ++seq; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
await send('Page.navigate', { url: `http://127.0.0.1:${port}/tools/percussao.html` });
await sleep(1000);
const jobs = Object.entries(PLAN).flatMap(([part, v]) => Object.entries(v).map(([k, [src, secs, pick]]) =>
  ({ out: `${part}-${k === 'X' ? 'forte' : 'leve'}.wav`, src: `.fontes/${src.file}`, secs, pick: pick || 'forte' })));
const r = await send('Runtime.evaluate', { expression: `processAll(${JSON.stringify(jobs)})`, awaitPromise: true, returnByValue: true });
if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
let total = 0;
for (const [file, b64] of Object.entries(r.result.result.value)) {
  const buf = Buffer.from(b64, 'base64');
  total += buf.length;
  await writeFile(new URL(file, OUT), buf);
  console.log(file, `${(buf.length / 1024).toFixed(0)} KB`);
}
console.log(`total ${(total / 1024).toFixed(0)} KB`);
chrome.kill();
server.close();
process.exit(0);
