// Fotos dos lutadores via Wikidata / Wikimedia Commons (licença livre).
// Uma única consulta SPARQL por execução; o resultado fica em data/raw/ como cache.

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { RAW_DIR } from './fetch';

const UA = 'DadosUFC/0.1 (projeto pessoal de estatisticas de MMA)';
const CACHE = path.join(RAW_DIR, 'wikidata-photos.json');

const QUERY = `
SELECT ?f ?name ?img ?dob WHERE {
  { ?f wdt:P2818 ?sherdog } UNION { ?f wdt:P106 wd:Q11607585 }
  ?f wdt:P18 ?img ; rdfs:label ?name .
  FILTER(LANG(?name) = "en")
  OPTIONAL { ?f wdt:P569 ?dob }
}`;

export interface WikiPhoto { qid: string; name: string; file: string; dob: string | null }

export async function fetchWikiPhotos(offline: boolean): Promise<WikiPhoto[]> {
  if (!offline) {
    try {
      const url = 'https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(QUERY);
      const res = await fetch(url, {
        headers: { 'user-agent': UA, accept: 'application/sparql-results+json' },
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { results: { bindings: Record<string, { value: string }>[] } };
      const rows: WikiPhoto[] = json.results.bindings.map((b) => ({
        qid: b.f.value.split('/').pop()!,
        name: b.name.value,
        file: decodeURIComponent(b.img.value.split('/Special:FilePath/')[1] ?? ''),
        dob: b.dob?.value?.slice(0, 10) ?? null,
      }));
      await writeFile(CACHE, JSON.stringify(rows));
      console.log(`  ✓ ${rows.length} fotos no Wikidata`);
      return rows;
    } catch (e) {
      console.warn(`  ! Wikidata indisponível (${(e as Error).message}); usando cache se existir.`);
    }
  }
  try {
    return JSON.parse(await readFile(CACHE, 'utf8'));
  } catch {
    return [];
  }
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

export interface PhotoRef { url: string; page: string }

/** Casa nome (+ data de nascimento, quando houver) com as fotos do Wikidata. */
export function photoMatcher(rows: WikiPhoto[]) {
  const byName = new Map<string, WikiPhoto[]>();
  for (const r of rows) {
    if (!r.file) continue;
    const k = norm(r.name);
    if (!byName.has(k)) byName.set(k, []);
    const list = byName.get(k)!;
    if (!list.some((x) => x.qid === r.qid)) list.push(r); // uma foto por pessoa
  }
  return (name: string, dob: string | null): PhotoRef | null => {
    const cands = byName.get(norm(name)) ?? [];
    let pick: WikiPhoto | undefined;
    if (dob) {
      pick = cands.find((c) => c.dob === dob) ?? cands.find((c) => c.dob?.slice(0, 4) === dob.slice(0, 4));
      // data conhecida dos dois lados e diferente → é outra pessoa
      if (!pick && cands.length === 1 && !cands[0].dob) pick = cands[0];
    } else if (cands.length === 1) {
      pick = cands[0];
    }
    if (!pick) return null;
    const name_ = pick.file.replace(/ /g, '_');
    const f = encodeURIComponent(name_);
    return { url: thumbUrl(name_), page: `https://commons.wikimedia.org/wiki/File:${f}` };
  };
}

/** URL direta da miniatura no upload.wikimedia.org (sem redirecionamento). */
function thumbUrl(file: string): string {
  const md5 = createHash('md5').update(file).digest('hex');
  const f = encodeURIComponent(file);
  const base = `https://upload.wikimedia.org/wikipedia/commons/thumb/${md5[0]}/${md5.slice(0, 2)}/${f}`;
  if (/\.(jpe?g|png|gif|webp)$/i.test(file)) return `${base}/330px-${f}`;
  if (/\.(svg|tiff?)$/i.test(file)) return `${base}/330px-${f}.png`;
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${f}?width=330`;
}
