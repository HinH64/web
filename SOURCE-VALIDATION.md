# 書源驗證紀錄

書源範圍是 `web/lib/reader/requested-sources.ts` 的 60 個名稱。驗證一律透過 `npm run test:sources`，走與 app 相同的服務，結果只代表執行當下的環境與網路位置，不代表永久可用。

## 已接通（7 個）

2026-11-02 以 `test:sources` 完成搜尋 → 目錄 → 正文，並在本機 Workers 執行環境及瀏覽器驗證。請求由本機網路發出，尚未在部署環境驗證。

| 來源 | 網址 | 特點 |
| --- | --- | --- |
| 微風小說網 | m.wfxs.tw、www.wfxs.tw | 手機版目錄分頁，改用桌面版的完整目錄 |
| 思兔閱讀 | sto55.com | 完整目錄在獨立的 ajax 頁；書籍頁沒有作者資料 |
| 小說狂人 | czbooks.net | 正文夾雜站點文字，以規則清除 |
| 黃金屋中文 | tw.hjwzw.com | 唯一結果時直接顯示書籍頁 |
| 玫瑰言情網 | www.mgyqw.com | GBK；查詢須轉簡體；目錄按欄排列，須依章節 ID 排序 |
| ESJ 輕小說 | www.esjzone.cc | 連線偶有逾時 |
| 飄天文學 | www.piaotia.com | GBK；唯一結果時轉址到 http 的書籍頁；頁面沒有 body 標籤 |

抽樣書名《凡人修仙傳》《鬥破蒼穹》在 5 個來源找到，《詭秘之主》《大奉打更人》《遮天》在 4 個來源找到。

## 待接通（53 個）

以下為 2026-11-02 由本機對每個候選網站讀取一次首頁的結果，只代表當時的網站狀態，未測試搜尋及章節。候選網址來自公開的 Legado 清單，同名網站可能不是使用者原本使用的那個。

| 狀態 | 來源 |
| --- | --- |
| 首頁可讀，站名相符 | UU看書（www.uuread.tw）、就愛讀小說（m.95dxs.com）、福書網（www.fushuzhijia.com）、繁體小說網1（www.xiaoshuo.com.tw，搜尋回應 403）、努努書坊（www.kanunu8.com）、飯飯小說（www.ffxs8.com）、芒果書坊（www.mangguoshufang.com）、無憂書城（www.51shucheng.net）、腐小說（www.fuxsb.com）、半夏小說（www.xbanxia.cc）、天涯書庫（www.tianyabooks.com）、筆趣閣小說（www.seebook.net）、天天書吧（www.ttshu8.net）、夢遠書城（www.guxuo.com）、輕小說百科（lnovel.org）、全本小說（www.qb5.io）、52書庫（www.52shuku.net）、筆仙閣（www.bixiange.top）、大美書網（www.dameishuwang.net）、愛麗絲書屋（www.alicesw.com） |
| 首頁可讀，須確認是否同一網站 | 輕小說文庫及神湊輕小說（皆對應 m.wowenku.com）、讀小說（www.tadu.com）、鎮魂小說（www.zhenhunxiaoshuo.com）、元小說（www.2cyread.com）、同人小說網（www.trxs.cc）、鉛筆小說（www.178xs.cc）、筆趣閣（www.wqge.cc）、101小說（novel101.com） |
| 首頁被拒或連不到 | 69書吧、零點看書、台灣小說網、天翼文學、同人社、國學導航、宙斯小說、有度中文網 |
| 未找到候選網址 | 櫻下書院、時空小說網、小說王耽美、捉摸書屋、虛閣上、古籍大全、微風小說網、吾要讀、青檸言情網、破萬卷小說、筆速閣、同人館、老筆趣閣、全本同人網、蜂鳥小說網、小說王 |

微風小說網可能與已接通的「微風小說1」是同一網站，待確認。

SF 輕小說與中文維基文庫不在書源範圍內，已移除。舊書架中這些來源的書籍與進度仍會保留，可從更新頁移出。

## 舊紀錄不再採用

先前把小說狂人、UU看書、69書吧標為「存取受限」、夢遠書城及黃金屋中文標為「部分驗證」的結果已撤銷。留下的探測腳本沒有設定請求標頭，也不是 app 的請求流程；同一天以 app 的請求標頭只讀取首頁時，小說狂人與 UU看書已回應 200。這些網站待接通時重新以 `test:sources` 驗證。

## 參考 App 的公開配置

- [愛閱書香開發者的介紹與教學](https://jxd524.github.io/2017/08/02/iFreeTime/)說明自訂來源與書源管理。
- [small-bao/iosread](https://github.com/small-bao/iosread) 的兩個抽樣 `.ibs` 檔案含 `configs.json`，ZIP 標頭顯示加密旗標與 AES 壓縮標記。此觀察僅適用這兩個樣本；本版沒有聲稱支援全部 `.ibs`。
- [tickmao/Novel](https://github.com/tickmao/Novel) 的公開 Legado 配置提供來源技術參考。第三方來源規則可能包含腳本、過時網址或需要權限的端點；本版不執行匯入配置的 JavaScript，也沒有直接複製整套配置。

## 實作界線

每個書源只能請求自己設定的 HTTPS 網域；重新導向最多跟隨 3 次，且目的地必須在同一份網域清單內。章節必須存在於該書的目錄中。HTML 在伺服器解析後只回傳文字，閱讀頁保留作者及原站連結。需要登入或付費的章節導向原站。遇到驗證頁或封鎖時，服務回報 `blocked`，不嘗試繞過。

目錄更新檢查會實際重新抓取來源，和原目錄 ID 比較；逾時或解析失敗不會覆寫成「無更新」。網站關閉後持續追更及推播尚未實作。
