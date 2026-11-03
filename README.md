# 拾光 · 中文閱讀器

桌面優先的繁體中文 Web 閱讀器，在本機執行，以瀏覽器開啟。開發計畫見 [PLAN.md](PLAN.md)，實際書源驗證見 [SOURCE-VALIDATION.md](SOURCE-VALIDATION.md)。

## 第一版

- 統一書源服務：所有網站走同一套請求、解析、快取與錯誤分類；目前接通 20 個來源，見 [SOURCE-VALIDATION.md](SOURCE-VALIDATION.md)。
- 依書名／作者搜尋、完整章節目錄、加入書架、連續捲動閱讀。
- 起點榜單：9 個榜、15 個分類，每榜前 20 名；點選後在已接通的來源中找書名及作者相符的書。
- 本機閱讀位置、書籤、字級／行距／寬度／字體／繁簡設定、三種閱讀背景。
- 手動與使用期間每 15 分鐘目錄更新檢查；檢查失敗保留上次成功結果。
- 下一章預載、最多 60 章快取；離線時可讀已快取的章節。
- 鍵盤操作、響應式排版、JSON 備份與還原。不做 PWA。
- 書源範圍即使用者提供的 60 個名稱，分別標示可使用或待接通。

## 本機執行

需求：Node.js >= 22.13、npm。在此資料夾執行：

```powershell
npm install
npm run build
npm start
```

日常使用開啟 <http://127.0.0.1:5174>。開發時改用 `npm run dev`，網址是 <http://127.0.0.1:5173>。書籍資料由 API 即時取自來源網站，首次讀取需網路；進度與快取保存在瀏覽器的 IndexedDB，並依網址分開，所以兩個網址的書架互不相通。

兩個指令都只綁定本機，同一網路的其他裝置無法連線。API 沒有登入機制，開放給其他裝置或部署前須先加上存取控制。

```powershell
npm run typecheck
npm test
npm run test:live
npm run test:sources
npm run test:e2e
npm run lint
```

`npm test` 使用固定樣本，可離線執行。`test:sources` 以 app 相同的服務測試所有已接通書源（搜尋 → 目錄 → 正文）並列出未接通的名稱，需要網路。網路來源可能變動或逾時。

`test:e2e` 需先 `npm run build`，並需要 Chrome 或 Edge（其他路徑以 `BROWSER` 指定）。它在空的 port 上啟動正式版，用暫時的無頭瀏覽器走一遍：找書 → 加入書架 → 讀下一章 → 重開恢復位置 → 離線讀快取 → 來源失敗時改用其他來源 → 備份還原 → 清除章節快取 → 從榜單開啟一本書。使用真實書源及起點榜單，網站故障時可能失敗；不使用你瀏覽器的資料，結束後刪除。

## 新增書源

1. 在 `lib/reader/sources/registry.ts` 以 `REQUESTED_SOURCES` 中的名稱新增設定：允許的網域與解析規則（URL 範本、CSS selector）。可用選項見 `lib/reader/sources/types.ts`。
2. 執行 `npm run test:sources`；在指令後加上書名可同時檢查各來源的重疊情況，例如 `npm run test:sources -- 凡人修仙傳`。

規則已支援 POST 搜尋、GBK／Big5 查詢與頁面、獨立目錄頁、一章多頁、唯一結果直接進入書籍頁、依章節 ID 排序、正文清理及格式錯亂頁面的文字擷取。規則無法描述的網站，可寫自訂 adapter 並經 `createSourceService` 的 `adapters` 註冊。其餘程式不需修改。

## 程式位置

| 位置 | 用途 |
| --- | --- |
| `components/reader/app.tsx` | 版面、側欄與工作區路由 |
| `components/reader/library-context.tsx` | 書架狀態、儲存、更新檢查 |
| `components/reader/search-view.tsx`、`book-view.tsx`、`lists-view.tsx`、`settings-view.tsx` | 首頁與搜尋、書籍與目錄、更新與書籤、設定 |
| `components/reader/ranks-view.tsx` | 榜單，以及點選後在已接通來源找書 |
| `lib/reader/rank.ts`、`rank-service.ts` | 榜單與分類清單；讀取並解析起點手機版榜單、快取 |
| `components/reader/reader-view.tsx` | 閱讀、段落定位、書籤、換源與來源失效切換 |
| `lib/reader/route.ts`、`search-store.ts` | 網址路由、跨來源搜尋 |
| `app/api/library/route.ts` | 書源及榜單 API |
| `lib/reader/sources/service.ts` | 統一書源服務：識別碼驗證、快取、章節歸屬檢查 |
| `lib/reader/sources/registry.ts` | 已接通書源的設定與解析規則 |
| `lib/reader/sources/rule-engine.ts` | 依規則執行搜尋／目錄／正文解析 |
| `lib/reader/sources/http.ts` | 請求層：網域白名單、轉址、限流、頁面解碼、錯誤分類；可替換傳輸方式 |
| `lib/reader/sources/encoding.ts` | GBK／Big5 查詢字串編碼 |
| `lib/reader/storage.ts` | IndexedDB：逐筆保存書架與書籤、舊資料遷移、分頁同步、章節快取 |
| `lib/reader/reading.ts` | 更新差異、段落定位、紀錄與備份驗證、變更比對 |
| `lib/reader/works.ts` | 按書名合併來源、選擇來源、跨來源對應章節 |
| `lib/reader/requested-sources.ts` | 60 個書源名稱，即書源範圍 |

## 目前界線

書架與紀錄依瀏覽器保存，尚未加入帳戶與跨裝置同步。沒有關閉後的背景排程、推播、TTS、TXT / EPUB 匯入或 `.ibs` 通用匯入。同一本書只佔書架一格；換來源時依章節名稱對應，無法確定時由使用者選擇章節。

榜單只有起點男生網各榜前 20 名：之後的名次及女生網都拒絕這個 app 讀取。

書源只讀取公開可取得的文字。付費、需登入、外連或網站驗證的章節提供原站入口。新增來源須完成實際取用驗證後才加入可搜尋列表。

採用標準 Next.js，目前以本機使用為目標，不需要資料庫或外部帳戶。閱讀內容不寫入 Git。
