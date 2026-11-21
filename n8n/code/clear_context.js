// n8n: воркфлоу «AI Analyst Bot», вузол clear_context (Code, Run Once for All Items)
// clear_context v1 — /new і /start: забути контекст цього чату
const chatId = String($('Telegram Trigger').first().json.message.chat.id);
const store = $getWorkflowStaticData('global');
const ctx = { ...(store.ctx || {}) };
delete ctx[chatId];
store.ctx = ctx;

return [{ json: { cleared: true } }];
