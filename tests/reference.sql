-- Еталони тестового набору v1 (thelook_ecommerce). Запускати в BigQuery Studio одним скриптом
-- В ОДИН ДЕНЬ з прогоном бота. Результати кожного кроку: вкладка «Execution details» / «Results» → «View results».
-- T01, T09, T25–T29 — без SQL (поведінкові). Еталон T09 = T08.

-- T02 [Агрегати] Яка виручка за 2025 рік?
SELECT ROUND(SUM(oi.sale_price), 0) AS revenue
FROM `bigquery-public-data.thelook_ecommerce.order_items` oi
WHERE oi.status NOT IN ('Cancelled', 'Returned')
  AND DATE(oi.created_at) BETWEEN '2025-01-01' AND '2025-12-31';

-- T03 [Агрегати] Скільки всього замовлень (з усіма статусами) створено у 2025 році?
SELECT COUNT(DISTINCT o.order_id) AS orders
FROM `bigquery-public-data.thelook_ecommerce.orders` o
WHERE DATE(o.created_at) BETWEEN '2025-01-01' AND '2025-12-31';

-- T04 [Агрегати] Який середній чек у 2025 році?
SELECT
  ROUND(SUM(oi.sale_price), 0) AS revenue,
  COUNT(DISTINCT oi.order_id) AS orders,
  ROUND(SUM(oi.sale_price) / COUNT(DISTINCT oi.order_id), 2) AS aov
FROM `bigquery-public-data.thelook_ecommerce.order_items` oi
WHERE oi.status NOT IN ('Cancelled', 'Returned')
  AND DATE(oi.created_at) BETWEEN '2025-01-01' AND '2025-12-31';

-- T05 [Агрегати] Скільки замовлень скасовано у 2025 році?
SELECT COUNT(DISTINCT o.order_id) AS cancelled_orders
FROM `bigquery-public-data.thelook_ecommerce.orders` o
WHERE o.status = 'Cancelled'
  AND DATE(o.created_at) BETWEEN '2025-01-01' AND '2025-12-31';

-- T06 [Пастка] Скільки замовлень мали статус delivered у 2025 році?
SELECT
  COUNTIF(o.status = 'Complete') AS complete_orders,
  COUNTIF(o.delivered_at IS NOT NULL) AS with_delivered_at
FROM `bigquery-public-data.thelook_ecommerce.orders` o
WHERE DATE(o.created_at) BETWEEN '2025-01-01' AND '2025-12-31';

-- T07 [JOIN] Топ-5 категорій за виручкою за весь час
SELECT p.category, ROUND(SUM(oi.sale_price), 0) AS revenue
FROM `bigquery-public-data.thelook_ecommerce.order_items` oi
JOIN `bigquery-public-data.thelook_ecommerce.products` p ON oi.product_id = p.id
WHERE oi.status NOT IN ('Cancelled', 'Returned')
GROUP BY p.category
ORDER BY revenue DESC
LIMIT 5;

-- T08 [Пам'ять] А тепер лише за 2025 рік
SELECT p.category, ROUND(SUM(oi.sale_price), 0) AS revenue
FROM `bigquery-public-data.thelook_ecommerce.order_items` oi
JOIN `bigquery-public-data.thelook_ecommerce.products` p ON oi.product_id = p.id
WHERE oi.status NOT IN ('Cancelled', 'Returned')
  AND DATE(oi.created_at) BETWEEN '2025-01-01' AND '2025-12-31'
GROUP BY p.category
ORDER BY revenue DESC
LIMIT 5;

-- T10 [JOIN] Яка маржа по кожному департаменту у 2025 році і який її відсоток від виручки?
SELECT
  p.department,
  ROUND(SUM(IF(oi.status NOT IN ('Cancelled', 'Returned'), oi.sale_price, 0)), 0) AS revenue,
  ROUND(SUM(IF(oi.status NOT IN ('Cancelled', 'Returned'), oi.sale_price - p.cost, 0)), 0) AS margin,
  ROUND(100 * SUM(IF(oi.status NOT IN ('Cancelled', 'Returned'), oi.sale_price - p.cost, 0)) / SUM(IF(oi.status NOT IN ('Cancelled', 'Returned'), oi.sale_price, 0)), 1) AS margin_pct,
  ROUND(SUM(oi.sale_price - p.cost), 0) AS margin_all_statuses
FROM `bigquery-public-data.thelook_ecommerce.order_items` oi
JOIN `bigquery-public-data.thelook_ecommerce.products` p ON oi.product_id = p.id
WHERE DATE(oi.created_at) BETWEEN '2025-01-01' AND '2025-12-31'
GROUP BY p.department
ORDER BY margin DESC;

-- T11 [JOIN] Яка виручка кожного дистриб'юторського центру у 2025 році і яка його частка?
SELECT
  dc.name AS distribution_center,
  ROUND(SUM(oi.sale_price), 0) AS revenue,
  ROUND(100 * SUM(oi.sale_price) / SUM(SUM(oi.sale_price)) OVER (), 1) AS share_pct
FROM `bigquery-public-data.thelook_ecommerce.order_items` oi
JOIN `bigquery-public-data.thelook_ecommerce.products` p ON oi.product_id = p.id
JOIN `bigquery-public-data.thelook_ecommerce.distribution_centers` dc ON p.distribution_center_id = dc.id
WHERE oi.status NOT IN ('Cancelled', 'Returned')
  AND DATE(oi.created_at) BETWEEN '2025-01-01' AND '2025-12-31'
GROUP BY dc.name
ORDER BY revenue DESC;

-- T12 [JOIN] Які 5 категорій мали найвищу частку повернень у 2025 році?
SELECT
  p.category,
  COUNT(*) AS items,
  COUNTIF(oi.status = 'Returned') AS returned_items,
  ROUND(100 * COUNTIF(oi.status = 'Returned') / COUNT(*), 2) AS return_rate_pct
FROM `bigquery-public-data.thelook_ecommerce.order_items` oi
JOIN `bigquery-public-data.thelook_ecommerce.products` p ON oi.product_id = p.id
WHERE DATE(oi.created_at) BETWEEN '2025-01-01' AND '2025-12-31'
GROUP BY p.category
ORDER BY return_rate_pct DESC
LIMIT 5;

-- T13 [JOIN] Яка конверсія сесій у покупку за кожним джерелом трафіку у 2025 році?
WITH s AS (
  SELECT
    e.session_id,
    ANY_VALUE(e.traffic_source) AS traffic_source,
    MAX(IF(e.event_type = 'purchase', 1, 0)) AS purchased
  FROM `bigquery-public-data.thelook_ecommerce.events` e
  WHERE DATE(e.created_at) BETWEEN '2025-01-01' AND '2025-12-31'
  GROUP BY e.session_id
)
SELECT
  traffic_source,
  COUNT(*) AS sessions,
  SUM(purchased) AS purchase_sessions,
  ROUND(100 * SUM(purchased) / COUNT(*), 2) AS conversion_pct
FROM s
GROUP BY traffic_source
ORDER BY conversion_pct DESC;

-- T14 [Тренди] Як змінювалася кількість замовлень по місяцях у 2025 році?
SELECT
  DATE_TRUNC(DATE(o.created_at), MONTH) AS month,
  COUNT(DISTINCT o.order_id) AS orders,
  COUNT(DISTINCT IF(o.status NOT IN ('Cancelled', 'Returned'), o.order_id, NULL)) AS orders_excl
FROM `bigquery-public-data.thelook_ecommerce.orders` o
WHERE DATE(o.created_at) BETWEEN '2025-01-01' AND '2025-12-31'
GROUP BY month
ORDER BY month;

-- T15 [Пам'ять] А тепер лише для жінок
SELECT
  DATE_TRUNC(DATE(o.created_at), MONTH) AS month,
  COUNT(DISTINCT o.order_id) AS orders,
  COUNT(DISTINCT IF(o.status NOT IN ('Cancelled', 'Returned'), o.order_id, NULL)) AS orders_excl
FROM `bigquery-public-data.thelook_ecommerce.orders` o
WHERE o.gender = 'F'
  AND DATE(o.created_at) BETWEEN '2025-01-01' AND '2025-12-31'
GROUP BY month
ORDER BY month;

-- T16 [Тренди] На скільки відсотків змінилася виручка в Q3 2025 порівняно з Q3 2024?
WITH q AS (
  SELECT EXTRACT(YEAR FROM DATE(oi.created_at)) AS year, SUM(oi.sale_price) AS revenue
  FROM `bigquery-public-data.thelook_ecommerce.order_items` oi
  WHERE oi.status NOT IN ('Cancelled', 'Returned')
    AND EXTRACT(QUARTER FROM DATE(oi.created_at)) = 3
    AND EXTRACT(YEAR FROM DATE(oi.created_at)) IN (2024, 2025)
  GROUP BY year
)
SELECT
  year,
  ROUND(revenue, 0) AS revenue,
  ROUND(100 * (revenue - LAG(revenue) OVER (ORDER BY year)) / LAG(revenue) OVER (ORDER BY year), 1) AS growth_pct
FROM q
ORDER BY year;

-- T17 [Віконні] Який бренд лідирує за виручкою в кожній категорії у 2025 році і яка його частка в категорії?
WITH b AS (
  SELECT p.category, p.brand, SUM(oi.sale_price) AS revenue
  FROM `bigquery-public-data.thelook_ecommerce.order_items` oi
  JOIN `bigquery-public-data.thelook_ecommerce.products` p ON oi.product_id = p.id
  WHERE oi.status NOT IN ('Cancelled', 'Returned')
    AND DATE(oi.created_at) BETWEEN '2025-01-01' AND '2025-12-31'
  GROUP BY p.category, p.brand
),
r AS (
  SELECT
    category, brand, revenue,
    SUM(revenue) OVER (PARTITION BY category) AS category_revenue,
    ROW_NUMBER() OVER (PARTITION BY category ORDER BY revenue DESC) AS rn
  FROM b
)
SELECT category, brand, ROUND(revenue, 0) AS revenue, ROUND(100 * revenue / category_revenue, 1) AS share_pct
FROM r
WHERE rn = 1
ORDER BY share_pct DESC;

-- T18 [Віконні] Як змінювалась виручка по департаментах місяць до місяця у 2025 році?
WITH monthly AS (
  SELECT p.department, DATE_TRUNC(DATE(oi.created_at), MONTH) AS month, SUM(oi.sale_price) AS revenue
  FROM `bigquery-public-data.thelook_ecommerce.order_items` oi
  JOIN `bigquery-public-data.thelook_ecommerce.products` p ON oi.product_id = p.id
  WHERE oi.status NOT IN ('Cancelled', 'Returned')
    AND DATE(oi.created_at) BETWEEN '2025-01-01' AND '2025-12-31'
  GROUP BY 1, 2
)
SELECT
  department, month, ROUND(revenue, 0) AS revenue,
  ROUND(100 * (revenue - LAG(revenue) OVER (PARTITION BY department ORDER BY month))
        / LAG(revenue) OVER (PARTITION BY department ORDER BY month), 1) AS mom_pct
FROM monthly
ORDER BY department, month;

-- T19 [Віконні] Топ-3 країни за кількістю зареєстрованих користувачів для кожного джерела трафіку
WITH c AS (
  SELECT u.traffic_source, u.country, COUNT(*) AS users_cnt
  FROM `bigquery-public-data.thelook_ecommerce.users` u
  GROUP BY u.traffic_source, u.country
),
r AS (
  SELECT traffic_source, country, users_cnt,
    ROW_NUMBER() OVER (PARTITION BY traffic_source ORDER BY users_cnt DESC) AS rn
  FROM c
)
SELECT traffic_source, country, users_cnt, rn
FROM r
WHERE rn <= 3
ORDER BY traffic_source, rn;

-- T20 [Віконні] Покажи накопичену виручку 2025 року по місяцях. У якому місяці вона перевищила половину річної?
WITH m AS (
  SELECT DATE_TRUNC(DATE(oi.created_at), MONTH) AS month, SUM(oi.sale_price) AS revenue
  FROM `bigquery-public-data.thelook_ecommerce.order_items` oi
  WHERE oi.status NOT IN ('Cancelled', 'Returned')
    AND DATE(oi.created_at) BETWEEN '2025-01-01' AND '2025-12-31'
  GROUP BY month
)
SELECT
  month,
  ROUND(revenue, 0) AS revenue,
  ROUND(SUM(revenue) OVER (ORDER BY month), 0) AS cumulative_revenue,
  ROUND(100 * SUM(revenue) OVER (ORDER BY month) / SUM(revenue) OVER (), 1) AS cumulative_pct
FROM m
ORDER BY month;

-- T21 [Віконні] У якому місяці 2025 року розрив у виручці між Men і Women був найбільшим?
WITH m AS (
  SELECT
    DATE_TRUNC(DATE(oi.created_at), MONTH) AS month,
    SUM(IF(p.department = 'Men', oi.sale_price, 0)) AS men,
    SUM(IF(p.department = 'Women', oi.sale_price, 0)) AS women
  FROM `bigquery-public-data.thelook_ecommerce.order_items` oi
  JOIN `bigquery-public-data.thelook_ecommerce.products` p ON oi.product_id = p.id
  WHERE oi.status NOT IN ('Cancelled', 'Returned')
    AND DATE(oi.created_at) BETWEEN '2025-01-01' AND '2025-12-31'
  GROUP BY month
)
SELECT
  month, ROUND(men, 0) AS men, ROUND(women, 0) AS women, ROUND(men - women, 0) AS gap,
  RANK() OVER (ORDER BY ABS(men - women) DESC) AS gap_rank
FROM m
ORDER BY month;

-- T22 [Віконні] Яка частка покупців у 2025 році зробила 2 і більше замовлень?
WITH c AS (
  SELECT
    o.user_id,
    COUNT(DISTINCT IF(o.status NOT IN ('Cancelled', 'Returned'), o.order_id, NULL)) AS orders_ok,
    COUNT(DISTINCT o.order_id) AS orders_all
  FROM `bigquery-public-data.thelook_ecommerce.orders` o
  WHERE DATE(o.created_at) BETWEEN '2025-01-01' AND '2025-12-31'
  GROUP BY o.user_id
)
SELECT
  COUNTIF(orders_ok >= 1) AS buyers,
  COUNTIF(orders_ok >= 2) AS repeat_buyers,
  ROUND(100 * COUNTIF(orders_ok >= 2) / COUNTIF(orders_ok >= 1), 1) AS repeat_pct,
  ROUND(100 * COUNTIF(orders_all >= 2) / COUNT(*), 1) AS repeat_pct_all
FROM c;

-- T23 [Відносні дати] Яка виручка за минулий місяць?
SELECT
  DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH), MONTH) AS month_start,
  ROUND(SUM(oi.sale_price), 0) AS revenue
FROM `bigquery-public-data.thelook_ecommerce.order_items` oi
WHERE oi.status NOT IN ('Cancelled', 'Returned')
  AND DATE(oi.created_at) >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH), MONTH)
  AND DATE(oi.created_at) < DATE_TRUNC(CURRENT_DATE(), MONTH);

-- T24 [Відносні дати] Як змінилася виручка в останньому завершеному кварталі порівняно з попереднім?
WITH q AS (
  SELECT DATE_TRUNC(DATE(oi.created_at), QUARTER) AS quarter, SUM(oi.sale_price) AS revenue
  FROM `bigquery-public-data.thelook_ecommerce.order_items` oi
  WHERE oi.status NOT IN ('Cancelled', 'Returned')
    AND DATE(oi.created_at) >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), QUARTER), INTERVAL 2 QUARTER)
    AND DATE(oi.created_at) < DATE_TRUNC(CURRENT_DATE(), QUARTER)
  GROUP BY quarter
)
SELECT
  quarter,
  ROUND(revenue, 0) AS revenue,
  ROUND(100 * (revenue - LAG(revenue) OVER (ORDER BY quarter)) / LAG(revenue) OVER (ORDER BY quarter), 1) AS growth_pct
FROM q
ORDER BY quarter;

-- T30 [Мова] What was the revenue by department in 2025?
SELECT p.department, ROUND(SUM(oi.sale_price), 0) AS revenue
FROM `bigquery-public-data.thelook_ecommerce.order_items` oi
JOIN `bigquery-public-data.thelook_ecommerce.products` p ON oi.product_id = p.id
WHERE oi.status NOT IN ('Cancelled', 'Returned')
  AND DATE(oi.created_at) BETWEEN '2025-01-01' AND '2025-12-31'
GROUP BY p.department
ORDER BY revenue DESC;

