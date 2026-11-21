// n8n: воркфлоу «run_sql», вузол format_result (Code, Run Once for All Items)
const MAX_ROWS = 50;
const items = $input.all().map(i => i.json);
const sql = $('validate_sql').first().json.sql;

// 1) Помилка BigQuery (On Error = Continue кладе її в поле error)
const first = items[0] || {};
if (items.length === 1 && 'error' in first && Object.keys(first).length <= 3) {
  const e = first.error;
  const message = typeof e === 'string' ? e : (e?.message || JSON.stringify(e));
  return [{ json: {
    ok: false,
    stage: 'bigquery',
    error: message + (first.description ? ` (${first.description})` : ''),
    hint: 'BigQuery повернув помилку. Прочитай її, виправ SQL і виклич run_sql ще раз.',
    sql,
  }}];
}

// 2) Дані (Always Output Data дає порожній {} при 0 рядків — відкидаємо його)
const rows = items.filter(r => Object.keys(r).length > 0);

// 3) 0 рядків АБО один рядок, де всі значення 0 / null (типово для COUNT/SUM з хибним фільтром)
const allZero = rows.length === 1 &&
  Object.values(rows[0]).every(v => v === null || Number(v) === 0);


// Нове: note, коли рядків рівно стільки, скільки дозволяє LIMIT валідатора (100) — результат міг бути обрізаний.
const LIMIT_CAP = 100;   // має збігатися з MAX_LIMIT у validate_sql
const notes = [];
if (rows.length === 0 || allZero) {
  notes.push('Результат порожній або нульовий. Перш ніж робити висновок, перевір значення у WHERE (регістр, точне написання, формат дат).');
}
if (rows.length >= LIMIT_CAP) {
  notes.push(`Рівно ${LIMIT_CAP} рядків — це межа LIMIT, тож результат міг бути обрізаний. Не роби висновків «по всіх» — агрегуй сильніше (наприклад, по місяцях замість днів) і виклич run_sql ще раз.`);
}

return [{ json: {
  ok: true,
  sql,
  row_count: rows.length,
  truncated: rows.length > MAX_ROWS,
  rows: rows.slice(0, MAX_ROWS),
  note: notes.length ? notes.join(' ') : undefined,
}}];
