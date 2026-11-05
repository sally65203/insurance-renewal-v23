# 產險續保 V2.3 正式版
版本：2.3.0；發布日期：2026-11-05。

使用網址：https://sally65203.github.io/insurance-renewal-v23/

[發布與更新說明](docs/V2.3.0-release.md) · [驗收報告](docs/V2.3-acceptance-2026-11-05.md)

支援 Google Calendar 方案 A、Excel 清冊匯入、PDF 附件預覽與手動 JSON 備份還原。固定從同一個 V2.3 主畫面入口使用；Google 授權可能需重做，關閉系統不背景同步新異動。iCloud Drive 備份為手動，CSV 不包含 PDF、不能還原。

沿用既有 V2.3 網址、manifest 身分與資料庫，無需重新安裝或清除資料。原 insurance-renewal main V2.2 保持不變，資料不自動合併。請勿同時對同一批提醒進行 ICS 手動匯入與 API 同步。

驗證：npm test（16 項模擬回歸）。完整的自動測試與使用者實機回報界線見驗收報告。私有 Excel、PDF、JSON、Google 密鑰及 token 不得上傳公開儲存庫。

來源：[原開發分支](https://github.com/sally65203/insurance-renewal/tree/feature/v2.3-calendar-export)；RC2 修正與本次正式發布位於本獨立儲存庫。
