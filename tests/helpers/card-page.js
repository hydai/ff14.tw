// 角色卡產生器頁的頁面替身，給 tests/character-card-page.test.js 共用（Task 6、7 的測試也用它，會再擴充）。
// 這是輔助模組，不是測試檔（只有 tests/*.test.js 會被 node --test 執行）。作法照 tests/helpers/chocobo-page.js 與 macro-page.js。
//
//   const { createCardPage } = require('./helpers/card-page.js');
//   const page = await createCardPage({ lang: 'en', stored: { ff14tw_character_card: JSON.stringify({ name: 'Luna Starweaver' }) }, narrow: true });
//   page.type('cardName', 'Luna Starweaver'); page.select('cardMainJob', 'Pictomancer'); page.press('formatPortrait'); page.toggle('hours-weekday-evening');
//   page.chip('cardLikes', 'msq').click(); page.key('ArrowRight', page.$('tab-basic')); page.setLang('ja'); page.setNarrow(false);
//   page.texts(); page.drawCalls(); page.stored; page.toasts; page.consoleErrors; await page.flush();
//   const again = await page.reopen();
//   page.pick(page.file({ width: 4000, height: 1500 })); await page.flush(); page.slide(150); page.drag([[300, 200], [330, 205]]); page.pointer('down', { pointerType: 'touch' });
//   page.focus('cardName'); page.press('downloadCard'); await page.flush(); page.downloads; page.shares; page.shareCalls; page.clipboardCalls; page.clipboardWrites;
//   page.blobRequests(); page.releaseFonts(); page.setBlobFails(true); page.$('imageViewer').classList.contains('active');
//   page.createdCanvases(); // 頁面自己建的 canvas（縮圖、模糊小圖…）
//
// - 照 index.html 建出 #cardTool 與全螢幕大圖 #imageViewer（mountFromHtml），照 index.html 的 <script src> 順序載入這個工具的翻譯檔、共用的 ff14-game-data.js、
//   工具目錄自己的每一個腳本（src 不含 /：card-state.js、card-layout.js、card-renderer.js、card-export.js、script.js…），最後 new CharacterCardApp()，
//   等 app.ready 才回傳（fontsDelay 時不等：字型一直沒回來，ready 就一直沒完成，要先 releaseFonts()）。
//   頁首與頁尾（layout-loader.js）、common.js、i18n-manager.js、modal-manager.js 與共用翻譯檔不載入，用到的部分改用下面的替身：
//   頁面程式只能用 FF14Utils.getI18nText() 與 showToast()，不能用 SecurityUtils；ModalManager 是下面的 FakeModalManager
// - i18n 替身從真正的翻譯檔取字（en、ja 找不到時退回 zh，同 I18nManager）並代入 {參數}；setLang(next) 照 I18nManager.setLanguage()
//   先依 [data-i18n] 重新翻譯頁面，再依序呼叫登記的語言監聽。建立頁面之前先照 lang 翻譯一次（同 DOMContentLoaded 時的順序）
// - FF14Utils 替身只有 getI18nText 與 showToast；toasts 記下每一次 showToast() 的 { message, type }
// - storage 是 localStorage 背後的 Map（stored 選項是初始內容：鍵 -> 字串；回傳的 stored 是這份 Map 本身，讀得到頁面現在寫進去的東西）。
//   storageThrows：光是讀 localStorage（裸的全域或 window.localStorage）就丟例外（Chrome 封鎖網站資料時是 SecurityError），
//   存取器要在 vm 的 context 裡面定義，理由見 panel-page.js
// - 頁面的 console 只有 log、error、warn，都不印到真的 console，三種都記在 consoleErrors：頁面不該在 console 留下任何東西，
//   所以期待 consoleErrors 是空的測試也擋得住多出來的除錯訊息（每一筆是 util.format(...參數) 的結果，同 Node 的 console）
// - setTimeout／clearTimeout 只記下、不真的計時（清除全部的 3 秒用的是它）：runTimeouts() 把呼叫當下排著的（沒清掉、還沒跑過的）各跑一次，
//   跑的時候新排的留到下一次；pendingDelays() 是排著的計時器的延遲毫秒數（沒清掉、還沒跑過的，照排的順序）。flush() 等 promise 都跑完
// - canvas：每個 <canvas> 都補上 getContext('2d')、toBlob、toDataURL，width／height 是屬性的存取器。getContext('2d') 回傳
//   tests/helpers/canvas-recorder.js 的記錄 context；和真的 canvas 一樣，設定 width 或 height（就算設成原本的值）會清掉畫面並重設 context，
//   所以 drawCalls() 只看得到最近一次畫的東西（每次畫之前都要設寬高；頁面少設的話，記錄會一直累積，測試看得出來）。
//   drawCalls() 是頁面那張 canvas（#cardCanvas）現在的 context 記下的呼叫，texts() 是其中每一次 fillText 畫的字，drawCount() 是 getContext 被呼叫了幾次
//   （＝畫了幾次）。toBlob(callback, type, quality) 把 { type, quality } 記在 blobRequests 後非同步呼叫 callback(blob)，toDataURL(type) 回傳固定的 data URL
//   createdCanvases() 是頁面自己建的每一張 canvas（頁面呼叫 document.createElement('canvas') 的結果，照建的順序；index.html 裡本來就有的 #cardCanvas 不算）：
//   每一筆是 { element, width, height, created, calls }。element 是那張 canvas 本身（拿來和 drawImage 的第一個參數比，要用 ===）；width、height 是現在的大小
//   （頁面把它放掉就是 0，同真的 canvas 設成 0 的放掉法）；created 是第一次 getContext('2d') 的當下的大小 [寬, 高]（頁面都是建出來設好寬高就馬上畫，所以就是建出來的大小；
//   沒呼叫過是 null）；calls 是它現在的 context 記下的呼叫（設定寬高會清掉，所以放掉的 canvas 是 []，沒呼叫過 getContext 也是 []）。
//   縮圖用的暫存 canvas 與名片的模糊小圖都在這裡
// - document.fonts：load(font, text) 把 { font, text } 記在 fontLoads，回傳 Promise<[]>。fontsDelay 是 true 時 load() 一直不回來：同一次畫
//   （同一次 getContext）請求的 load() 算一批（頁面每畫一次就請求一批），heldFontBatches() 是還在等的每一批（照請求的順序，每一批是 [{ font, text }]）；
//   releaseFonts() 讓還在等的每一批回來，releaseFonts(index) 只放行還在等的第 index 批（0 起算），模擬後請求的字型先載完、慢的那一批還在等；
//   第二個參數 { fail: true } 讓那一批的 load() 被拒絕（像瀏覽器載入字型失敗：NetworkError）而不是成功。之後新的 load() 又會等。ready 是已經完成的 Promise
// - Image：new Image() 的 src 設好後，看 src 分成兩種。職業圖示（一般的路徑）：icons 選項決定它怎麼結束：'load'（預設）一個 microtask 後載入成功
//   （complete、naturalWidth 64、onload），'fail' 一個 microtask 後失敗（complete、naturalWidth 0、onerror），'hold' 一直不結束，
//   finishImages(ok) 才讓還沒結束的每一張照 ok 結束。images 是職業圖示的每一張（{ src, complete, naturalWidth, finish(ok) }）。
//   角色圖（src 是 blob: 或 data:）：pictures 是這種的每一張（{ src, file, complete, naturalWidth, naturalHeight, finish(ok) }），
//   blob: 是上傳的檔案（URL.createObjectURL(file) 的結果）：大小是 file.width、file.height，file.broken 時讀不出來（onerror），撤掉（revokeObjectURL）之後才載入的也讀不出來
//   （和瀏覽器一樣）；data: 是頁面存著或轉出來的圖（canvas 的 toDataURL 替身轉出來的，內容是 'canvas 寬x高'），大小讀回那個寬高，不是這種內容的讀不出來。
//   都是一個 microtask 後結束，除非 file.hold 是 true（那個檔案的 blob: 圖一直不結束）或 pictureLoads 選項是 'hold'（所有 data: 圖一直不結束，
//   restore 與轉出來之後再讀回來的圖都算），finishPictures(ok) 讓還沒結束的每一張結束，finishFile(file, ok) 只讓那個檔案的那一張結束（ok 是 false 就讀不出來）
// - 上傳：file({ name, type, width, height, broken, hold }) 回傳假的 File（只有 name、type、size 與這幾個欄位，傳給 URL.createObjectURL 才認得；
//   不是物件的東西丟 TypeError，和瀏覽器一樣）；pick(...檔案) 照瀏覽器選檔案：#cardImageInput.files 換成這些檔案（FileList 的替身：length、item()、索引、迭代，
//   沒有陣列的方法），派送 input 與 change；沒給檔案是取消（files 空的）。頁面把 input.value 設成 ''，files 就清空（和瀏覽器一樣，設成別的字丟錯）。
//   objectUrls 是 { created, revoked }：每一次 URL.createObjectURL／revokeObjectURL 的網址
// - 滑桿與拖曳：slide(值, { release }) 設定 #imageZoom 的值並派送 input，release（預設 true）再派送 change（disabled 的滑桿丟錯：使用者動不了）；
//   pointer(類型, { x, y, id, pointerType, button, buttons }) 在卡片的 canvas 上派送 pointerdown／move／up／cancel（類型寫 'down'、'move'、'up'、'cancel'；x、y 是 clientX、clientY，
//   id 預設 1、pointerType 預設 'mouse'、button 預設 0），會冒泡、可取消，回傳事件；事件的 buttons（MouseEvent.buttons：左鍵 1、右鍵 2、中鍵 4）照瀏覽器：
//   pointerdown 到 pointerup／pointercancel 之前是按著的那顆按鍵（替身自己記著哪個 pointer 按著），其他時候（只是在卡片上移動、放開的那一刻）是 0；
//   傳 buttons 就照傳的（例如放開的事件沒收到，之後滑鼠只是移過卡片：{ buttons: 0 }）。up 與 cancel 之後，canvas 還抓著那個 pointer 的話，和瀏覽器一樣
//   自己放掉並派送 lostpointercapture（canvas 呼叫 releasePointerCapture 放掉抓著的 pointer 也一樣）；lose(id) 只派送 lostpointercapture（抓取被拿走，沒有 pointerup、
//   pointercancel；canvas 沒抓著那個 pointer 就丟錯，瀏覽器不會送）。drag(點們, init) 是在第一個點按下、依序移動到其他每個點、在最後一個點放開。
//   captures 是 canvas 的 setPointerCapture／releasePointerCapture 呼叫與抓取的結束（{ call: 'set' | 'release' | 'lost', pointerId }）；pointerCapture 選項是 'throws' 時
//   setPointerCapture 丟 NotFoundError（瀏覽器對不在作用的 pointer 就是這樣）。getBoundingClientRect() 是 canvas 的寬高乘 displayScale
//   （選項，預設 0.5，卡片在畫面上縮成一半：拖曳的換算有 2 倍）；setDisplayScale(0) 模擬 canvas 藏起來（寬高都是 0）。dataUrlRequests 是每一次 toDataURL 的 { type, quality, width, height}
// - storageFull 選項：這些鍵的 setItem 丟 QuotaExceededError（容量已滿；讀與刪照常）。storageWrites 是每一次 setItem 的鍵（不管成不成功，照順序）
// - matchMedia 只認 '(max-width: 768px)'（narrow：頁面現在是不是手機版面）與 '(pointer: coarse)'（coarse：觸控為主的裝置），其他查詢一律丟錯。
//   回傳 { media, matches, addEventListener('change', fn), removeEventListener }；setNarrow(next)、setCoarse(next) 改值並呼叫那個查詢每個登記的 change 監聽
//   （{ matches: next, media }），不管值有沒有變
// - navigator：userAgent 預設是桌面版的 Chrome。share：false（預設，沒有 navigator.share 與 canShare）、'ok'（canShare 認得有檔案的資料，
//   share() 成功，每一筆記在 shares）、'cancel'（share() 丟 AbortError）、'fail'（share() 丟別的錯：DataError）、'no-files'（有 share，但 canShare 一律回 false）、
//   'expired'（只有在 press() 那一下點擊裡同步呼叫的 share() 才成功，之後才呼叫的丟 NotAllowedError：瀏覽器只在點擊之後的幾秒內收 navigator.share，
//   替身沒有時間，頁面先 await 了什麼才呼叫就當成手勢已經過期）、'blocked'（share() 一律丟 NotAllowedError：這裡不准分享）。
//   shareCalls 是每一次 navigator.share() 被呼叫的資料（呼叫的當下就記，不管結果；瀏覽器要求在使用者手勢裡呼叫，測試靠它看是不是同步呼叫的）。
//   clipboard：false（預設，沒有 navigator.clipboard 與 ClipboardItem）、'ok'（write() 成功）、'reject'（write() 被拒絕）。
//   clipboardCalls 是每一次 clipboard.write(items) 被呼叫的 items（呼叫的當下就記，ClipboardItem 的 data 還可能是還沒好的 Promise；Safari 要求在使用者手勢裡
//   呼叫，所以測試靠它看是不是同步呼叫的）；clipboardWrites 是寫完的：和瀏覽器一樣等每個 ClipboardItem 的內容（Blob 或 Promise<Blob>），
//   每一筆是 [{ 'image/png': Blob }…]，內容的 Promise 被拒絕時 write() 也被拒絕、不記。ClipboardItem 替身有 data 與 types。
//   fileConstructor：false 時沒有 window.File（預設有，用 Node 的 File：{ name, type, size }）。
//   downloads 是 <a download href="…"> 被點的每一次：{ file（download 的值）, href, blob（href 的 object URL 對到的那個 Blob，不是這份頁面建的是 null） }；
//   照 Firefox 的規則，連結沒有接在文件上（不在 document.body 底下）時點了沒有用，不記
// - fake-dom 的元素少了瀏覽器有的幾樣東西，這份 document 建出來的每個元素（mountFromHtml 建的與頁面自己建的）都補上
//   （只換這份 document 的 createElement，不動 fake-dom 的元素類別；換 createElement 一定要在 mountFromHtml 之前）：
//   disabled 的元素 click() 什麼都不做；勾選框與單選照瀏覽器的順序：先換 checked（單選同組的其他人取消），派送 click（被 preventDefault 就換回去、
//   不再往下），再派送 input 與 change（已經選取的單選再點只有 click）；元素本身或祖先有 hidden、或 disabled 的元素 focus() 什麼都不做
//   （瀏覽器拿不到焦點；fake-dom 的 focus() 只檢查 inert）；hidden 設成 true 時，焦點在這個元素（或它的子孫）上就掉到 body
//   （瀏覽器的行為；fake-dom 藏起來焦點照樣留著，「焦點不會掉」的測試就永遠不會失敗）。disabled 設成 true 不模擬焦點掉走。
//   hideKeepsFocus: true 時不模擬這件事（模擬 Safari：藏起有焦點的欄位時，焦點不一定掉走、也不一定送 focusout）：hidden 設成 true 之後，
//   activeElement 還是被藏起來的那個元素，也沒有 focusout；頁面要自己先讓它失去焦點（blur()）才收得掉「焦點在欄位上」的狀態（例如 .is-typing）。
//   藏起來的元素 focus() 照樣拿不到焦點
//   focus() 在焦點真的換過去之後還會在這個元素上派送 focusin（冒泡，relatedTarget 是剛失去焦點的元素，原本是 body 就是 null；fake-dom 只派送 focusout）
// - querySelectorAll() 與 .children 的結果和瀏覽器一樣：querySelectorAll() 是 NodeList 的替身（length、item()、索引、forEach()、entries()、keys()、values()、
//   迭代），.children 是 HTMLCollection 的替身（length、item()、namedItem()、索引、迭代，連 forEach() 都沒有）。兩個都沒有 map、filter、find、some、every、
//   reduce、includes、indexOf、at、flatMap、slice 這些陣列的方法：fake-dom 自己回傳一般的陣列，頁面少轉成陣列（Array.from()、[...]）時測試照樣過，
//   真的瀏覽器卻在那一行丟 TypeError（角色卡第一版就是這樣，建構函式一開始就壞掉）。頁面與測試都一樣：要用陣列的方法先 Array.from()；for...of、展開、
//   解構、.length、[0] 可以直接用。只換這份 document 與它建出來的每個元素（document、html、head、body 與 createElement 建的），不動 fake-dom 的元素類別；
//   fake-dom 的 previousElementSibling／nextElementSibling 靠父節點的 .children 是陣列，所以這兩個也在這裡自己用 childNodes 算。
//   .childNodes（瀏覽器也是 NodeList）沒有換：fake-dom 自己拿它當陣列在改節點樹，換了會壞掉；那個只靠 tests/character-card-page.test.js 的掃描擋
// - 操作：type(id, text) 照瀏覽器打字：超過 maxlength 的部分打不進去（以 UTF-16 的單位算），然後設定 value、派送 input；
//   select(id, value) 找不到有這個 value 的 option 就丟錯（瀏覽器會把值變成空的），否則設定 value、派送 input 與 change；
//   press(目標) 是 click()（click 派送的當下算在使用者手勢裡，見 share 的 'expired'）；toggle(目標) 是勾選框、單選的 click()（不是這兩種就丟錯）；focus(目標) 是 focus()（會派送 focusin）；目標可以是 id 或元素。
//   chip(群組 id, 值) 是 #cardSubJobs、#cardLikes、#cardLooking 裡 data-job、data-like、data-looking 等於值的那顆按鈕（找不到丟錯）。
//   key(鍵, 目標, init) 在目標（預設是焦點所在的元素）上派送會冒泡、可取消的 keydown（init 可以加 altKey、ctrlKey、metaKey…）並回傳事件。
//   isShown(目標) 是元素本身與祖先都沒有 hidden。
//   ModalManager 替身（FakeModalManager）：fake-dom 不支援真正的 ModalManager 用到的 :not() 選擇器（ModalManager 本身由 modal-manager-stack 測試負責），
//   所以照 chocobo-page.js 的作法：show() 記下開啟前的焦點、加 .active（或選項的 useClass）、焦點移到 [autofocus] 或第一個看得到的可聚焦元素；
//   hide() 拿掉 .active、還原焦點（開啟前的元素還在文件裡才還原），再呼叫 onClose；Esc（document 的 keydown）與點遮罩本身（不是裡面的內容）都看選項
// - reopen(overrides)：用同一份 storage 的內容與目前的介面語言再開一次頁面，overrides 蓋掉其他選項
// - dataUrlOf(寬, 高, 型別)：canvas 的 toDataURL 替身轉出來的 data URL（內容是 'canvas 寬x高'）；測試要放進 localStorage 的圖片用它，頁面讀得回來
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const util = require('node:util');
const vm = require('node:vm');

const { createFakeDom } = require('./fake-dom.js');
const { mountFromHtml } = require('./html-fragment.js');
const { createRecordingContext } = require('./canvas-recorder.js');

const ROOT = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const TOOL_DIR = 'tools/character-card';
const TRANSLATIONS = 'assets/js/i18n/translations/tools/character-card.js';
const SHARED_SCRIPTS = ['../../assets/js/ff14-game-data.js'];
const PAGE_URL = 'https://ff14.tw/tools/character-card/index.html';
const NARROW_QUERY = '(max-width: 768px)';
const COARSE_QUERY = '(pointer: coarse)';
const DESKTOP_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const SHARE_MODES = [false, 'ok', 'cancel', 'fail', 'no-files', 'expired', 'blocked'];
const CLIPBOARD_MODES = [false, 'ok', 'reject'];
const ICON_MODES = ['load', 'fail', 'hold'];
const PICTURE_MODES = ['load', 'hold'];
const CAPTURE_MODES = ['ok', 'throws'];
const POINTER_EVENTS = ['down', 'move', 'up', 'cancel'];
// MouseEvent.button（0 左、1 中、2 右）→ MouseEvent.buttons 裡那一顆的位元（1 左、4 中、2 右）
const BUTTON_BITS = [1, 4, 2];

// 頁面裡每一個 <script> 開始標籤的 src，照出現的順序（同 chocobo-page.js）
function scriptSources(html) {
    return html.split('<script').slice(1)
        .map((chunk) => chunk.slice(0, chunk.indexOf('>')).match(/\ssrc="([^"]*)"/)?.[1])
        .filter(Boolean);
}

const PAGE_HTML = read(`${TOOL_DIR}/index.html`);
// 翻譯檔、共用的遊戲資料、工具目錄自己的腳本；其他共用腳本（頁首、頁尾、common.js、modal-manager.js）不載入，用到的部分改用下面的替身
const PAGE_SCRIPTS = scriptSources(PAGE_HTML)
    .filter((src) => !src.includes('/') || src === `../../${TRANSLATIONS}` || SHARED_SCRIPTS.includes(src))
    .map((src) => path.posix.join(TOOL_DIR, src));

// canvas 的 toDataURL 替身轉出來的圖：內容是 'canvas 寬x高'，Image 的替身讀回來就是那個大小
const dataUrlOf = (width, height, type = 'image/jpeg') => `data:${type};base64,${Buffer.from(`canvas ${width}x${height}`).toString('base64')}`;

const isShown = (element) => {
    for (let node = element; node && node.nodeType === 1; node = node.parentNode) if (node.hidden) return false;
    return true;
};

// ModalManager 替身開啟時移入焦點用：同 ModalManager._getFocusableElements，依 DOM 順序列出看得到的可聚焦元素（同 chocobo-page.js）。
// fake-dom 不支援逗號與 :not() 選擇器，所以逐一走訪子孫；「看得到」是自己與祖先都沒有 hidden（真的那個看 offsetWidth），
// 停用的按鈕與 tabindex="-1" 跳過。.children 是沒有陣列方法的 HTMLCollection 替身，先 Array.from()
const isFocusable = (element) => (['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName) && !element.disabled)
    || (element.tagName === 'A' && element.hasAttribute('href'))
    || (element.hasAttribute('tabindex') && element.getAttribute('tabindex') !== '-1');
const focusableElements = (root) => Array.from(root.children).flatMap((child) => (child.hidden
    ? []
    : [...(isFocusable(child) ? [child] : []), ...focusableElements(child)]));

// FileList 的替身（<input type="file"> 的 files）：只有瀏覽器有的成員，沒有陣列的方法
class FileListLike {
    #files;

    constructor(files) {
        this.#files = files;
        files.forEach((file, index) => { this[index] = file; });
    }

    get length() { return this.#files.length; }
    item(index) { return this.#files[index] ?? null; }
    [Symbol.iterator]() { return this.#files.values(); }
}

// 檔案輸入：files 是 FileList 的替身，value 讀出來是假的路徑、設成 ''（只能設成空字串）會清掉 files。回傳換掉 files 的函式（使用者選檔案）
function patchFileInput(input) {
    let chosen = new FileListLike([]);
    Object.defineProperty(input, 'files', { configurable: true, get: () => chosen });
    Object.defineProperty(input, 'value', {
        configurable: true,
        get: () => (chosen.length > 0 ? `C:\\fakepath\\${chosen[0].name}` : ''),
        set: (value) => {
            if (String(value) !== '') {
                throw Object.assign(new Error("Failed to set the 'value' property on 'HTMLInputElement': This input element accepts a filename, which may only be programmatically set to the empty string."), { name: 'InvalidStateError' });
            }
            chosen = new FileListLike([]);
        }
    });
    return (files) => { chosen = new FileListLike(files); };
}

// NodeList 與 HTMLCollection 的替身（見檔頭說明）：只有瀏覽器有的成員，沒有陣列的方法。索引（list[0]）是一般的屬性
class NodeListLike {
    #items;

    constructor(items) {
        this.#items = items;
        items.forEach((item, index) => { this[index] = item; });
    }

    get length() { return this.#items.length; }
    item(index) { return this.#items[index] ?? null; }
    forEach(callback, thisArg) { this.#items.forEach((item, index) => callback.call(thisArg, item, index, this)); }
    entries() { return this.#items.entries(); }
    keys() { return this.#items.keys(); }
    values() { return this.#items.values(); }
    [Symbol.iterator]() { return this.#items.values(); }
}

class HTMLCollectionLike {
    #items;

    constructor(items) {
        this.#items = items;
        items.forEach((item, index) => { this[index] = item; });
    }

    get length() { return this.#items.length; }
    item(index) { return this.#items[index] ?? null; }
    namedItem(name) { return this.#items.find((item) => item.getAttribute('id') === name || item.getAttribute('name') === name) ?? null; }
    [Symbol.iterator]() { return this.#items.values(); }
}

// 一個元素（或 document）的 querySelectorAll() 與 .children 換成上面的替身；fake-dom 的 querySelector()、firstElementChild 靠 [0]，照樣能用
function strictLists(parent) {
    const query = parent.querySelectorAll.bind(parent);
    parent.querySelectorAll = (selector) => new NodeListLike(query(selector));
    Object.defineProperty(parent, 'children', {
        configurable: true,
        get: () => new HTMLCollectionLike(parent.childNodes.filter((node) => node.nodeType === 1))
    });
    if (parent.nodeType === 1) {
        parent._sibling = (step) => {
            const siblings = parent.parentNode ? parent.parentNode.childNodes.filter((node) => node.nodeType === 1) : [];
            return siblings[siblings.indexOf(parent) + step] ?? null;
        };
    }
}

// 一張 canvas 的替身（見檔頭說明）。回傳這張 canvas 的記錄：{ context, draws, blobRequests }。env 是頁面共用的東西：
// { displayScale()：畫面上縮成幾倍, blobFails()：toBlob 現在轉不出 PNG 嗎, dataUrlRequests：每一次 toDataURL 的記錄 }
function patchCanvas(element, env) {
    // context 到 getContext() 才建：設定 width 或 height 只把現在的丟掉（下一次 getContext 拿到全新、重設過的 context），
    // 不然頁面每畫一次要設寬又設高，每次都白建兩個記錄 context（各約 35 個函式）
    const state = { context: null, draws: 0, blobRequests: [], created: null };
    for (const name of ['width', 'height']) {
        Object.defineProperty(element, name, {
            configurable: true,
            get: () => Number(element.getAttribute(name) ?? (name === 'width' ? 300 : 150)),
            set: (value) => {
                element.setAttribute(name, String(Math.trunc(Number(value))));
                state.context = null;
            }
        });
    }
    element.getContext = (type) => {
        assert.equal(type, '2d', 'canvas 替身只有 2d');
        state.draws += 1;
        state.created ??= [element.width, element.height];
        state.context ??= createRecordingContext();
        return state.context;
    };
    // toBlob 在呼叫的當下就把畫面拍下來（記下那一刻畫了幾次、畫了哪些字），之後非同步轉成 PNG；轉不出來（blobFails）時 callback 收到 null
    element.toBlob = (callback, type = 'image/png', quality) => {
        const texts = (state.context?.calls ?? []).filter((call) => call.op === 'fillText').map((call) => call.args[0]);
        state.blobRequests.push({ type, quality, width: element.width, height: element.height, draws: state.draws, texts });
        const failed = env.blobFails();
        Promise.resolve().then(() => callback(failed ? null : new Blob([`canvas ${element.width}x${element.height}`], { type })));
    };
    element.toDataURL = (type = 'image/png', quality) => {
        env.dataUrlRequests.push({ type, quality, width: element.width, height: element.height });
        return dataUrlOf(element.width, element.height, type);
    };
    // 畫面上的大小：canvas 的寬高乘上縮放（CSS 把卡片縮小顯示）；縮放是 0 就是藏起來（瀏覽器對藏起來的元素量出來都是 0）
    element.getBoundingClientRect = () => {
        const width = element.width * env.displayScale();
        const height = element.height * env.displayScale();
        return { x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height };
    };
    return state;
}

async function createCardPage({
    lang = 'zh', stored = {}, storageThrows = false, storageFull = [], narrow = false, coarse = false,
    userAgent = DESKTOP_USER_AGENT, share = false, clipboard = false, fontsDelay = false, icons = 'load',
    pictureLoads = 'load', pointerCapture = 'ok', displayScale = 0.5, blobFails = false, fileConstructor = true, hideKeepsFocus = false
} = {}) {
    assert.ok(typeof hideKeepsFocus === 'boolean', `hideKeepsFocus 是 true 或 false，不是 ${JSON.stringify(hideKeepsFocus)}`);
    assert.ok(SHARE_MODES.includes(share), `不認得的 share：${share}`);
    assert.ok(CLIPBOARD_MODES.includes(clipboard), `不認得的 clipboard：${clipboard}`);
    assert.ok(ICON_MODES.includes(icons), `不認得的 icons：${icons}`);
    assert.ok(PICTURE_MODES.includes(pictureLoads), `不認得的 pictureLoads：${pictureLoads}`);
    assert.ok(CAPTURE_MODES.includes(pointerCapture), `不認得的 pointerCapture：${pointerCapture}`);
    assert.ok(Array.isArray(storageFull), 'storageFull 是鍵的陣列');
    const dom = createFakeDom({ url: PAGE_URL });
    const win = dom.window;
    const storage = new Map(Object.entries(stored));
    const consoleErrors = [];
    const toasts = [];
    const timeouts = [];
    const languageListeners = [];
    const mediaListeners = [];
    const coarseListeners = [];
    const fontLoads = [];
    const heldFonts = [];
    const images = [];
    const pictures = [];
    const shares = [];
    const shareCalls = [];
    const clipboardWrites = [];
    const clipboardCalls = [];
    const downloads = [];
    const canvases = new WeakMap();
    const madeCanvases = [];
    const objectUrls = { created: [], revoked: [] };
    const blobFiles = new Map();
    const captures = [];
    const captured = new Set();
    const pressed = new Map();
    const storageWrites = [];
    // press() 正在派送 click：這時呼叫的 navigator.share 算在使用者手勢裡（share 是 'expired' 時才看）
    let gestures = 0;
    const dataUrlRequests = [];
    let scale = displayScale;
    let blobFailing = blobFails;
    const translations = { zh: {}, en: {}, ja: {} };
    let currentLang = lang;
    let isNarrow = narrow;
    let isCoarse = coarse;
    const lookup = (key) => [currentLang, 'zh'].map((l) => translations[l][key]).find((text) => text !== undefined);
    const fill = (text, params = {}) => text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
    // 同 I18nManager.updatePageLanguage()：有 data-i18n-attr 的換那個屬性，否則換掉整段文字
    const translatePage = () => {
        for (const element of dom.document.querySelectorAll('[data-i18n]')) {
            const text = lookup(element.dataset.i18n) ?? element.dataset.i18n;
            if (element.dataset.i18nAttr) element.setAttribute(element.dataset.i18nAttr, text);
            else element.textContent = text;
        }
    };

    // fake-dom 的元素少了瀏覽器有的東西，建出來時補上（見檔頭說明）
    function addBrowserParts(element) {
        const click = element.click.bind(element);
        const focus = element.focus.bind(element);
        element.click = () => {
            if (element.disabled === true) return;
            // type 屬性是建出元素之後才設的，所以點的當下才看
            const kind = element.tagName === 'INPUT' ? element.type : null;
            if (kind !== 'checkbox' && kind !== 'radio') {
                click();
                return;
            }
            const before = element.checked === true;
            if (kind === 'radio' && before) {
                click();
                return;
            }
            element.checked = kind === 'radio' ? true : !before;
            if (!element.dispatchEvent(new win.Event('click', { bubbles: true, cancelable: true }))) {
                element.checked = before;
                return;
            }
            if (kind === 'radio') {
                for (const other of element.ownerDocument.querySelectorAll('input[type="radio"]')) {
                    if (other !== element && other.getAttribute('name') === element.getAttribute('name')) other.checked = false;
                }
            }
            element.dispatchEvent(new win.Event('input', { bubbles: true }));
            element.dispatchEvent(new win.Event('change', { bubbles: true }));
        };
        element.focus = () => {
            if (element.disabled === true || !isShown(element)) return;
            const document = element.ownerDocument;
            const previous = document.activeElement;
            focus();
            // 焦點真的換過來之後，瀏覽器還會在這個元素上派送 focusin（fake-dom 只派送 focusout）：relatedTarget 是剛失去焦點的元素，原本是 body 就是 null
            if (previous !== element && document.activeElement === element) {
                element.dispatchEvent(new win.Event('focusin', { bubbles: true, relatedTarget: previous === document.body ? null : previous }));
            }
        };
        // 焦點所在的元素（或它的祖先）被藏起來時，瀏覽器把焦點丟掉，document.activeElement 變成 body。fake-dom 只看元素還在不在文件裡，
        // 藏起來焦點照樣留著：那樣「藏起來、再顯示、把焦點放回去」的程式，拿掉放回去的那一行測試也不會失敗。所以 hidden 設成 true 時照瀏覽器做。
        // hideKeepsFocus 是 Safari 的樣子：藏起來之後焦點不動、不送 focusout（見檔頭說明）
        const { get, set } = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'hidden');
        Object.defineProperty(element, 'hidden', {
            configurable: true,
            get: () => get.call(element),
            set: (value) => {
                set.call(element, value);
                const active = element.ownerDocument.activeElement;
                if (value && !hideKeepsFocus && element.contains(active)) active.blur();
            }
        });
        strictLists(element);
        if (element.tagName === 'CANVAS') {
            const state = patchCanvas(element, { displayScale: () => scale, blobFails: () => blobFailing, dataUrlRequests });
            canvases.set(element, state);
            madeCanvases.push({ element, state });
        }
        // <a download href="blob:…"> 被點：瀏覽器去讀那個網址存成檔案。照 Firefox 的規則，連結沒有接在文件上時點了沒有用（不記）
        if (element.tagName === 'A') {
            const clickLink = element.click;
            element.click = () => {
                if (element.hasAttribute('download') && element.hasAttribute('href') && element.ownerDocument.body.contains(element)) {
                    const href = element.getAttribute('href');
                    downloads.push({ file: element.getAttribute('download'), href, blob: blobFiles.get(href) ?? null });
                }
                clickLink();
            };
        }
        return element;
    }
    // 這份 document 建出來的每個元素都補上 addBrowserParts()；一定要在 mountFromHtml 之前換
    const createElement = dom.document.createElement.bind(dom.document);
    dom.document.createElement = (tag) => addBrowserParts(createElement(tag));
    // document 自己與它建構時就有的 html、head、body（不是 createElement 建的）也要換 querySelectorAll() 與 .children
    for (const parent of [dom.document, dom.document.documentElement, dom.document.head, dom.document.body]) strictLists(parent);

    // 字型：load() 記下來，fontsDelay 時等 releaseFonts() 才回來。同一次畫（頁面那張 canvas 的 getContext 被呼叫的次數一樣）請求的 load() 是一批；
    // heldFonts 是還在等的每一批：{ draw, loads: [{ font, text }], releases: [放行的函式] }
    dom.document.fonts = {
        load: (font, text) => {
            fontLoads.push({ font, text });
            if (!fontsDelay) return Promise.resolve([]);
            const draw = canvases.get(dom.document.getElementById('cardCanvas'))?.draws;
            if (heldFonts.length === 0 || heldFonts.at(-1).draw !== draw) heldFonts.push({ draw, loads: [], releases: [] });
            const batch = heldFonts.at(-1);
            batch.loads.push({ font, text });
            return new Promise((resolve, reject) => batch.releases.push((fail) => (fail
                ? reject(Object.assign(new Error('NetworkError: 字型載入失敗'), { name: 'NetworkError' }))
                : resolve([]))));
        },
        ready: Promise.resolve()
    };

    // Image 的替身（見檔頭說明）：職業圖示與角色圖（blob:、data:）分開記，各有各的控制
    class FakeImage {
        constructor() {
            this.complete = false;
            this.naturalWidth = 0;
            this.naturalHeight = 0;
            this.onload = null;
            this.onerror = null;
            this.srcValue = '';
            this.kind = null;
        }

        get src() { return this.srcValue; }

        // 角色圖：上傳的檔案（blob: 網址對到的那個）
        get file() { return blobFiles.get(this.srcValue) ?? null; }

        set src(value) {
            this.srcValue = String(value);
            const picture = /^(?:blob|data):/.test(this.srcValue);
            this.kind = picture ? 'picture' : 'icon';
            (picture ? pictures : images).push(this);
            if (!picture) {
                if (icons !== 'hold') Promise.resolve().then(() => this.finish(icons === 'load'));
                return;
            }
            const held = this.srcValue.startsWith('blob:') ? Boolean(this.file?.hold) : pictureLoads === 'hold';
            if (!held) Promise.resolve().then(() => this.finish(true));
        }

        // 讀得出來的大小；讀不出來是 null
        decode() {
            if (this.kind === 'icon') return { width: 64, height: 64 };
            if (this.srcValue.startsWith('blob:')) {
                const { file } = this;
                if (!file || file.broken || objectUrls.revoked.includes(this.srcValue)) return null;
                return { width: file.width, height: file.height };
            }
            const match = /^data:image\/[\w.+-]+;base64,([A-Za-z0-9+/=]*)$/.exec(this.srcValue);
            const size = /^canvas (\d+)x(\d+)$/.exec(match ? Buffer.from(match[1], 'base64').toString('utf8') : '');
            return size ? { width: Number(size[1]), height: Number(size[2]) } : null;
        }

        finish(ok = true) {
            if (this.complete) return;
            this.complete = true;
            const size = ok ? this.decode() : null;
            this.naturalWidth = size ? size.width : 0;
            this.naturalHeight = size ? size.height : 0;
            const handler = size ? this.onload : this.onerror;
            if (typeof handler === 'function') handler.call(this, new win.Event(size ? 'load' : 'error'));
        }
    }

    const navigatorStub = { userAgent };
    if (share !== false) {
        navigatorStub.canShare = (data) => share !== 'no-files' && Boolean(data && data.files && data.files.length > 0);
        // 呼叫的當下就記在 shareCalls（async 函式在第一個 await 之前是同步執行的），瀏覽器要求在使用者手勢裡呼叫
        navigatorStub.share = async (data) => {
            shareCalls.push(data);
            if (share === 'cancel') throw Object.assign(new Error('Share canceled'), { name: 'AbortError' });
            if (share === 'fail') throw Object.assign(new Error('Share failed'), { name: 'DataError' });
            if (share === 'blocked' || (share === 'expired' && gestures === 0)) {
                throw Object.assign(new Error('Must be handling a user gesture to perform a share request.'), { name: 'NotAllowedError' });
            }
            shares.push(data);
        };
    }
    if (clipboard !== false) {
        navigatorStub.clipboard = {
            // 呼叫的當下記在 clipboardCalls（ClipboardItem 的內容可能還是沒好的 Promise）；寫完（等每個 ClipboardItem 的內容都好了）才記在 clipboardWrites
            write: async (items) => {
                clipboardCalls.push(items);
                if (clipboard === 'reject') throw Object.assign(new Error('Clipboard denied'), { name: 'NotAllowedError' });
                const written = [];
                for (const item of items) {
                    const entry = {};
                    for (const [type, value] of Object.entries(item.data)) entry[type] = await value;
                    written.push(entry);
                }
                clipboardWrites.push(written);
            }
        };
        win.ClipboardItem = class ClipboardItem {
            constructor(data) {
                this.data = data;
                this.types = Object.keys(data);
            }
        };
    }
    if (fileConstructor) win.File = File;

    // ModalManager 替身（見檔頭說明）。openModal 是目前開著的那一個（沒有開就是 null）
    let openModal = null;
    class FakeModalManager {
        constructor() {
            this.activeModal = null;
            this.previousFocus = null;
            this.options = {};
            this.handleOverlayClick = (event) => {
                if (event.target === this.activeModal && this.options.closeOnOverlayClick) this.hide();
            };
        }

        show(element, options = {}) {
            if (this.activeModal === element) return;
            if (this.activeModal) this.hide();
            this.options = { onClose: null, closeOnOverlayClick: true, closeOnEsc: true, useClass: 'active', ...options };
            this.activeModal = element;
            this.previousFocus = dom.document.activeElement;
            element.classList.add(this.options.useClass);
            openModal = this;
            element.addEventListener('click', this.handleOverlayClick);
            (element.querySelector('[autofocus]') ?? focusableElements(element)[0] ?? element).focus();
        }

        // 同真的 ModalManager：拿掉 .active、還原焦點（開啟前的元素還在文件裡才還原），最後才呼叫 onClose
        hide() {
            if (!this.activeModal) return;
            const { activeModal: element, options, previousFocus } = this;
            element.classList.remove(options.useClass);
            openModal = null;
            element.removeEventListener('click', this.handleOverlayClick);
            Object.assign(this, { activeModal: null, previousFocus: null });
            if (previousFocus && dom.document.body.contains(previousFocus)) previousFocus.focus();
            options.onClose?.();
        }
    }
    // 同 ModalManager 共用的 document keydown 監聽器：Escape 關掉開著的視窗
    dom.document.addEventListener('keydown', (event) => {
        if (openModal && event.key === 'Escape' && openModal.options.closeOnEsc) {
            event.preventDefault();
            openModal.hide();
        }
    });

    // 頁面的 console 不印到真的 console：log、error、warn 都照 Node 的 console 用 util.format() 寫成一筆字串記下來
    const record = (...args) => { consoleErrors.push(util.format(...args)); };
    Object.assign(win, {
        console: { log: record, error: record, warn: record },
        setTimeout: (callback, delay) => { timeouts.push({ callback, delay, cleared: false, done: false }); return timeouts.length; },
        clearTimeout: (id) => { if (timeouts[id - 1]) timeouts[id - 1].cleared = true; },
        matchMedia: (query) => {
            if (![NARROW_QUERY, COARSE_QUERY].includes(query)) throw new Error(`createCardPage 沒有準備 matchMedia(${JSON.stringify(query)})`);
            const listeners = query === NARROW_QUERY ? mediaListeners : coarseListeners;
            return {
                media: query,
                get matches() { return query === NARROW_QUERY ? isNarrow : isCoarse; },
                addEventListener: (type, listener) => { if (type === 'change') listeners.push(listener); },
                removeEventListener: (type, listener) => {
                    const index = listeners.indexOf(listener);
                    if (index !== -1) listeners.splice(index, 1);
                }
            };
        },
        // 角色圖上傳用的 blob: 網址（見檔頭說明）：不是物件的東西瀏覽器會丟 TypeError
        URL: class PageURL extends URL {
            static createObjectURL(file) {
                if (file === null || typeof file !== 'object' || !('size' in file)) throw new TypeError("Failed to execute 'createObjectURL' on 'URL': Overload resolution failed.");
                const url = `blob:https://ff14.tw/${objectUrls.created.length + 1}`;
                blobFiles.set(url, file);
                objectUrls.created.push(url);
                return url;
            }

            static revokeObjectURL(url) {
                objectUrls.revoked.push(String(url));
            }
        },
        navigator: navigatorStub,
        ModalManager: FakeModalManager,
        Image: FakeImage,
        i18n: {
            get currentLanguage() { return currentLang; },
            getCurrentLanguage: () => currentLang,
            hasKey: (key) => lookup(key) !== undefined,
            getText: (key, params) => fill(lookup(key) ?? key, params),
            onLanguageChange: (callback) => {
                languageListeners.push(callback);
                return () => {
                    const index = languageListeners.indexOf(callback);
                    if (index !== -1) languageListeners.splice(index, 1);
                };
            },
            loadTranslations: (moduleName, data) => {
                for (const l of Object.keys(translations)) Object.assign(translations[l], data[l]);
            }
        },
        // 同 assets/js/common.js：翻譯檔有這個鍵就用目前語言的字，沒有就用程式裡的中文預設文字
        FF14Utils: {
            getI18nText: (key, fallback, params) => (win.i18n.hasKey(key) ? win.i18n.getText(key, params) : fill(fallback, params)),
            showToast: (message, type) => { toasts.push({ message, type }); }
        }
    });
    if (storageThrows) {
        vm.runInContext("Object.defineProperty(globalThis, 'localStorage', { get() { throw new Error('SecurityError'); }, configurable: true })", win);
        assert.throws(() => vm.runInContext('typeof localStorage', win), /SecurityError/);
        assert.throws(() => vm.runInContext('window.localStorage', win), /SecurityError/);
    } else {
        win.localStorage = {
            getItem: (key) => (storage.has(key) ? storage.get(key) : null),
            setItem: (key, value) => {
                storageWrites.push(key);
                if (storageFull.includes(key)) {
                    throw Object.assign(new Error(`Failed to execute 'setItem' on 'Storage': Setting the value of '${key}' exceeded the quota.`), { name: 'QuotaExceededError' });
                }
                storage.set(key, String(value));
            },
            removeItem: (key) => storage.delete(key),
            key: (index) => Array.from(storage.keys())[index] ?? null,
            get length() { return storage.size; }
        };
    }

    // 預覽與表單在 #cardTool 裡；全螢幕大圖 #imageViewer 在它外面（和頁面一樣，是 <main> 後面的另一個元素）
    mountFromHtml(dom, PAGE_HTML, ['cardTool', 'imageViewer']);
    // 檔案輸入與卡片 canvas 的指標抓取（見檔頭說明）；標記裡還沒有的元素（角色圖的功能還沒做好時）略過
    const fileInput = dom.document.getElementById('cardImageInput');
    const chooseFiles = fileInput ? patchFileInput(fileInput) : null;
    const cardCanvas = dom.document.getElementById('cardCanvas');
    cardCanvas.setPointerCapture = (pointerId) => {
        if (pointerCapture === 'throws') {
            throw Object.assign(new Error("Failed to execute 'setPointerCapture' on 'Element': No active pointer with the given id is found."), { name: 'NotFoundError' });
        }
        captured.add(pointerId);
        captures.push({ call: 'set', pointerId });
    };
    // 抓著的 pointer 被放掉（pointerup、pointercancel 之後、releasePointerCapture、lose）：canvas 收到 lostpointercapture；沒抓著就沒有（瀏覽器的規則）。回傳有沒有放掉
    const loseCapture = (pointerId) => {
        if (!captured.delete(pointerId)) return false;
        captures.push({ call: 'lost', pointerId });
        cardCanvas.dispatchEvent(new win.Event('lostpointercapture', { bubbles: true, pointerId }));
        return true;
    };
    cardCanvas.releasePointerCapture = (pointerId) => {
        captures.push({ call: 'release', pointerId });
        loseCapture(pointerId);
    };
    for (const file of PAGE_SCRIPTS) dom.load(file);
    translatePage();
    const app = vm.runInContext('new CharacterCardApp()', win);
    if (!fontsDelay && pictureLoads !== 'hold') await app.ready;

    const $ = (id) => dom.document.getElementById(id);
    const elementOf = (target) => {
        const element = typeof target === 'string' ? $(target) : target;
        assert.ok(element, `找不到 ${target}`);
        return element;
    };
    const stateOf = () => canvases.get($('cardCanvas'));
    const drawCalls = () => stateOf().context?.calls ?? [];
    const fire = (element, type) => element.dispatchEvent(new win.Event(type, { bubbles: true }));

    const api = {
        window: win,
        document: dom.document,
        app,
        stored: storage,
        toasts,
        consoleErrors,
        fontLoads,
        images,
        pictures,
        objectUrls,
        captures,
        storageWrites,
        dataUrlRequests,
        shares,
        shareCalls,
        clipboardWrites,
        clipboardCalls,
        downloads,
        $,
        isShown: (target) => isShown(elementOf(target)),
        type(target, text) {
            const element = elementOf(target);
            const max = Number(element.getAttribute('maxlength'));
            element.value = element.hasAttribute('maxlength') && Number.isFinite(max) ? String(text).slice(0, max) : String(text);
            fire(element, 'input');
        },
        select(target, value) {
            const element = elementOf(target);
            const values = Array.from(element.querySelectorAll('option'), (option) => option.getAttribute('value'));
            assert.ok(values.includes(value), `#${element.getAttribute('id')} 裡沒有 value 是 ${JSON.stringify(value)} 的選項`);
            element.value = value;
            fire(element, 'input');
            fire(element, 'change');
        },
        press(target) {
            const element = elementOf(target);
            gestures += 1;
            try {
                element.click();
            } finally {
                gestures -= 1;
            }
        },
        focus(target) {
            elementOf(target).focus();
        },
        toggle(target) {
            const element = elementOf(target);
            assert.ok(element.tagName === 'INPUT' && ['checkbox', 'radio'].includes(element.type), `${target} 不是勾選框或單選`);
            element.click();
        },
        chip(groupId, value) {
            const button = Array.from($(groupId).querySelectorAll('button')).find((item) => [item.dataset.job, item.dataset.like, item.dataset.looking].includes(value));
            assert.ok(button, `#${groupId} 裡找不到 ${value} 這顆按鈕`);
            return button;
        },
        file: ({ name = 'screenshot.png', type = 'image/png', width = 1600, height = 900, broken = false, hold = false } = {}) => ({
            name, type, size: width * height, width, height, broken, hold
        }),
        pick(...files) {
            const input = elementOf('cardImageInput');
            chooseFiles(files);
            fire(input, 'input');
            fire(input, 'change');
        },
        slide(value, { release = true } = {}) {
            const element = elementOf('imageZoom');
            assert.ok(element.disabled !== true, '#imageZoom 是 disabled：使用者動不了');
            element.value = String(value);
            fire(element, 'input');
            if (release) fire(element, 'change');
        },
        pointer(type, { x = 0, y = 0, id = 1, pointerType = 'mouse', button = 0, buttons } = {}) {
            assert.ok(POINTER_EVENTS.includes(type), `pointer 的類型是 ${POINTER_EVENTS.join('、')} 其中一個，不是 ${type}`);
            // 按下去那一刻起到放開之前是按著的按鍵，其他時候是 0（見檔頭說明）
            if (type === 'down') pressed.set(id, BUTTON_BITS[button] ?? 0);
            const held = buttons ?? (type === 'down' || type === 'move' ? pressed.get(id) ?? 0 : 0);
            const event = new win.Event(`pointer${type}`, { bubbles: true, cancelable: true, pointerId: id, pointerType, button, buttons: held, clientX: x, clientY: y, isPrimary: true });
            $('cardCanvas').dispatchEvent(event);
            // pointerup、pointercancel 之後瀏覽器自己放掉抓取，並派送 lostpointercapture
            if (type === 'up' || type === 'cancel') {
                pressed.delete(id);
                loseCapture(id);
            }
            return event;
        },
        // 抓取被拿走而沒有 pointerup、pointercancel（例如元素被移出頁面、有人呼叫 releasePointerCapture）：只有 lostpointercapture
        lose(id = 1) {
            assert.ok(loseCapture(id), `canvas 沒有抓著 pointer ${id}，瀏覽器不會送 lostpointercapture`);
        },
        drag(points, { id = 1, pointerType = 'mouse', button = 0 } = {}) {
            assert.ok(points.length >= 2, 'drag 至少要按下與放開兩個點');
            const [first, ...rest] = points;
            api.pointer('down', { x: first[0], y: first[1], id, pointerType, button });
            for (const [x, y] of rest) api.pointer('move', { x, y, id, pointerType });
            const last = points.at(-1);
            api.pointer('up', { x: last[0], y: last[1], id, pointerType });
        },
        key(key, target = dom.document.activeElement, init = {}) {
            const event = new win.Event('keydown', { bubbles: true, cancelable: true, key, ...init });
            elementOf(target).dispatchEvent(event);
            return event;
        },
        drawCalls,
        texts: () => drawCalls().filter((call) => call.op === 'fillText').map((call) => call.args[0]),
        drawCount: () => stateOf().draws,
        blobRequests: () => stateOf().blobRequests,
        // 頁面自己建的每一張 canvas（見檔頭）；#cardCanvas 不算。每一筆的 width、height、created、calls 是現在的值（放掉之後 width、height 是 0）
        createdCanvases: () => madeCanvases.filter(({ element }) => element !== cardCanvas).map(({ element, state }) => ({
            element,
            get width() { return element.width; },
            get height() { return element.height; },
            get created() { return state.created; },
            get calls() { return state.context?.calls ?? []; }
        })),
        runTimeouts() {
            for (const timeout of [...timeouts]) {
                if (timeout.cleared || timeout.done) continue;
                timeout.done = true;
                timeout.callback();
            }
        },
        pendingDelays: () => timeouts.filter((timeout) => !timeout.cleared && !timeout.done).map((timeout) => timeout.delay),
        flush: () => new Promise((resolve) => setImmediate(resolve)),
        // fontsDelay 時等著的 load() 回來；之後要 await flush() 讓頁面的 await 跑完。沒給 index 時還在等的每一批都放行；
        // 給了只放行還在等的第 index 批（0 起算，照請求的順序，放行過的不再算），用來模擬後請求的字型先載完、慢的那一批還在等。
        // fail 是 true 時那一批的 load() 被拒絕（載入失敗）
        releaseFonts(index, { fail = false } = {}) {
            if (index !== undefined) assert.ok(heldFonts[index], `releaseFonts：沒有還在等的第 ${index} 批字型（現在有 ${heldFonts.length} 批）`);
            const batches = index === undefined ? heldFonts.splice(0) : heldFonts.splice(index, 1);
            for (const batch of batches) for (const release of batch.releases) release(fail);
        },
        // 還在等的每一批字型（照請求的順序）：每一批是那一次畫請求的 [{ font, text }]
        heldFontBatches: () => heldFonts.map((batch) => batch.loads.map((load) => ({ ...load }))),
        // icons 是 'hold' 時還沒結束的每一張圖照 ok 結束
        finishImages(ok) {
            for (const image of images) image.finish(ok);
        },
        // 角色圖：還沒結束的每一張結束（ok 是 false 就讀不出來）；finishFile 只讓那個檔案的那一張結束
        finishPictures(ok = true) {
            for (const picture of pictures) picture.finish(ok);
        },
        finishFile(file, ok = true) {
            const picture = pictures.find((item) => item.file === file);
            assert.ok(picture, `頁面還沒讀 ${file.name}（沒有用它的 blob: 網址建 Image）`);
            picture.finish(ok);
        },
        setLang(next) {
            currentLang = next;
            translatePage();
            for (const listener of [...languageListeners]) listener(next);
        },
        setNarrow(next) {
            isNarrow = next;
            for (const listener of [...mediaListeners]) listener({ matches: next, media: NARROW_QUERY });
        },
        setCoarse(next) {
            isCoarse = next;
            for (const listener of [...coarseListeners]) listener({ matches: next, media: COARSE_QUERY });
        },
        // 卡片在畫面上縮成幾倍；0 是藏起來（getBoundingClientRect() 都是 0）
        setDisplayScale(next) {
            scale = next;
        },
        // toBlob 轉不出 PNG（callback 收到 null）：之後的每一次 toBlob 都是
        setBlobFails(next) {
            blobFailing = next;
        },
        reopen: (overrides = {}) => createCardPage({
            lang: currentLang, stored: Object.fromEntries(storage), storageThrows, storageFull, narrow: isNarrow, coarse: isCoarse, userAgent, share, clipboard,
            fontsDelay, icons, pictureLoads, pointerCapture, displayScale: scale, blobFails: blobFailing, fileConstructor, hideKeepsFocus, ...overrides
        })
    };
    return api;
}

module.exports = { createCardPage, dataUrlOf };
