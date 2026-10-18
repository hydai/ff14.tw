// Notification 與 AudioContext 的替身，給 tests/helpers/weather-page.js、tests/helpers/gathering-page.js 兩個頁面替身共用。
// 這是輔助模組，不是測試檔（只有 tests/*.test.js 會被 node --test 執行）。
//
//   const { NOTIFICATION_MODES, fakeNotification, fakeAudioContext } = require('./notification-stubs.js');
//   const notificationLog = { created: [], requests: 0 };
//   const audioLog = { beeps: 0 };
//   if (mode !== 'unsupported') win.Notification = fakeNotification(mode, notificationLog);   // 'unsupported'：頁面上沒有 Notification
//   win.AudioContext = fakeAudioContext(audioLog);
//
// - NOTIFICATION_MODES：'default'（requestPermission() 回傳並改成 'granted'）、'granted'、'denied'、'unsupported'（沒有 Notification）、
//   'throws'（'granted'，但建構時丟錯，同 Android 的 Chrome）
// - fakeNotification(mode, log)：log.created 記下每則送出的 { title, body, tag }，log.requests 是 requestPermission() 被呼叫幾次
// - fakeAudioContext(log)：建出來是 suspended、resume() 之後 running；log.beeps 是排了幾聲提示音（oscillator.start() 幾次）

const NOTIFICATION_MODES = ['default', 'granted', 'denied', 'unsupported', 'throws'];

// Notification 替身（同 tests/reminder-scheduler.test.js 的 fakeNotification）：permission 和真的一樣，使用者回答之後才改變
function fakeNotification(mode, log) {
    class FakeNotification {
        static permission = mode === 'throws' ? 'granted' : mode;

        static requestPermission() {
            log.requests += 1;
            if (FakeNotification.permission === 'default') FakeNotification.permission = 'granted';
            return Promise.resolve(FakeNotification.permission);
        }

        constructor(title, options = {}) {
            if (mode === 'throws') throw new TypeError('Illegal constructor');
            log.created.push({ title, body: options.body, tag: options.tag });
        }

        close() {}
    }
    return FakeNotification;
}

// AudioContext 替身：和瀏覽器的自動播放限制一樣，建出來是 suspended，resume() 之後才是 running；數 oscillator.start() 幾次
function fakeAudioContext(log) {
    return class FakeAudioContext {
        constructor() {
            this.state = 'suspended';
            this.currentTime = 0;
            this.destination = {};
        }

        resume() {
            this.state = 'running';
            return Promise.resolve();
        }

        createOscillator() {
            return {
                type: '',
                frequency: { setValueAtTime() {} },
                connect() {},
                start: () => { log.beeps += 1; },
                stop() {}
            };
        }

        createGain() {
            return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {} };
        }
    };
}

module.exports = { NOTIFICATION_MODES, fakeNotification, fakeAudioContext };
