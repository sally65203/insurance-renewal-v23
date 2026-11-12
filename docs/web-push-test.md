# 續保 App 推播測試

使用獨立 HTTPS 測試網址及專用 Supabase 測試專案。測試頁只會同步由「建立／開啟測試保單」建立的資料。

## 部署

1. 在專用測試專案執行 `supabase/migrations/20261112000100_renewal_push.sql`。遷移啟用 `pg_cron`、`pg_net` 並在 Vault 產生通知測試碼和排程金鑰。
2. 部署 `renewal-push` Edge Function。使用其他測試網址時，更新函式的 `allowedOrigin`。函式自行驗證測試碼與排程金鑰。第一次獲授權的呼叫會產生 VAPID 金鑰並存入 Vault。
3. 將服務完整網址存入 Vault，名稱為 `renewal_push_url`，並安裝排程：

```sql
select cron.schedule('renewal-push-dispatch', '* * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'renewal_push_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Renewal-Key', (select decrypted_secret from vault.decrypted_secrets where name = 'renewal_push_cron_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  )
  where exists (
    select 1 from public.renewal_push_jobs
    where sent_at is null and due_at <= now() and due_at > now() - interval '1 day'
      and (lease_until is null or lease_until <= now())
  );
$$);
```

4. 測試頁使用完整服務網址與 VAPID 公開金鑰。VAPID 私密金鑰及排程金鑰留在 Vault，測試碼只提供給測試者。

## iPhone 驗證

1. 在 Safari 開啟獨立測試網址，加入主畫面，再從新圖示打開。輸入測試碼，點「開啟通知」並允許。
2. 點「建立／開啟測試保單」，再按「傳送測試通知」。確認鎖定畫面顯示 `續保提醒｜TEST-123｜強制險`，點通知會開啟測試保單。
3. 更改到期日後，確認同一保單的排程日期更新。改為「已續保」或「不續保」後，排程應移除。
4. 使用未來的提醒日期驗證實際排程。在測試結束後，點「停用通知」以移除訂閱和未發出的排程。
