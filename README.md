# 產險續保 V2.3 RC1 獨立測試站

程式來源：[insurance-renewal 開發分支](https://github.com/sally65203/insurance-renewal/tree/feature/v2.3-calendar-export)，基準提交 `6f06d01613acedb0e410fed5724dec373f06e82a`。

本儲存庫專供測試，原儲存庫 main 的 V2.2 及其 Pages 設定不變。

## 啟用測試網址

只在本儲存庫 Settings → Pages，Source 選 Deploy from a branch，Branch 選 main，資料夾選 /(root)，按 Save。
預期網址：https://sally65203.github.io/insurance-renewal-v23/
**提交程式不等於已發布；以 Pages 部署成功為準。**

## 連線測試

1. 從 V2.2 下載 JSON 備份後，在測試站還原。測試版使用獨立 IndexedDB，不會自動讀入 V2.2 保單。
2. 在「Google 行事曆同步」填入 OAuth client ID 及專用日曆 ID。這些值由使用者在瀏覽器填入，不內嵌在公開程式。
3. Google 已授權 JavaScript 來源維持 `https://sally65203.github.io`（不加儲存庫路徑）。登入已加入測試使用者的 Google 帳號，自行授權。
4. 先用少量測試保單核對新增、修改、已續保／不續保取消，以及重複同步是否只留一筆提醒。
5. iPhone Safari、加入主畫面、Google Calendar 通知及 iCloud Drive JSON 手動備份還原仍待實機驗收。

不要上傳保單、Excel、PDF、JSON 備份、Google 用戶端密鑰或 token 到公開儲存庫。
不要同時用 ICS 手動匯入和 API 同步同一批提醒。

## 驗證

`npm test`：14 項模擬回歸案例。先前私有 XLS 清冊 87/87 匯入、重匯新增 0 筆；原資料不入 Git。
完整結果及限制見 [測試指南](docs/V2.3-RC1-test-guide.md)。尚未通過 Google 真實 API 及 iPhone 通知驗收，不是正式版。
