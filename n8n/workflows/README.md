# Воркфлоу n8n

| Файл | Що робить |
|---|---|
| `AI_Analyst_Bot.json` | головний бот: Telegram, агент, самоперевірка, графік, лог |
| `run_sql.json` | інструмент агента: `validate_sql`, BigQuery, `format_result` |
| `Error_Handler.json` | запис збоїв в аркуш `errors` і алерт у Telegram |

У файлах немає секретів: n8n не зберігає ключі в експорті, лише назви облікових даних. Додатково прибрано `chat_id`, ID таблиці логу, ID облікових даних, вебхуків, воркфлоу і назву GCP-проєкту. На їхньому місці стоять заглушки `YOUR_...` і `REPLACE_WITH_YOUR_CREDENTIAL`.

Після імпорту:
1. Імпортувати спершу `Error_Handler.json` і `run_sql.json`, потім `AI_Analyst_Bot.json`.
2. Підключити облікові дані: Telegram, Anthropic, Google service account.
3. У `run_sql` і `AI_Analyst_Bot` в налаштуваннях воркфлоу вибрати Error Handler; у вузлах `run_sql` і `run_sql1` вибрати воркфлоу `run_sql`.
4. У вузлі `config` вписати свій `chat_id` в `allowed_ids`; в `notify_admin` (Error Handler) теж свій `chat_id`.
5. У `log_sheet` і `log_error` вибрати свою таблицю; у `bigquery_query` свій GCP-проєкт.
