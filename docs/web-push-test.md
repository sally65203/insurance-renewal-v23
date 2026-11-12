# 續保 App 推播測試

這個分支需要獨立的 HTTPS 測試網址與 Supabase 測試專案。測試頁只會同步由「建立／開啟測試保單」建立的保單。請使用合成資料。

## 部署

1. 在測試專案執行 `supabase/migrations/20261112000100_renewal_push.sql`，啟用 `pg_cron` 及 `pg_net`。部署 `renewal-push` Edge Function，使用本分支的 `supabase/config.toml`。函式自行驗證測試授權碼和排程金鑰。
2. 在 Supabase 的 Edge Function Secrets 設定下列值。兩組私密金鑰請各自產生至少 32 字元的隨機值，請勿加入 Git。
   - `PUSH_APP_ORIGIN` 為測試網址的來源，例如 `https://preview.example.com`。只填協定和網域。
   - `PUSH_TEST_KEY` 為測試授權碼。
   - `PUSH_CRON_KEY` 為排程呼叫金鑰。
   - `PUSH_VAPID_PUBLIC_KEY`、`PUSH_VAPID_PRIVATE_KEY` 為 Web Push VAPID 金鑰對，可用 `npx web-push generate-vapid-keys` 產生。`PUSH_VAPID_SUBJECT` 使用可聯絡的 `mailto:` 信箱。
3. 在 Supabase Vault 建立兩個 secret。將 Edge Function 完整網址存成 `renewal_push_url`，把相同的排程呼叫金鑰存成 `renewal_push_cron_key`，再執行：

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
  );
$$);
```

## iPhone 驗證

1. 在 Safari 開啟獨立測試網址，加入主畫面，再從新圖示打開。輸入服務網址、VAPID 公開金鑰、測試授權碼，點「開啟通知」並允許。
2. 點「建立／開啟測試保單」，再按「傳送測試通知」。確認鎖定畫面顯示 `續保提醒｜TEST-123｜強制險`，點通知會開啟測試保單。
3. 更改到期日並儲存，確認提示為已同步，並查詢 `renewal_push_jobs`。同一測試保單只應有一筆排程，日期是到期日前一個月的台灣時間上午 9 點。改為「已續保」或「不續保」後，該筆排程應移除。
4. 選一個未來的提醒日期，確認到點時關著 App 仍收到通知。實測結束後點「停用通知」，以移除這部裝置的訂閱及尚未發出的排程。
5. 開發端可執行 `npm test`。Edge Function 推播服務接受請求後，仍需在 iPhone 確認通知是否實際送達。
