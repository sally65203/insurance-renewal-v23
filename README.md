# 產險續保 V2.3 RC2

目前維持 RC2，尚未標示正式發布。原 insurance-renewal main V2.2 不變。

測試站：https://sally65203.github.io/insurance-renewal-v23/

最新結果及尚待確認項目見 [2026-11-05 驗收報告](docs/V2.3-acceptance-2026-11-05.md)。

- 本次 GitHub 原始碼回歸：16/16 通過；Google 線上同步、iPhone 指定時間通知、取消提醒、PDF 已取得使用者回報。
- 新主畫面入口完整資料核對、原全天通知時刻仍需確認；不同入口資料不保證共用。
- 固定同一 V2.3 圖示使用；新入口先以 JSON 還原及核對，才連接 Google。
- Google 授權可能需重做，token 不寫入備份。關閉系統不背景同步，已同步事件由行事曆提醒。
- iCloud Drive 為手動 JSON 備份；CSV 不包含 PDF、不能還原。
- 同批資料不要同時用 ICS 匯入與 Google API 同步。
- 不要將客戶資料、原始 Excel/PDF/JSON、Google 密鑰或 token 上傳到公開儲存庫。

程式來源：[原開發分支](https://github.com/sally65203/insurance-renewal/tree/feature/v2.3-calendar-export)，基準 6f06d01613acedb0e410fed5724dec373f06e82a。後續 RC2 修正在本儲存庫，未合併到原 main。

驗證：npm test。較早指南保留為歷史：[RC1](docs/V2.3-RC1-test-guide.md)、[RC2](docs/V2.3-RC2-test-guide.md)。
