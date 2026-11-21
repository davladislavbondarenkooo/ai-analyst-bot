// n8n: воркфлоу «AI Analyst Bot», вузол save_context (Code, Run Once for All Items)
// save_context v1 — зберігає фінальну відповідь (після самоперевірки) і її SQL
const MAX_TURNS = 3;
const j = $input.first().json;
const msg = $('Telegram Trigger').first().json.message;
const chatId = String(msg.chat.id);

const ok = !j.error && !!j.answer;   // збій агента в контекст не пишемо
if (ok) {
  const store = $getWorkflowStaticData('global');
  const ctx = { ...(store.ctx || {}) };
  const turns = [...(ctx[chatId] || [])];
  turns.push({
    q: String(msg.text || '').slice(0, 500),
    a: String(j.answer).slice(0, 1200),
    sql: j.sql ? String(j.sql).slice(0, 3000) : '',
    ts: new Date().toISOString(),
  });
  ctx[chatId] = turns.slice(-MAX_TURNS);
  store.ctx = ctx;   // присвоєння на верхньому рівні — n8n гарантовано збереже зміну
}

return [{ json: { saved: ok } }];
