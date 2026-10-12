// Склейка нескольких .docx в один (отзыв пилота 2026-10-12): претензия → СЗ →
// решение одним файлом. Word для этого не нужен — он нужен только для PDF.
//
// Почему не вставка через Word (InsertFile): Word отдаёт вставленному тексту
// стили и раздел документа-приёмника. У СЗ и решения по умолчанию отступ после
// абзаца 8 пт и интервал 1,08, у претензии — ноль: в общем файле они слипались
// бы. А задать вставленному разделу свои поля Word на машине пилота отказался.
//
// Как устроено:
//   - основа — первый документ (его стили, бланк, колонтитулы);
//   - каждый документ — отдельный раздел со своими полями (sectPr вешается на
//     последний абзац документа = разрыв раздела «со следующей страницы»);
//   - колонтитулы первого документа у остальных разделов заменяются пустыми,
//     иначе бланк претензии переехал бы на СЗ и решение;
//   - всё, что документ брал из своих настроек по умолчанию (интервалы, размер
//     и шрифт текста), прописывается прямо в абзацы и прогоны — тогда стили
//     основы на него не влияют.
// Картинки, списки, сноски, примечания во 2-м и следующих документах не
// поддерживаются: бросаем MergeError, вызывающий сохранит документы по отдельности.

import PizZip from "pizzip";

export class MergeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MergeError";
  }
}

const NS_W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const REL_HEADER = `${NS_R}/header`;
const REL_FOOTER = `${NS_R}/footer`;
const CT_HEADER = "application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml";
const CT_FOOTER = "application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml";

// Порядок дочерних элементов по схеме OOXML. Word не открывает документ,
// если элементы в pPr / rPr стоят не по порядку.
const PPR_ORDER = [
  "pStyle", "keepNext", "keepLines", "pageBreakBefore", "framePr", "widowControl", "numPr",
  "suppressLineNumbers", "pBdr", "shd", "tabs", "suppressAutoHyphens", "kinsoku", "wordWrap",
  "overflowPunct", "topLinePunct", "autoSpaceDE", "autoSpaceDN", "bidi", "adjustRightInd",
  "snapToGrid", "spacing", "ind", "contextualSpacing", "mirrorIndents", "suppressOverlap", "jc",
  "textDirection", "textAlignment", "textboxTightWrap", "outlineLvl", "divId", "cnfStyle", "rPr",
  "sectPr", "pPrChange",
];
const RPR_ORDER = [
  "rStyle", "rFonts", "b", "bCs", "i", "iCs", "caps", "smallCaps", "strike", "dstrike", "outline",
  "shadow", "emboss", "imprint", "noProof", "snapToGrid", "vanish", "webHidden", "color", "spacing",
  "w", "kern", "position", "sz", "szCs", "highlight", "u", "effect", "bdr", "shd", "fitText",
  "vertAlign", "rtl", "cs", "em", "lang", "eastAsianLayout", "specVanish", "oMath", "rPrChange",
];
const RUN_WRAPPERS = [
  "w:ins", "w:del", "w:hyperlink", "w:smartTag", "w:customXml", "w:sdt", "w:sdtContent",
  "w:fldSimple", "w:moveTo", "w:moveFrom", "w:dir", "w:bdo",
];
const SPACING_ATTRS = ["before", "after", "line", "lineRule"];
const FONT_SLOTS = [
  ["ascii", "asciiTheme"],
  ["hAnsi", "hAnsiTheme"],
  ["eastAsia", "eastAsiaTheme"],
  ["cs", "cstheme"],
] as const;

type Attrs = Record<string, string>;
type Props = { spacing: Attrs; sz?: string; szCs?: string; fonts: Attrs };
type Style = { id: string; type: string; isDefault: boolean; basedOn?: string; props: Props; xml: string };

// ───────── Мини-разбор XML (документы Word предсказуемы, полный парсер не нужен) ─────────

const TAG = /<(\/?)([A-Za-z_][\w.-]*(?::[\w.-]+)?)((?:\s+[^\s=>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;

/// Делит содержимое на элементы верхнего уровня (текст между ними отбрасывается).
function topLevel(xml: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = -1;
  TAG.lastIndex = 0;
  for (let m = TAG.exec(xml); m; m = TAG.exec(xml)) {
    const [whole, closing, , , selfClosing] = m;
    if (closing) {
      depth--;
      if (depth === 0) out.push(xml.slice(start, m.index + whole.length));
    } else if (selfClosing) {
      if (depth === 0) out.push(whole);
    } else {
      if (depth === 0) start = m.index;
      depth++;
    }
  }
  if (depth !== 0) throw new MergeError("повреждённая разметка документа");
  return out;
}

/// Полное имя элемента с префиксом: "<w:r w:rsid=…>" → "w:r".
function qname(el: string): string {
  const m = /^<([\w.-]+(?::[\w.-]+)?)/.exec(el);
  return m ? m[1] : "";
}

function localName(el: string): string {
  const m = /^<(?:[\w.-]+:)?([\w.-]+)/.exec(el);
  return m ? m[1] : "";
}

function parseAttrs(startTag: string): Attrs {
  const out: Attrs = {};
  const re = /([^\s=<>/]+)\s*=\s*"([^"]*)"/g;
  for (let m = re.exec(startTag); m; m = re.exec(startTag)) out[m[1]] = m[2];
  return out;
}

/// Атрибуты w:* без префикса: { after: "160", line: "259" }.
function wAttrs(el: string): Attrs {
  const out: Attrs = {};
  for (const [k, v] of Object.entries(parseAttrs(el.slice(0, el.indexOf(">") + 1)))) {
    if (k.startsWith("w:")) out[k.slice(2)] = v;
  }
  return out;
}

function attrsToString(a: Attrs): string {
  return Object.entries(a)
    .map(([k, v]) => ` w:${k}="${v}"`)
    .join("");
}

/// Содержимое элемента: "<w:pPr a>INNER</w:pPr>" → INNER (самозакрытый → "").
function inner(el: string): string {
  if (el.endsWith("/>") && !el.includes("</")) return "";
  return el.slice(el.indexOf(">") + 1, el.lastIndexOf("</"));
}

function openTag(el: string): string {
  const head = el.slice(0, el.indexOf(">") + 1);
  return head.endsWith("/>") ? head.slice(0, -2).trimEnd() + ">" : head;
}

/// Первый дочерний элемент с заданным локальным именем.
function child(container: string, name: string): string | undefined {
  return topLevel(inner(container)).find((c) => localName(c) === name);
}

/// Ставит/заменяет дочерний элемент `name` в контейнере с соблюдением порядка схемы.
function setChild(container: string, name: string, el: string, order: string[]): string {
  const kids = topLevel(inner(container));
  const idx = kids.findIndex((c) => localName(c) === name);
  if (idx >= 0) {
    kids[idx] = el;
  } else {
    const rank = order.indexOf(name);
    const pos = kids.findIndex((c) => order.indexOf(localName(c)) > rank);
    kids.splice(pos < 0 ? kids.length : pos, 0, el);
  }
  const tag = openTag(container);
  const close = `</${tag.slice(1).split(/[\s>]/)[0]}>`;
  return tag + kids.join("") + close;
}

// ───────── Свойства по умолчанию и стили документа-части ─────────

function readProps(pPr: string | undefined, rPr: string | undefined): Props {
  const props: Props = { spacing: {}, fonts: {} };
  const sp = pPr && child(pPr, "spacing");
  if (sp) for (const a of SPACING_ATTRS) if (wAttrs(sp)[a] !== undefined) props.spacing[a] = wAttrs(sp)[a];
  if (rPr) {
    const sz = child(rPr, "sz");
    const szCs = child(rPr, "szCs");
    const fonts = child(rPr, "rFonts");
    if (sz) props.sz = wAttrs(sz).val;
    if (szCs) props.szCs = wAttrs(szCs).val;
    if (fonts) props.fonts = wAttrs(fonts);
  }
  return props;
}

/// Наложение свойств: более конкретный уровень перекрывает общий.
function overlay(base: Props, top: Props): Props {
  const fonts = { ...base.fonts };
  // Слот шрифта (ascii / hAnsi / …) переопределяется целиком: тема или явное имя.
  for (const [plain, theme] of FONT_SLOTS) {
    if (top.fonts[plain] !== undefined || top.fonts[theme] !== undefined) {
      delete fonts[plain];
      delete fonts[theme];
      if (top.fonts[plain] !== undefined) fonts[plain] = top.fonts[plain];
      if (top.fonts[theme] !== undefined) fonts[theme] = top.fonts[theme];
    }
  }
  return {
    spacing: { ...base.spacing, ...top.spacing },
    sz: top.sz ?? base.sz,
    szCs: top.szCs ?? base.szCs,
    fonts,
  };
}

type Theme = { minor: Attrs; major: Attrs };

function readTheme(zip: PizZip): Theme {
  const xml = zip.file("word/theme/theme1.xml")?.asText() ?? "";
  const font = (block: string, kind: string) => {
    const m = new RegExp(`<a:${block}>[\\s\\S]*?<a:${kind} typeface="([^"]*)"`).exec(xml);
    return m ? m[1] : "";
  };
  return {
    minor: { latin: font("minorFont", "latin"), ea: font("minorFont", "ea"), cs: font("minorFont", "cs") },
    major: { latin: font("majorFont", "latin"), ea: font("majorFont", "ea"), cs: font("majorFont", "cs") },
  };
}

/// Шрифты темы → явные имена: тема основы может отличаться от темы части.
function resolveFonts(fonts: Attrs, theme: Theme): Attrs {
  const out: Attrs = {};
  for (const [plain, themeAttr] of FONT_SLOTS) {
    const t = fonts[themeAttr];
    if (t) {
      const set = t.startsWith("major") ? theme.major : theme.minor;
      const name = t.endsWith("EastAsia") ? set.ea : t.endsWith("Bidi") ? set.cs : set.latin;
      if (name) out[plain] = name;
    } else if (fonts[plain] !== undefined) {
      out[plain] = fonts[plain];
    }
  }
  // Подсказка шрифта и прочие атрибуты rFonts (hint) не влияют на вид — не переносим.
  return out;
}

type PartStyles = {
  defaults: Props;
  byId: Map<string, Style>;
  /// Стиль по умолчанию каждого типа: paragraph → «Normal», table → «Normal Table»…
  defaultOf: Record<string, string>;
};

function parseStyles(xml: string): PartStyles {
  const dd = /<w:docDefaults>[\s\S]*?<\/w:docDefaults>/.exec(xml)?.[0] ?? "";
  const pPrDef = /<w:pPrDefault>[\s\S]*?<\/w:pPrDefault>/.exec(dd)?.[0];
  const rPrDef = /<w:rPrDefault>[\s\S]*?<\/w:rPrDefault>/.exec(dd)?.[0];
  const defaults = readProps(
    pPrDef ? /<w:pPr>[\s\S]*?<\/w:pPr>/.exec(pPrDef)?.[0] : undefined,
    rPrDef ? /<w:rPr>[\s\S]*?<\/w:rPr>/.exec(rPrDef)?.[0] : undefined,
  );
  const byId = new Map<string, Style>();
  const defaultOf: Record<string, string> = {};
  for (const m of xml.matchAll(/<w:style\b[^>]*>[\s\S]*?<\/w:style>/g)) {
    const el = m[0];
    const a = wAttrs(el);
    if (!a.styleId) continue;
    const based = child(el, "basedOn");
    const isDefault = a.default === "1";
    byId.set(a.styleId, {
      id: a.styleId,
      type: a.type ?? "paragraph",
      isDefault,
      basedOn: based ? wAttrs(based).val : undefined,
      props: readProps(child(el, "pPr"), child(el, "rPr")),
      xml: el,
    });
    if (isDefault && a.type) defaultOf[a.type] = a.styleId;
  }
  return { defaults, byId, defaultOf };
}

/// Стили части → стили общего файла. Идентификаторы стилей Word назначает сам
/// («a3», «ad»), и в разных документах один и тот же id означает разное: у СЗ
/// «a3» — «Сетка таблицы» с рамкой, у претензии — совсем другой стиль. Поэтому
/// стиль части переносится под новым id, если у основы под этим id не он же.
/// Стили по умолчанию («Normal» и т. п.) сводятся к стилям основы — то, что
/// часть брала из своих, уже прописано в её абзацы (bakeElement).
function mapStyles(
  part: PartStyles,
  base: PartStyles,
  used: Iterable<string>,
  n: number,
): { map: Map<string, string>; added: string[] } {
  const map = new Map<string, string>();
  const added: string[] = [];
  const taken = new Set(base.byId.keys());
  const norm = (x: string) => x.replace(/<w:rsid\b[^>]*\/>/g, "").replace(/\s+/g, " ");
  const resolve = (id: string): string => {
    const known = map.get(id);
    if (known) return known;
    const s = part.byId.get(id);
    if (!s) {
      map.set(id, id);
      return id;
    }
    if (s.isDefault) {
      const d = base.defaultOf[s.type] ?? id;
      map.set(id, d);
      return d;
    }
    const b = base.byId.get(id);
    if (b && norm(b.xml) === norm(s.xml)) {
      map.set(id, id);
      return id;
    }
    let newId = `${id}D${n}`;
    while (taken.has(newId)) newId += "x";
    taken.add(newId);
    map.set(id, newId); // до рекурсии — на случай цикла basedOn
    let xml = s.xml
      .replace(/w:styleId="[^"]*"/, `w:styleId="${newId}"`)
      .replace(/\sw:default="1"/, "")
      .replace(/<w:name w:val="([^"]*)"\/>/, (_, nm: string) => `<w:name w:val="${nm} (${n})"/>`)
      // Связанные стили не переносим: next/link тянули бы за собой лишнее.
      .replace(/<w:(?:next|link)\b[^>]*\/>/g, "");
    const based = /<w:basedOn w:val="([^"]*)"\/>/.exec(xml);
    if (based) xml = xml.replace(based[0], `<w:basedOn w:val="${resolve(based[1])}"/>`);
    if (!xml.includes('w:customStyle="1"')) xml = xml.replace(/^<w:style\b/, '<w:style w:customStyle="1"');
    added.push(xml);
    return newId;
  };
  for (const id of used) resolve(id);
  return { map, added };
}

function styleChainProps(styles: PartStyles, id: string | undefined): Props {
  const chain: Style[] = [];
  const seen = new Set<string>();
  for (let cur = id; cur && !seen.has(cur); cur = styles.byId.get(cur)?.basedOn) {
    seen.add(cur);
    const s = styles.byId.get(cur);
    if (s) chain.unshift(s);
  }
  return chain.reduce((acc, s) => overlay(acc, s.props), { spacing: {}, fonts: {} } as Props);
}

// ───────── «Запекание» свойств части в её абзацы и прогоны ─────────

function bakeRPr(rPr: string | undefined, eff: Props, theme: Theme): string {
  let el = rPr ?? "<w:rPr></w:rPr>";
  const fonts = resolveFonts(eff.fonts, theme);
  if (Object.keys(fonts).length > 0) el = setChild(el, "rFonts", `<w:rFonts${attrsToString(fonts)}/>`, RPR_ORDER);
  if (eff.sz) el = setChild(el, "sz", `<w:sz w:val="${eff.sz}"/>`, RPR_ORDER);
  const szCs = eff.szCs ?? eff.sz;
  if (szCs) el = setChild(el, "szCs", `<w:szCs w:val="${szCs}"/>`, RPR_ORDER);
  return el;
}

function bakeParagraph(p: string, styles: PartStyles, theme: Theme, table: Props): string {
  if (p.endsWith("/>") && !p.includes("</")) p = `${p.slice(0, -2).trimEnd()}></w:p>`;
  const kids = topLevel(inner(p));
  const pPrIdx = kids.findIndex((k) => localName(k) === "pPr");
  let pPr = pPrIdx >= 0 ? kids[pPrIdx] : "<w:pPr></w:pPr>";

  const pStyleEl = child(pPr, "pStyle");
  const pStyle = pStyleEl ? wAttrs(pStyleEl).val : styles.defaultOf.paragraph;
  // Порядок по спецификации: умолчания документа → стиль таблицы → стиль абзаца.
  const paraEff = overlay(overlay(styles.defaults, table), styleChainProps(styles, pStyle));

  // Интервалы: умолчания → стиль → прямое форматирование, итог — явно в абзац.
  const own = readProps(pPr, undefined).spacing;
  const spacing = { ...paraEff.spacing, ...own };
  if (Object.keys(spacing).length > 0) {
    pPr = setChild(pPr, "spacing", `<w:spacing${attrsToString(spacing)}/>`, PPR_ORDER);
  }
  // Знак абзаца: от его размера зависит высота пустых строк.
  const markRPr = child(pPr, "rPr");
  pPr = setChild(pPr, "rPr", bakeRPr(markRPr, overlay(paraEff, readProps(undefined, markRPr)), theme), PPR_ORDER);

  const bakeRun = (r: string): string => {
    if (r.endsWith("/>") && !r.includes("</")) return r;
    const rk = topLevel(inner(r));
    const rPrI = rk.findIndex((k) => localName(k) === "rPr");
    const rPr = rPrI >= 0 ? rk[rPrI] : undefined;
    const rStyleEl = rPr && child(rPr, "rStyle");
    let eff = paraEff;
    if (rStyleEl) eff = overlay(eff, styleChainProps(styles, wAttrs(rStyleEl).val));
    eff = overlay(eff, readProps(undefined, rPr));
    const baked = bakeRPr(rPr, eff, theme);
    if (rPrI >= 0) rk[rPrI] = baked;
    else rk.unshift(baked);
    return openTag(r) + rk.join("") + "</w:r>";
  };

  // Прогоны прямо в абзаце и во вложенных обёртках (ins, hyperlink, smartTag…).
  // Остальное (формулы m:*, проверка правописания) не трогаем.
  const bakeContainer = (el: string): string => {
    const name = qname(el);
    if (name === "w:r") return bakeRun(el);
    if (!RUN_WRAPPERS.includes(name) || (el.endsWith("/>") && !el.includes("</"))) return el;
    const ks = topLevel(inner(el)).map(bakeContainer);
    const tag = openTag(el);
    return tag + ks.join("") + `</${tag.slice(1).split(/[\s>]/)[0]}>`;
  };

  const out = kids.map((k, i) => (i === pPrIdx ? pPr : bakeContainer(k)));
  if (pPrIdx < 0) out.unshift(pPr);
  return openTag(p) + out.join("") + "</w:p>";
}

const NO_PROPS: Props = { spacing: {}, fonts: {} };

/// Все абзацы (в том числе в ячейках таблиц) — через обход дерева. `table` —
/// свойства стиля таблицы, в которой лежит абзац: он даёт им свои интервалы.
function bakeElement(el: string, styles: PartStyles, theme: Theme, table: Props = NO_PROPS): string {
  const name = qname(el);
  if (name === "w:p") return bakeParagraph(el, styles, theme, table);
  if (el.endsWith("/>") && !el.includes("</")) return el;
  if (!["w:tbl", "w:tr", "w:tc", "w:sdt", "w:sdtContent", "w:customXml"].includes(name)) return el;
  if (name === "w:tbl") {
    const tblPr = child(el, "tblPr");
    const st = tblPr && child(tblPr, "tblStyle");
    table = styleChainProps(styles, st ? wAttrs(st).val : styles.defaultOf.table);
  }
  const tag = openTag(el);
  const ks = topLevel(inner(el)).map((k) => bakeElement(k, styles, theme, table));
  return tag + ks.join("") + `</${tag.slice(1).split(/[\s>]/)[0]}>`;
}

// ───────── Документ: тело, разделы, колонтитулы ─────────

type Doc = { head: string; root: string; elements: string[]; sectPr: string; tail: string };

function readDoc(zip: PizZip, n: number): Doc {
  const xml = zip.file("word/document.xml")?.asText();
  if (!xml) throw new MergeError(`документ ${n}: нет word/document.xml`);
  const rootM = /<w:document\b[^>]*>/.exec(xml);
  const bodyM = /<w:body>([\s\S]*)<\/w:body>/.exec(xml);
  if (!rootM || !bodyM) throw new MergeError(`документ ${n}: неожиданная структура`);
  const elements = topLevel(bodyM[1]);
  const last = elements[elements.length - 1];
  if (!last || localName(last) !== "sectPr") throw new MergeError(`документ ${n}: нет параметров страницы`);
  elements.pop();
  return {
    head: xml.slice(0, rootM.index),
    root: rootM[0],
    elements,
    sectPr: last,
    tail: xml.slice(bodyM.index + bodyM[0].length),
  };
}

/// Разрыв раздела: параметры раздела — в последний абзац его текста.
function attachSection(elements: string[], sectPr: string): string[] {
  const out = [...elements];
  const lastIdx = out.length - 1;
  const last = out[lastIdx];
  if (last && qname(last) === "w:p") {
    let p = last.endsWith("/>") && !last.includes("</") ? `${last.slice(0, -2).trimEnd()}></w:p>` : last;
    const kids = topLevel(inner(p));
    const i = kids.findIndex((k) => localName(k) === "pPr");
    const pPr = setChild(i >= 0 ? kids[i] : "<w:pPr></w:pPr>", "sectPr", sectPr, PPR_ORDER);
    if (i >= 0) kids[i] = pPr;
    else kids.unshift(pPr);
    p = openTag(p) + kids.join("") + "</w:p>";
    out[lastIdx] = p;
  } else {
    out.push(`<w:p><w:pPr>${sectPr}</w:pPr></w:p>`);
  }
  return out;
}

const UNSUPPORTED: [RegExp, string][] = [
  [/r:(?:id|embed|link)=/, "картинки или ссылки"],
  [/<w:numPr\b/, "нумерованные списки"],
  [/<w:(?:footnote|endnote)Reference\b/, "сноски"],
  [/<w:commentReference\b/, "примечания"],
  [/<w:(?:txbxContent|drawing|pict|object)\b/, "рисунки или надписи"],
  [/<w:sectPr\b/, "несколько разделов"],
];

export function mergeDocx(parts: Uint8Array[]): Uint8Array {
  if (parts.length < 2) throw new MergeError("нечего склеивать");
  const base = new PizZip(parts[0]);
  const baseDoc = readDoc(base, 1);
  let root = baseDoc.root;
  if (!root.includes(`xmlns:r="${NS_R}"`)) root = root.replace(/>$/, ` xmlns:r="${NS_R}">`);

  // Колонтитулы основы: у остальных разделов — пустые того же типа.
  const refs = topLevel(inner(baseDoc.sectPr)).filter((k) => /^(header|footer)Reference$/.test(localName(k)));
  const emptyRefs = refs.length > 0 ? addEmptyHeaderFooter(base, refs) : "";

  let baseStyles = base.file("word/styles.xml")?.asText() ?? "";
  const body: string[] = attachSection(baseDoc.elements, baseDoc.sectPr);
  let finalSectPr = baseDoc.sectPr;

  for (let i = 1; i < parts.length; i++) {
    const n = i + 1;
    const zip = new PizZip(parts[i]);
    const doc = readDoc(zip, n);
    const bodyXml = doc.elements.join("");
    for (const [re, what] of UNSUPPORTED) {
      if (re.test(bodyXml)) throw new MergeError(`документ ${n}: не поддерживаются ${what}`);
    }
    if (/<w:(header|footer)Reference\b/.test(doc.sectPr)) {
      throw new MergeError(`документ ${n}: не поддерживаются колонтитулы`);
    }

    // Пространства имён, которых нет у основы.
    for (const [k, v] of Object.entries(parseAttrs(doc.root))) {
      if (!k.startsWith("xmlns:")) continue;
      const existing = parseAttrs(root)[k];
      if (existing === undefined) root = root.replace(/>$/, ` ${k}="${v}">`);
      else if (existing !== v) throw new MergeError(`документ ${n}: конфликт пространств имён ${k}`);
    }

    const styles = parseStyles(zip.file("word/styles.xml")?.asText() ?? "");
    const used = new Set<string>();
    for (const m of bodyXml.matchAll(/<w:(?:pStyle|rStyle|tblStyle) w:val="([^"]*)"/g)) used.add(m[1]);
    const { map, added } = mapStyles(styles, parseStyles(baseStyles), used, n);
    if (added.length > 0) baseStyles = baseStyles.replace("</w:styles>", `${added.join("")}</w:styles>`);

    const theme = readTheme(zip);
    const cleaned = doc.elements
      .map((el) => bakeElement(el, styles, theme))
      // Ссылки на стили — на их копии в общем файле (после запекания: оно
      // считает свойства по стилям самой части).
      .map((el) =>
        el.replace(
          /(<w:(?:pStyle|rStyle|tblStyle) w:val=")([^"]*)(")/g,
          (_, a: string, id: string, b: string) => `${a}${map.get(id) ?? id}${b}`,
        ),
      )
      // Закладки и w14-идентификаторы абзацев повторяются между документами —
      // Word считает такой файл повреждённым.
      .map((el) =>
        el
          .replace(/<w:bookmark(?:Start|End)\b[^>]*\/>/g, "")
          .replace(/\sw14:(?:paraId|textId)="[^"]*"/g, ""),
      );

    const sectPr = emptyRefs ? `${openTag(doc.sectPr)}${emptyRefs}${inner(doc.sectPr)}</w:sectPr>` : doc.sectPr;
    if (i < parts.length - 1) body.push(...attachSection(cleaned, sectPr));
    else {
      body.push(...cleaned);
      finalSectPr = sectPr;
    }
  }

  base.file(
    "word/document.xml",
    `${baseDoc.head}${root}<w:body>${body.join("")}${finalSectPr}</w:body>${baseDoc.tail}`,
  );
  base.file("word/styles.xml", baseStyles);
  return base.generate({ type: "uint8array", compression: "DEFLATE" });
}

/// Добавляет в основу пустые верхний/нижний колонтитулы и возвращает ссылки на
/// них для параметров разделов 2+ (по одной на каждый тип, что есть у основы).
function addEmptyHeaderFooter(zip: PizZip, refs: string[]): string {
  let rels = zip.file("word/_rels/document.xml.rels")?.asText() ?? "";
  let types = zip.file("[Content_Types].xml")?.asText() ?? "";
  const made = new Map<string, string>(); // "header"/"footer" → rId
  const out: string[] = [];
  for (const ref of refs) {
    const kind = localName(ref) === "headerReference" ? "header" : "footer";
    let rId = made.get(kind);
    if (!rId) {
      rId = `rIdDockformEmpty${kind === "header" ? "Hdr" : "Ftr"}`;
      const file = `dockform-empty-${kind}.xml`;
      const tag = kind === "header" ? "w:hdr" : "w:ftr";
      zip.file(
        `word/${file}`,
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<${tag} xmlns:w="${NS_W}"><w:p/></${tag}>`,
      );
      rels = rels.replace(
        "</Relationships>",
        `<Relationship Id="${rId}" Type="${kind === "header" ? REL_HEADER : REL_FOOTER}" Target="${file}"/></Relationships>`,
      );
      types = types.replace(
        "</Types>",
        `<Override PartName="/word/${file}" ContentType="${kind === "header" ? CT_HEADER : CT_FOOTER}"/></Types>`,
      );
      made.set(kind, rId);
    }
    out.push(`<w:${kind}Reference w:type="${wAttrs(ref).type ?? "default"}" r:id="${rId}"/>`);
  }
  zip.file("word/_rels/document.xml.rels", rels);
  zip.file("[Content_Types].xml", types);
  return out.join("");
}
