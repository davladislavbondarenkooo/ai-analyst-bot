// n8n: воркфлоу «AI Analyst Bot», вузол parse_output (Code, Run Once for All Items)
// parse_output v4.4 (21.11): v4.3 + інструменти run_sql* (run_sql1 у recheck). v4.3: text_issue — обірваний текст («...»), «близько/приблизно/≈», «див. нижче».
const msg = $('Telegram Trigger').first().json.message;
const cfg = $('config').first().json;
const input = $input.first().json;
const raw = input.output ?? '';
const steps = input.intermediateSteps || [];
const MAX_POINTS = 15;   // максимум стовпців/точок без series
const MAX_SERIES = 6;    // максимум ліній при series

// 1) Витягуємо JSON з відповіді агента
let parsed = null;
if (raw && typeof raw === 'object') {
  parsed = raw;
} else {
  const t = String(raw).replace(/```(?:json)?/gi, '').trim();
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s !== -1 && e > s) {
    try { parsed = JSON.parse(t.slice(s, e + 1)); } catch (err) { /* залишаємо null */ }
  }
}

const agentFailed = !raw && !!input.error;
let answer = parsed?.answer
  || (agentFailed
      ? 'Не вдалося отримати відповідь. Спробуй переформулювати питання.'
      : String(raw).trim() || 'Порожня відповідь агента.');
answer = String(answer).slice(0, 3000);

// 2) Виклики run_sql: розбираємо відповідь інструмента (рядок JSON, масив, {text: "..."} тощо)
const parseObs = (o) => {
  for (let i = 0; i < 3 && typeof o === 'string'; i++) { try { o = JSON.parse(o); } catch (e) { break; } }
  if (Array.isArray(o)) o = o[0];
  if (o && typeof o.text === 'string') { try { o = JSON.parse(o.text); } catch (e) {} }
  if (Array.isArray(o)) o = o[0];
  if (o && o.json) o = o.json;
  return o && typeof o === 'object' ? o : null;
};
const obsText = st => typeof st.observation === 'string' ? st.observation : JSON.stringify(st.observation ?? '');
const calls = steps.filter(st => String(st.action?.tool || '').startsWith('run_sql')).map(st => {   // run_sql і run_sql1 (recheck)
  const o = parseObs(st.observation);
  const ok = typeof o?.ok === 'boolean' ? o.ok
    : /\\?"ok\\?"\s*:\s*true/.test(obsText(st)) ? true
    : /\\?"ok\\?"\s*:\s*false/.test(obsText(st)) ? false : null;
  return { ok, o, query: st.action?.toolInput?.query ?? st.action?.toolInput ?? '' };
});
const okCalls = calls.filter(c => c.ok === true);
const failedCalls = calls.filter(c => c.ok === false);
const final = okCalls[okCalls.length - 1] || null;   // джерело SQL і даних

const sql = final ? String(final.o?.sql || final.query || '').trim() : '';
const rows = Array.isArray(final?.o?.rows) ? final.o.rows : [];
const rowCount = Number(final?.o?.row_count ?? rows.length);

// 3) Графік: колонки — від моделі, числа — з rows
const cell = v => (v && typeof v === 'object' && 'value' in v) ? v.value : v;   // DATE з BigQuery буває {value}
const num = v => { const n = Number(cell(v)); return Number.isFinite(n) ? n : null; };
let chartErr = '';
function buildChart(c) {
  if (!c || typeof c !== 'object') return null;
  if (!rows.length) { chartErr = 'немає рядків для графіка'; return null; }
  const cols = Object.keys(rows[0]);
  const ys = (Array.isArray(c.y) ? c.y : [c.y]).filter(Boolean).map(String);
  const miss = [c.x, ...ys, ...(c.series ? [c.series] : [])].filter(k => !cols.includes(k));
  if (!c.x || !ys.length || miss.length) { chartErr = `немає колонок: ${miss.join(', ') || 'x/y'}`; return null; }

  const type = ['bar', 'line', 'pie'].includes(c.type) ? c.type : 'bar';
  let labels, datasets, note = '';
  if (c.series) {                       // довгий формат: x, series, y -> кілька ліній
    const y = ys[0];
    labels = [...new Set(rows.map(r => String(cell(r[c.x]))))].slice(0, 31);
    const names = [...new Set(rows.map(r => String(cell(r[c.series]))))];
    if (names.length > MAX_SERIES) note = ` (перші ${MAX_SERIES} з ${names.length} груп)`;
    datasets = names.slice(0, MAX_SERIES).map(n => ({
      label: n,
      data: labels.map(l => {
        const r = rows.find(r => String(cell(r[c.x])) === l && String(cell(r[c.series])) === n);
        return r ? num(r[y]) : null;
      }),
    }));
  } else {                              // широкий формат: x і одна або кілька колонок y
    const top = rows.slice(0, MAX_POINTS);
    labels = top.map(r => String(cell(r[c.x])));
    datasets = ys.map(y => ({ label: ys.length > 1 ? y : (c.title || y), data: top.map(r => num(r[y])) }));
    if (rowCount > MAX_POINTS) note = ` (перші ${MAX_POINTS} з ${rowCount})`;
  }
  if (labels.length < 2) { chartErr = 'менше 2 точок'; return null; }
  if (datasets.every(d => d.data.every(v => v === null))) { chartErr = 'y не числова'; return null; }

  const title = String(c.title || '') + note;
  const config = {
    type,
    data: { labels, datasets: datasets.map(d => ({ ...d, fill: false })) },
    options: {
      title: { display: !!title, text: title },
      legend: { display: type === 'pie' || datasets.length > 1 },
    },
  };
  return { type, title, url: 'https://quickchart.io/chart?w=800&h=450&bkg=white&c=' + encodeURIComponent(JSON.stringify(config)) };
}
const chart = buildChart(parsed?.chart);

// 3b) Перевірка чисел: кожне число з answer має бути в результатах успішних run_sql (з урахуванням округлення).
//     Не блокує відповідь — лише пише в лог числа, яких у даних немає (ungrounded).
const dataNums = [];
const collect = v => {
  v = cell(v);
  if (v && typeof v === 'object') return Object.values(v).forEach(collect);
  const n = Number(v); if (v !== null && v !== '' && Number.isFinite(n)) dataNums.push(Math.abs(n));
};
okCalls.forEach(c => (c.o?.rows || []).forEach(r => Object.values(r).forEach(collect)));
const qNums = new Set((String(msg.text || '').match(/\d+(?:[.,]\d+)?/g) || []).map(x => x.replace(',', '.')));
const ungrounded = [];
const numRe = /(?<![\p{L}\d])(\d{1,3}(?:[ \u00A0\u202F]\d{3})+(?!\d)|\d+)(?:[.,](\d+))?\s*(%|відс|тис|млн|млрд)?/giu;   // v4.2: не після літери (Q3), тисячі не «з'їдають» рік
for (const m of answer.matchAll(numRe)) {
  if (/\d-?$/.test(answer.slice(0, m.index))) continue;            // частина дати 2025-01-01
  const intPart = m[1].replace(/[ \u00A0\u202F]/g, ''), dec = m[2] || '';
  const unit = (m[3] || '').toLowerCase();
  const n = Number(intPart + (dec ? '.' + dec : ''));
  const isPct = unit === '%' || unit === 'відс';
  const scale = unit === 'тис' ? 1e3 : unit === 'млн' ? 1e6 : unit === 'млрд' ? 1e9 : 1;
  if (!isPct && scale === 1 && !dec && (n <= 31 || (n >= 2019 && n <= 2030))) continue;  // топ-N, дні, роки
  if (qNums.has(intPart + (dec ? '.' + dec : ''))) continue;                           // число з питання
  const tol = 0.5 * Math.pow(10, -dec.length) * scale + 1e-9;
  const target = n * scale;
  const ok = dataNums.some(v => Math.abs(v - target) <= tol || (isPct && Math.abs(v * 100 - target) <= tol));
  if (!ok) ungrounded.push(m[0].trim());
}

// 3c) Проблеми з текстом: обірвані речення, наближені числа, посилання на неіснуюче
const textIssues = [];
if (/(\.\.\.|…)\s*\)?\s*$/.test(answer) || /(\.\.\.|…)\s*\(/.test(answer)) textIssues.push('обірване речення («...»)');
if (/(^|[^\p{L}])(близько|приблизно)(?=[^\p{L}]|$)|≈|~\s*\d/iu.test(answer)) textIssues.push('«близько/приблизно» біля числа');
if (/див\.?\s*нижче/i.test(answer)) textIssues.push('«див. нижче»');

// 4) Текст для Telegram (parse mode HTML): екрануємо <, >, &
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
let text = esc(answer);
if (sql) {
  const room = Math.max(300, 3800 - text.length);
  const shown = sql.length > room ? sql.slice(0, room) + '\n-- ...обрізано' : sql;
  text += `\n\n<b>SQL:</b>\n<pre><code class="language-sql">${esc(shown)}</code></pre>`;
}

// 5) Результат + поля для логу
const parsedOk = !!parsed && !agentFailed;
return [{ json: {
  chat_id: msg.chat.id,
  question: msg.text || '',
  answer,
  sql,
  text,
  chart_url: chart?.url || null,
  chart_title: chart?.title || '',
  parsed_ok: parsedOk,                       // агент повернув валідний JSON
  answered: parsedOk && okCalls.length > 0,  // і спирався хоча б на один успішний run_sql
  tool_calls: calls.length,
  failed_calls: failedCalls.length,
  ungrounded: ungrounded.join('; '),         // числа з answer, яких немає в даних
  text_issue: textIssues.join('; '),         // проблеми з текстом answer
  elapsed_s: Math.round(Date.now() / 1000 - msg.date),
  error: agentFailed ? String(input.error?.message || input.error) : '',
  // --- лише для логу ---
  ts: $now.toFormat('yyyy-MM-dd HH:mm:ss'),
  execution_id: $execution.id,
  chart_log: chart ? `${chart.type}: ${chart.title}` : (chartErr ? `не побудовано: ${chartErr}` : ''),
  model: cfg.model,
  prompt_version: cfg.prompt_version,
}}];
