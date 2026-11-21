// validate_sql v2.1 — Code-вузол validate_sql у саб-воркфлоу run_sql (Run Once for All Items).
// Вхід: { query }. Вихід: { ok:true, sql } або { ok:false, error, sql }.
// Це запобіжник від помилок агента, а не межа безпеки. Межа безпеки — права service account у GCP
// (лише BigQuery Job User; публічний датасет читається без додаткових ролей).
// Тести: 43/43 (25 з зовнішнього рев'ю + 18 власних: еталони, коментарі, обходи).

const MAX_LIMIT = 100;
const PREFIX = 'bigquery-public-data.thelook_ecommerce.';
const TABLES = ['orders', 'order_items', 'products', 'users', 'events', 'inventory_items', 'distribution_centers'];
const PII_COLUMNS = /\b(first_name|last_name|email|street_address|postal_code|ip_address)\b/;
const PII_TABLES = ['users', 'events']; // таблиці, де є персональні дані
const NOT_ALIAS = new Set(['where', 'join', 'left', 'right', 'inner', 'full', 'cross', 'on', 'using', 'group', 'order',
  'limit', 'union', 'window', 'qualify', 'having', 'except', 'intersect', 'tablesample', 'for', 'pivot', 'unpivot']);
const esc = s => s.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');

let sql = String($input.first().json.query || '').trim().replace(/;+\s*$/, '');
const fail = (error) => [{ json: { ok: false, error, sql } }];
if (!sql) return fail('Порожній запит.');

// 1) Копія для перевірок: рядкові літерали -> '', коментарі -> пробіл, `ідентифікатори` лишаються.
const clean = sql.replace(
  /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`[^`]*`|--[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\//g,
  m => (m[0] === "'" ? "''" : m[0] === '"' ? '""' : m[0] === '`' ? m : ' ')
).trim();
const lower = clean.toLowerCase();
// Та сама довжина, що й lower, але вміст `...` замінено на ~ (щоб позиції збігались)
const code = lower.replace(/`[^`]*`/g, m => '`' + '~'.repeat(m.length - 2) + '`');

// 2) Лише один SELECT / WITH
if (!/^(select|with)\b/.test(lower)) return fail('Дозволені лише запити SELECT / WITH.');
if (lower.includes(';')) return fail('Дозволений лише один SQL-вираз.');
if (/\b(insert|update|delete|merge|drop|create|alter|truncate|grant|revoke|call|execute|export|load)\b/.test(code)) {
  return fail('Запит містить заборонену операцію.');
}

// 3) Таблиці: лише повна назва в одних зворотних лапках і лише з дозволеного списку
const tableMsg = 'Використовуй лише таблиці `' + PREFIX + '<table>` (повна назва в одних зворотних лапках), '
  + 'де <table>: ' + TABLES.join(', ') + '.';
const refs = [...lower.matchAll(/`([^`]*)`/g)].map(m => m[1]).filter(r => r.includes('.'));
if (!refs.length || refs.some(r => !TABLES.some(t => r === PREFIX + t))) return fail(tableMsg);
if (/`\s*\./.test(code)) return fail(tableMsg);                          // `project`.dataset.table
// project.dataset.table без лапок (BigQuery дозволяє дефіси в назві проєкту без лапок у FROM)
if (/(^|[^\w.`~-])[a-z_][\w-]*\.[a-z_]\w*\.[a-z_]/.test(code)) return fail(tableMsg);

// 4) Персональні дані: колонки
if (PII_COLUMNS.test(lower)) {
  return fail("Запит звертається до персональних даних (ім'я, email, адреса, IP). Використовуй агреговані дані.");
}

// 5) Персональні дані: увесь рядок users/events як значення (SELECT u, u AS x, TO_JSON_STRING(u), ARRAY_AGG(u ...), [u] ...)
//    Перевіряємо лише в межах дужок, де оголошено таблицю (CTE-сусіди не рахуються).
const pairs = []; { const st = [];
  for (let i = 0; i < code.length; i++) {
    if (code[i] === '(') st.push(i);
    else if (code[i] === ')' && st.length) pairs.push([st.pop(), i]);
  } }
const scopeOf = (pos) => pairs.filter(([a, b]) => a < pos && pos < b)
  .reduce((best, p) => (!best || p[0] > best[0] ? p : best), null) || [-1, code.length];

const tableRe = new RegExp('`' + esc(PREFIX) + '(' + PII_TABLES.join('|') + ')`(?:\\s+(?:as\\s+)?([a-z_]\\w*))?', 'g');
for (const m of lower.matchAll(tableRe)) {
  const alias = m[2] && !NOT_ALIAS.has(m[2]) ? m[2] : m[1];
  const [from, to] = scopeOf(m.index);
  const use = new RegExp('(?:^|[(,\\[]|\\b(?:select|distinct|all|struct|value|then|else)\\b)\\s*' + esc(alias) + '\\b(?!\\s*\\.)', 'g');
  for (const u of code.matchAll(use)) {
    if (u.index > from && u.index < to) {
      return fail(`Не вибирай рядок таблиці ${m[1]} цілком (${alias}) — там персональні дані. Перелічи потрібні колонки `
        + `(${alias}.<колонка>). Якщо ${alias} — назва твоєї колонки, дай таблиці короткий аліас `
        + `(наприклад, ${m[1][0]}) або перейменуй колонку (${alias}_cnt).`);
    }
  }
}

// 6) SELECT * / t.* / SELECT AS STRUCT * заборонені; COUNT(*) дозволено
if (/\bselect\s+(?:(?:distinct|all|as\s+struct|as\s+value)\s+)?(?:\w+\.)?\*|,\s*(?:\w+\.)?\*/.test(lower)) {
  return fail('SELECT * заборонено. Перелічи потрібні колонки явно.');
}

// 7) LIMIT: додаємо, якщо немає; занадто великий — просимо агрегувати
const lim = lower.match(/\blimit\s+(\d+)(?:\s+offset\s+\d+)?\s*$/);
if (!lim) sql += `\nLIMIT ${MAX_LIMIT}`;
else if (Number(lim[1]) > MAX_LIMIT) return fail(`LIMIT не більше ${MAX_LIMIT}. Агрегуй дані в SQL.`);

return [{ json: { ok: true, sql } }];
