const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createFakeDom } = require('./helpers/fake-dom.js');

const ROOT = path.join(__dirname, '..');
const FOOTER_FILE = 'assets/js/components/footer-template.js';
const I18N_MANAGER_FILE = 'assets/js/i18n/i18n-manager.js';
const COMMON_FILE = 'assets/js/i18n/translations/common.js';
// 照 SQUARE ENIX 素材使用規範附上「© SQUARE ENIX」，前面照繁中版官網加上 FINAL FANTASY XIV：zh／en／ja 都是這一行，不翻譯（© 是 U+00A9）
const SE_NOTICE = 'FINAL FANTASY XIV © SQUARE ENIX';

// 在最小 DOM 替身裡載入真正的 footer-template.js（等同 <script src>）；不設定 window.i18n，
// 所以頁尾顯示的就是程式碼裡的 zh 文字
function loadFooterTemplate() {
    const dom = createFakeDom();
    dom.load(FOOTER_FILE);
    return dom.window.FooterTemplate;
}

test('頁尾連結依序是修改紀錄、回報問題、關於、版權聲明、GitHub', () => {
    const container = loadFooterTemplate().createDOM({ basePath: '../../', year: 2031 });
    const links = container.querySelectorAll('ul.footer-links > li > a');

    assert.deepEqual(links.map((link) => link.getAttribute('href')), [
        '../../changelog.html',
        'https://github.com/hydai/ff14.tw/issues/new',
        '../../about.html',
        '../../copyright.html',
        'https://github.com/hydai/ff14.tw'
    ]);

    // data-i18n 的鍵：站內連結放在 <a> 上，外部連結放在內層 span 上
    assert.deepEqual(
        links.map((link) => (link.querySelector('[data-i18n]') ?? link).getAttribute('data-i18n')),
        ['nav_changelog', 'footer_report_issue', 'nav_about', 'nav_copyright', 'nav_github']
    );

    const [changelog, report, about, copyright, github] = links;
    for (const link of [changelog, about, copyright]) {
        assert.ok(!link.hasAttribute('target') && !link.querySelector('.external-mark'), `${link.getAttribute('href')} 是站內連結，不該開新分頁或標示外部`);
    }
    for (const link of [report, github]) {
        const href = link.getAttribute('href');
        assert.equal(link.getAttribute('target'), '_blank', `${href} 要開新分頁`);
        assert.equal(link.getAttribute('rel'), 'noopener noreferrer', `${href} 要有 rel="noopener noreferrer"`);
        // I18nManager 會整段覆寫帶 data-i18n 的元素的 textContent，所以 data-i18n 不能在 <a> 上，否則 ↗ 會被洗掉
        assert.ok(!link.hasAttribute('data-i18n'), `${href} 的 data-i18n 要放在內層 span`);
        assert.ok(link.querySelector('span[data-i18n]'), `${href} 缺少帶 data-i18n 的內層 span`);

        const mark = link.querySelector('span.external-mark');
        assert.ok(mark, `${href} 缺少 .external-mark`);
        assert.equal(mark.getAttribute('aria-hidden'), 'true');
        // ↗ 本身與它往上到頁尾容器為止的每一層祖先，都不能帶 data-i18n
        for (let node = mark; node !== container; node = node.parentNode) {
            assert.ok(!node.hasAttribute('data-i18n'), `${href} 的 .external-mark 不能在帶 data-i18n 的元素裡面`);
        }
    }
});

test('頁尾年份由參數或今年產生，不再寫死 2025', () => {
    const FooterTemplate = loadFooterTemplate();
    const metaText = (options) => {
        const meta = FooterTemplate.createDOM(options).querySelector('.footer-meta');
        assert.ok(meta, '頁尾缺少 .footer-meta');
        return meta.textContent;
    };

    assert.ok(metaText({ year: 2031 }).includes('© 2024–2031 FF14.tw'));
    // 沒有指定年份時用今年（createDOM() 不帶任何參數也要能運作）
    const thisYear = String(new Date().getFullYear());
    assert.ok(metaText().includes(`© 2024–${thisYear} FF14.tw`));
    assert.ok(!fs.readFileSync(path.join(ROOT, FOOTER_FILE), 'utf8').includes('2024-2025'));
});

test('沒有 i18n 時頁尾顯示 zh 文字', () => {
    const dom = createFakeDom();
    dom.load(FOOTER_FILE);
    assert.equal(dom.window.i18n, undefined);
    const container = dom.window.FooterTemplate.createDOM({ year: 2031 });

    // 四列：連結、免責聲明、SQUARE ENIX 的版權標示、版權列；layout-loader 把這個 div.container 包進 footer.footer
    assert.equal(container.tagName, 'DIV');
    assert.equal(container.className, 'container');
    assert.deepEqual(container.children.map((row) => `${row.tagName.toLowerCase()}.${row.className}`), ['ul.footer-links', 'p.footer-disclaimer', 'p.footer-se-copyright', 'p.footer-meta']);

    assert.deepEqual(
        container.querySelectorAll('.footer-links a').map((link) => link.textContent),
        ['修改紀錄', '回報問題 ↗', '關於', '版權聲明', 'GitHub ↗']
    );

    const disclaimer = container.querySelector('.footer-disclaimer');
    assert.equal(disclaimer.getAttribute('data-i18n'), 'footer_copyright');
    assert.equal(disclaimer.textContent, '本站非官方網站，與 Square Enix 無關');

    assert.equal(container.querySelector('.footer-se-copyright').textContent, SE_NOTICE);

    const meta = container.querySelector('.footer-meta');
    assert.equal(meta.querySelector('[data-i18n]').getAttribute('data-i18n'), 'footer_made_with');
    assert.equal(meta.textContent, '© 2024–2031 FF14.tw · Made with ❤️ by hydai');
});

test('切換語言時免責聲明換字，SQUARE ENIX 的標示原封不動', () => {
    // 照 tests/not-found-page.test.js 的 setup()：I18nManager 一建立就讀 navigator 與 localStorage，所以先放替身，
    // 再依序載入 i18n-manager.js、共用翻譯檔與頁尾。setLanguage() 用 document 查 [data-i18n]，所以頁尾要放進 document.body
    const dom = createFakeDom();
    dom.window.navigator = { languages: ['zh-TW'] };
    dom.window.localStorage = { getItem: () => null, setItem() {} };
    dom.load(I18N_MANAGER_FILE);
    dom.load(COMMON_FILE);
    dom.load(FOOTER_FILE);
    const { i18n, FooterTemplate } = dom.window;
    assert.equal(i18n.getCurrentLanguage(), 'zh');

    const container = FooterTemplate.createDOM({ year: 2031 });
    dom.document.body.appendChild(container);
    const disclaimer = container.querySelector('.footer-disclaimer');
    const seRow = container.querySelector('.footer-se-copyright');
    assert.ok(disclaimer, '頁尾缺少 .footer-disclaimer');
    assert.ok(seRow, '頁尾缺少 .footer-se-copyright');

    // I18nManager 會整段覆寫帶 data-i18n 的元素的 textContent，
    // 所以 SQUARE ENIX 這一列與它往上到頁尾容器的每一層，都不能帶 data-i18n
    for (let node = seRow; ; node = node.parentNode) {
        assert.ok(!node.hasAttribute('data-i18n'), `${node.tagName.toLowerCase()}.${node.className} 不能帶 data-i18n，否則切換語言時 SQUARE ENIX 的標示會被改寫`);
        if (node === container) break;
    }

    // 三種語言的免責聲明要真的不同，下面逐一比對才看得出有沒有換字；SQUARE ENIX 的標示三種都是同一行
    const DISCLAIMERS = {
        zh: '本站非官方網站，與 Square Enix 無關',
        en: 'Unofficial site, not affiliated with Square Enix',
        ja: '非公式サイト、スクウェア・エニックスとは無関係'
    };
    assert.equal(new Set(Object.values(DISCLAIMERS)).size, 3);
    assert.equal(disclaimer.textContent, DISCLAIMERS.zh, '還沒切換語言時顯示 zh');
    assert.equal(seRow.textContent, SE_NOTICE);

    for (const lang of ['en', 'ja', 'zh']) {
        i18n.setLanguage(lang);
        assert.equal(i18n.getCurrentLanguage(), lang);
        assert.equal(disclaimer.textContent, DISCLAIMERS[lang], `切到 ${lang}，免責聲明要換成那個語言`);
        // 每次切換之後重新從文件找：沿用一開始抓到的 seRow，那一列被拿掉之後它的字還在，測試照樣通過
        const row = dom.document.querySelector('.footer-se-copyright');
        assert.ok(row, `切到 ${lang}，頁尾的 SQUARE ENIX 標示不見了`);
        assert.equal(row.textContent, SE_NOTICE, `切到 ${lang}，SQUARE ENIX 的標示要原封不動`);
    }
});
