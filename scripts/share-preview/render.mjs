/**
 * 用本機的 Chrome 把 HTML 畫成 PNG：開一個 headless Chrome，用 DevTools 協定（Node 22 以上內建的全域 WebSocket）逐一載入頁面、
 * 等字型載完、問頁面「有沒有字放不下、字型有沒有載入」，沒有問題才截圖。沒有任何套件。
 *
 * 結束時一定關掉 Chrome 並刪掉暫存資料夾（正常結束、出錯、被 Ctrl+C 中斷都一樣）。
 * 這個模組不認得預覽圖長什麼樣：頁面要自己定義 window.__problems()，回傳字串陣列（空的就是沒問題）。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { pathToFileURL } from 'node:url';

export const DEFAULT_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const START_TIMEOUT_MS = 30_000; // Chrome 啟動到印出 DevTools 網址
const CONNECT_TIMEOUT_MS = 10_000; // 連上 DevTools 的 WebSocket
const COMMAND_TIMEOUT_MS = 60_000; // 一個 DevTools 指令（載入頁面、等字型都在內）
const EXIT_TIMEOUT_MS = 5_000;

// ---------- DevTools 協定 ----------

// 連上 Chrome 的 DevTools（WebSocket），回傳 { send, waitFor, close }。
// send 送出一個指令、等它的回覆；waitFor 等某個 session 的下一個事件。兩個都有逾時，連線斷了也會一起失敗
function connect(url) {
    return new Promise((resolve, reject) => {
        const socket = new WebSocket(url);
        const calls = new Map(); // 還沒回覆的指令：id → { method, ok, fail }
        const listeners = new Set(); // 在等事件的人：{ method, sessionId, ok, fail }
        let lastId = 0;

        const withTimeout = (label, timeoutMs, start) => new Promise((ok, fail) => {
            const timer = setTimeout(() => fail(new Error(`${label}逾時（${timeoutMs / 1000} 秒）`)), timeoutMs);
            start((value) => { clearTimeout(timer); ok(value); }, (error) => { clearTimeout(timer); fail(error); });
        });
        const send = (method, params = {}, sessionId, timeoutMs = COMMAND_TIMEOUT_MS) => withTimeout(method, timeoutMs, (ok, fail) => {
            const id = ++lastId;
            calls.set(id, { method, ok, fail });
            socket.send(JSON.stringify({ id, method, params, sessionId }));
        });
        const waitFor = (method, sessionId, timeoutMs = COMMAND_TIMEOUT_MS) => withTimeout(`等 ${method}`, timeoutMs, (ok, fail) => {
            listeners.add({ method, sessionId, ok, fail });
        });

        socket.addEventListener('message', (event) => {
            const message = JSON.parse(event.data);
            if (message.id !== undefined) {
                const call = calls.get(message.id);
                if (!call) return;
                calls.delete(message.id);
                if (message.error) call.fail(new Error(`${call.method}：${message.error.message}`));
                else call.ok(message.result);
                return;
            }
            for (const listener of [...listeners]) {
                if (listener.method !== message.method || listener.sessionId !== message.sessionId) continue;
                listeners.delete(listener);
                listener.ok(message.params);
            }
        });
        const connectTimer = setTimeout(() => {
            reject(new Error(`連不上 Chrome 的 DevTools（${url}）：${CONNECT_TIMEOUT_MS / 1000} 秒內沒有連上`));
            socket.close();
        }, CONNECT_TIMEOUT_MS);
        socket.addEventListener('open', () => {
            clearTimeout(connectTimer);
            resolve({ send, waitFor, close: () => socket.close() });
        });
        socket.addEventListener('error', () => {
            clearTimeout(connectTimer);
            reject(new Error(`連不上 Chrome 的 DevTools（${url}）`));
        });
        socket.addEventListener('close', () => {
            clearTimeout(connectTimer);
            reject(new Error(`連不上 Chrome 的 DevTools（${url}）`)); // 還沒連上就斷了；連上之後這一行沒有作用
            const interrupted = new Error('Chrome 的 DevTools 連線中斷了');
            for (const call of calls.values()) call.fail(interrupted);
            for (const listener of listeners) listener.fail(interrupted);
            calls.clear();
            listeners.clear();
        });
    });
}

// ---------- Chrome 程序 ----------

const tail = (output) => (output.trim() ? `：\n${output.trim().split('\n').slice(-8).join('\n')}` : '');

// 開 headless Chrome（用 workDir 底下的暫存 profile，不碰玩家平常用的 Chrome）。
// 回傳 { child, endpoint }：endpoint 是 DevTools 的 WebSocket 網址（Chrome 準備好時印在 stderr 上）
function launch(chromePath, workDir) {
    const child = spawn(chromePath, [
        '--headless=new',
        '--remote-debugging-port=0',
        `--user-data-dir=${path.join(workDir, 'profile')}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--hide-scrollbars',
        '--disable-lcd-text',
        '--force-device-scale-factor=1',
        '--force-color-profile=srgb',
        '--font-render-hinting=none',
        'about:blank'
    ], { stdio: ['ignore', 'ignore', 'pipe'] });

    let output = ''; // stderr 的最後一段：Chrome 掛掉時放進錯誤訊息；一直讀著，管線才不會塞滿
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => { output = (output + chunk).slice(-4000); });

    const endpoint = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Chrome 在 ${START_TIMEOUT_MS / 1000} 秒內沒有準備好${tail(output)}`)), START_TIMEOUT_MS);
        child.stderr.on('data', () => {
            const match = /DevTools listening on (ws:\/\/\S+)/.exec(output);
            if (match) { clearTimeout(timer); resolve(match[1]); }
        });
        // 程序結束時 stderr 的最後一段可能還沒讀完（'exit' 比 stderr 的 'data' 早到）：等 'close'（輸出都讀完了）再放進訊息，
        // 'close' 遲遲不來（Chrome 的子程序還握著輸出）時最多等 1 秒
        let ended = null;
        let graceTimer = null;
        const fail = () => {
            clearTimeout(timer);
            clearTimeout(graceTimer);
            reject(new Error(`Chrome 一啟動就結束了（${ended}）${tail(output)}`));
        };
        child.once('exit', (code, signal) => {
            ended = signal ? `訊號 ${signal}` : `結束碼 ${code}`;
            graceTimer = setTimeout(fail, 1000);
        });
        child.once('close', () => { if (ended) fail(); });
        child.once('error', (error) => {
            clearTimeout(timer);
            reject(new Error(`沒辦法啟動 Chrome（${chromePath}）：${error.message}`));
        });
    });
    return { child, endpoint };
}

const hasExited = (child) => child.exitCode !== null || child.signalCode !== null;

function waitForExit(child, timeoutMs) {
    if (hasExited(child)) return Promise.resolve(true);
    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(false), timeoutMs);
        child.once('exit', () => { clearTimeout(timer); resolve(true); });
    });
}

// 先請 Chrome 自己關，不行就 SIGTERM，再不行就 SIGKILL；回來時 Chrome 已經結束
async function shutdown(child, cdp) {
    if (cdp) {
        try {
            await cdp.send('Browser.close', {}, undefined, 3000);
        } catch {
            // 連線可能已經斷了：下面照樣會關掉程序
        }
        cdp.close();
    }
    if (!child || hasExited(child)) return;
    child.kill('SIGTERM');
    if (await waitForExit(child, EXIT_TIMEOUT_MS)) return;
    child.kill('SIGKILL');
    await waitForExit(child, EXIT_TIMEOUT_MS);
}

function isExecutableFile(file) {
    try {
        fs.accessSync(file, fs.constants.X_OK);
        return fs.statSync(file).isFile();
    } catch {
        return false;
    }
}

// ---------- 畫一張 ----------

// 在頁面裡執行一段程式，回傳它的值（awaitPromise 時等它的 Promise）；頁面裡丟了例外就丟錯
async function evaluate(send, expression, awaitPromise = false) {
    const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
    if (exceptionDetails) throw new Error(`頁面裡的程式丟出例外：${exceptionDetails.exception?.description ?? exceptionDetails.text}`);
    return result.value;
}

// 載入、等字型、問頁面有沒有問題；沒有問題才截圖。回傳 { problems, png }（有問題時 png 是 null）
async function renderJob(cdp, job, url) {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    try {
        const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
        const send = (method, params) => cdp.send(method, params, sessionId);
        await send('Page.enable');
        await send('Emulation.setDeviceMetricsOverride', { width: job.width, height: job.height, deviceScaleFactor: 1, mobile: false });
        const loaded = cdp.waitFor('Page.loadEventFired', sessionId);
        loaded.catch(() => {}); // 下面等它之前逾時了也不算沒人處理的錯誤
        const navigation = await send('Page.navigate', { url });
        if (navigation.errorText) throw new Error(`載入頁面失敗（${navigation.errorText}）`);
        await loaded;
        await evaluate(send, 'document.fonts.ready.then(() => true)', true);

        const problems = await evaluate(send, 'typeof window.__problems === "function" ? window.__problems() : ["頁面沒有定義 window.__problems()"]');
        if (!Array.isArray(problems)) throw new Error('window.__problems() 要回傳字串陣列');
        if (problems.length > 0) return { problems, png: null };

        const { data } = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: job.width, height: job.height, scale: 1 } });
        return { problems, png: Buffer.from(data, 'base64') };
    } finally {
        await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
    }
}

/**
 * 用 headless Chrome 把每個工作畫成 PNG。
 * 先逐一載入、等 document.fonts.ready、呼叫頁面的 window.__problems()；全部載完之後只要有任何一張有問題，
 * 就丟一個 Error，每一行是「名稱: 問題」，不產生任何圖。沒有問題才拿 0,0,width,height、scale 1 的截圖。
 * @param {{ name: string, html: string, width: number, height: number }[]} jobs name 不能重複
 * @param {{ chromePath?: string }} [options] Chrome 的路徑：預設是環境變數 CHROME_PATH，沒有就是 macOS 的 Google Chrome
 * @returns {Promise<Map<string, Buffer>>} name → PNG（Chrome 截的，還沒重新壓縮）
 */
export async function renderPngs(jobs, { chromePath = process.env.CHROME_PATH || DEFAULT_CHROME } = {}) {
    const names = new Set();
    for (const job of jobs) {
        if (typeof job.name !== 'string' || job.name === '' || names.has(job.name)) throw new Error(`renderPngs：每個工作要有不重複的 name（${JSON.stringify(job.name)}）`);
        names.add(job.name);
        if (typeof job.html !== 'string') throw new Error(`renderPngs：${job.name} 的 html 要是字串`);
        for (const side of ['width', 'height']) {
            if (!Number.isInteger(job[side]) || job[side] < 1) throw new Error(`renderPngs：${job.name} 的 ${side} 要是正整數`);
        }
    }
    const pngs = new Map();
    if (jobs.length === 0) return pngs;
    if (!isExecutableFile(chromePath)) {
        throw new Error(`找不到 Chrome（${chromePath}）。安裝 Google Chrome，或用環境變數 CHROME_PATH 指定 Chrome 執行檔的路徑`);
    }

    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'share-preview-chrome-'));
    let chrome = null;
    let cdp = null;
    // 被 Ctrl+C 或 kill 中斷時，'exit' 事件裡的這一步會關掉 Chrome、刪掉暫存資料夾
    const stopNow = () => {
        chrome?.kill('SIGKILL');
        fs.rmSync(workDir, { recursive: true, force: true });
    };
    const onInterrupt = () => process.exit(130);
    process.once('exit', stopNow);
    process.once('SIGINT', onInterrupt);
    process.once('SIGTERM', onInterrupt);
    try {
        const started = launch(chromePath, workDir);
        chrome = started.child;
        cdp = await connect(await started.endpoint);

        const problems = [];
        for (const [index, job] of jobs.entries()) {
            const file = path.join(workDir, `job-${index}.html`);
            fs.writeFileSync(file, job.html);
            let result;
            try {
                result = await renderJob(cdp, job, pathToFileURL(file).href);
            } catch (error) {
                throw new Error(`${job.name}: ${error.message}`);
            }
            for (const problem of result.problems) problems.push(`${job.name}: ${problem}`);
            if (result.png) pngs.set(job.name, result.png);
        }
        if (problems.length > 0) {
            throw new Error(`有圖放不下或字型沒載入，沒有產生任何圖：\n${problems.map((problem) => `  ${problem}`).join('\n')}`);
        }
        return pngs;
    } finally {
        process.off('exit', stopNow);
        process.off('SIGINT', onInterrupt);
        process.off('SIGTERM', onInterrupt);
        try {
            await shutdown(chrome, cdp);
        } finally {
            fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        }
    }
}
