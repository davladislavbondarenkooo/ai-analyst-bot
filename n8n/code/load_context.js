// n8n: воркфлоу «AI Analyst Bot», вузол load_context (Code, Run Once for All Items)
// load_context v1 — останні обміни цього чату (лише текст, без блоків thinking)
const chatId = String($('Telegram Trigger').first().json.message.chat.id);
const store = $getWorkflowStaticData('global');
const turns = (store.ctx && store.ctx[chatId]) || [];

let context = '';
if (turns.length) {
  const blocks = turns.map((t, i) => [
    `[${i + 1}] Користувач: ${t.q}`,
    `Твоя відповідь: ${t.a}`,
    `Твій SQL:${t.sql ? '\n' + t.sql : ' немає'}`,
  ].join('\n'));
  context =
    'ПОПЕРЕДНЯ РОЗМОВА (останні обміни, від давнішого до новішого).\n'
    + 'Це контекст для уточнень на кшталт «а тепер…», «покажи це…»: бери з нього період, фільтри й SQL.\n'
    + 'Числа з попередніх відповідей не повторюй — лише з нового виклику run_sql.\n\n'
    + blocks.join('\n\n')
    + '\n\nПОТОЧНЕ ПОВІДОМЛЕННЯ КОРИСТУВАЧА:\n';
}

return [{ json: { context, context_turns: turns.length } }];
