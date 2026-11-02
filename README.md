# 拾光 · 中文閱讀器

桌面優先的繁體中文 Web / PWA 閱讀器。原始碼位於 `web/`，開發計畫見 [PLAN.md](PLAN.md)，實際書源驗證見 [SOURCE-VALIDATION.md](SOURCE-VALIDATION.md)。

## 第一版

- ESJ 輕小說、SF 輕小說、中文維基文庫的獨立書源介接。
- 依書名／作者搜尋、完整章節目錄、加入書架、連續捲動閱讀。
- 本機閱讀位置、書籤、字級／行距／寬度／字體／繁簡設定、三種閱讀背景。
- 手動與使用期間每 15 分鐘目錄更新檢查；檢查失敗保留上次成功結果。
- 下一章預載、最多 60 章快取、正式版應用程式外殼離線載入。
- PWA 圖示與安裝描述、鍵盤操作、響應式排版、JSON 備份與還原。
- 完整保留使用者提供的 60 個書源名稱，分別標示可使用、部分驗證、存取受限或待驗證。

## 本機執行

需求：Node.js >= 22.13、npm。於 `web/` 內執行：

```powershell
npm run install:ci
npm run dev -- --hostname 127.0.0.1 --port 5173
```

使用終端顯示的網址開啟。書籍資料由 API 即時取自來源網站，首次讀取需網路；進度與快取保存在瀏覽器的 IndexedDB。離線應用程式外殼應以正式建置測試。

```powershell
npm run typecheck
npm test
npm run test:live
npm run build
npm run start -- --port 5174
```

`test:live` 會驗證三個實際來源，需要網路；固定邏輯測試可離線執行。網路來源可能變動或逾時，應先查看書源管理中的連線結果。

## 程式位置

| 位置 | 用途 |
| --- | --- |
| `web/app/page.tsx` | 書架、搜尋、更新、書籤、書源與設定 |
| `web/app/reading-room.tsx` | 閱讀、段落定位、書籤、章節操作 |
| `web/app/api/library/route.ts` | 書源 API |
| `web/lib/reader/sources.ts` | 網域白名單、搜尋／目錄／正文 adapters |
| `web/lib/reader/storage.ts` | IndexedDB、書籍／章節快取 |
| `web/lib/reader/reading.ts` | 更新差異、段落定位與備份驗證 |
| `web/lib/reader/requested-sources.ts` | 60 個候選書源與已驗證狀態 |
| `web/public/sw.js` | 正式版應用程式外殼與靜態資源離線快取 |

## 目前界線

書架與紀錄依瀏覽器保存，尚未加入帳戶與跨裝置同步。沒有關閉後的背景排程、推播、TTS、TXT / EPUB 匯入或 `.ibs` 通用匯入。各版本書籍的進度分別保存；更換來源時請確認書名、作者、版本與章節。

書源只讀取公開可取得的文字。付費、需登入、外連或網站驗證的章節提供原站入口。新增來源須完成實際取用驗證後才加入可搜尋列表。

採用 Sites 的 Vinext starter；應用程式本身不需要 D1、R2 或其他外部帳戶。Sites 託管保持個人私有範圍。閱讀內容不寫入 Git 或部署檔案。
