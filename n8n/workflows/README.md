# Воркфлоу n8n

| Файл | Що робить |
|---|---|
| `AI_Analyst_Bot.json` | головний бот: Telegram, агент, пам'ять діалогу (`load_context` / `save_context` / `clear_context`), самоперевірка, графік, лог |
| `run_sql.json` | інструмент агента: `validate_sql`, BigQuery, `format_result` |
| `Error_Handler.json` | запис збоїв в аркуш `errors` і алерт у Telegram |

Код усіх вузлів Code лежить окремо в [`../code/`](../code/), щоб його можна було читати без n8n.

## Що прибрано з експорту

Ключів у файлах немає: n8n не зберігає їх в експорті, лише назви облікових даних. Додатково замінено:

| Що | Заглушка |
|---|---|
| мій `chat_id` (`allowed_ids` у `config`, `notify_admin`) | `123456789` |
| ID облікових даних Telegram, Anthropic, Google | `REPLACE_WITH_YOUR_CREDENTIAL` |
| посилання на Google-таблицю логу | `YOUR_SPREADSHEET_ID` (аркуші `log` і `errors` вибираються за назвою) |
| GCP-проєкт у `bigquery_query` | `YOUR_GCP_PROJECT_ID` |
| ID воркфлоу `run_sql` у вузлах `run_sql` і `run_sql1` | `YOUR_RUN_SQL_WORKFLOW_ID` |
| `webhookId` вузлів Telegram | нові випадкові UUID |
| ID воркфлоу, `versionId`, `instanceId`, Error Workflow в налаштуваннях, тестове повідомлення в pinData | прибрано |

## Після імпорту

1. Імпортувати спершу `Error_Handler.json` і `run_sql.json`, потім `AI_Analyst_Bot.json`.
2. Підключити облікові дані: Telegram, Anthropic, Google service account.
3. У вузлах `run_sql` і `run_sql1` (воркфлоу `AI Analyst Bot`) вибрати воркфлоу `run_sql`.
4. У налаштуваннях `AI Analyst Bot` і `run_sql` (Settings → Error Workflow) вибрати `Error Handler`.
5. У вузлі `config` замінити `123456789` в `allowed_ids` на свій `chat_id`; у `notify_admin` (Error Handler) теж.
6. У `log_sheet` і `log_error` вказати свою таблицю, у `bigquery_query` свій GCP-проєкт.
7. Опублікувати всі три воркфлоу.

Контекст діалогу зберігається в static data воркфлоу, а n8n записує його лише в продакшн-виконаннях (опублікований воркфлоу і повідомлення в Telegram). У ручному запуску з редактора контекст читається, але не зберігається.
