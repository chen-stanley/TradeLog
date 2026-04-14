// web/js/calculator.js
// 投資小工具面板：匯率換算 + 股數試算

const Calculator = (() => {
    let isOpen = false;
    let exchangeRate = null;   // 快取匯率
    let calcUnit = 'TWD';      // 股數試算金額單位
    let lastStockSymbol = null; // 上次試算的股票代號（供刷新使用）

    // ==================== 面板開關 ====================

    function togglePanel() {
        const panel = document.getElementById('calculator-panel');
        const navBtn = document.getElementById('nav-calculator');

        if (isOpen) {
            // 關閉動畫
            gsap.to(panel, {
                duration: 0.3,
                x: -20,
                opacity: 0,
                ease: 'power2.in',
                onComplete: () => {
                    panel.style.display = 'none';
                    gsap.set(panel, { x: 0, opacity: 1 });
                }
            });
            navBtn.classList.remove('active');
            isOpen = false;
        } else {
            // 開啟動畫
            panel.style.display = 'flex';
            gsap.fromTo(panel,
                { x: -30, opacity: 0 },
                { duration: 0.35, x: 0, opacity: 1, ease: 'back.out(1.4)' }
            );
            navBtn.classList.add('active');
            isOpen = true;

            // 若尚未載入匯率，自動抓一次
            if (exchangeRate === null) {
                loadExchangeRate();
            }
        }
    }

    // ==================== 匯率換算 ====================

    async function loadExchangeRate() {
        const res = await API.getExchangeRate();
        if (res.status === 'success') {
            exchangeRate = res.data.rate;
            updateSourceLabel(res.data.updated_at);
        }
    }

    function convertCurrency(source) {
        if (!exchangeRate) return;

        const twdEl = document.getElementById('calc-twd');
        const usdEl = document.getElementById('calc-usd');

        if (source === 'twd') {
            const val = parseFloat(twdEl.value);
            usdEl.value = isNaN(val) ? '' : (val / exchangeRate).toFixed(2);
        } else {
            const val = parseFloat(usdEl.value);
            twdEl.value = isNaN(val) ? '' : (val * exchangeRate).toFixed(2);
        }
    }

    function swapCurrency() {
        const twdEl = document.getElementById('calc-twd');
        const usdEl = document.getElementById('calc-usd');

        // 對調數值
        const tmp = twdEl.value;
        twdEl.value = usdEl.value;
        usdEl.value = tmp;

        // 旋轉 icon 動畫
        gsap.to('#swap-icon', { rotation: '+=180', duration: 0.3, ease: 'power2.out' });
    }

    // ==================== 股數試算 ====================

    function setCalcUnit(unit) {
        calcUnit = unit;
        document.getElementById('calc-amount-unit').textContent = unit;

        const twdBtn = document.getElementById('calc-unit-twd');
        const usdBtn = document.getElementById('calc-unit-usd');
        const activeClass = ['bg-primary', 'text-white'];
        const inactiveClass = ['text-gray-500', 'dark:text-gray-400', 'hover:text-gray-800', 'dark:hover:text-white'];

        if (unit === 'TWD') {
            twdBtn.classList.add(...activeClass);
            twdBtn.classList.remove(...inactiveClass);
            usdBtn.classList.remove(...activeClass);
            usdBtn.classList.add(...inactiveClass);
        } else {
            usdBtn.classList.add(...activeClass);
            usdBtn.classList.remove(...inactiveClass);
            twdBtn.classList.remove(...activeClass);
            twdBtn.classList.add(...inactiveClass);
        }
    }

    async function calcShares() {
        const symbol = document.getElementById('calc-symbol').value.trim().toUpperCase();
        const amount = parseFloat(document.getElementById('calc-amount').value);
        const resultEl = document.getElementById('calc-result');
        const errorEl = document.getElementById('calc-error');

        resultEl.classList.add('hidden');
        errorEl.classList.add('hidden');

        if (!symbol) { showError('請輸入股票代號'); return; }
        if (isNaN(amount) || amount <= 0) { showError('請輸入有效的投入金額'); return; }

        // 若輸入 TWD 且無匯率，先抓匯率
        if (calcUnit === 'TWD' && !exchangeRate) {
            await loadExchangeRate();
            if (!exchangeRate) { showError('無法取得匯率，請稍後再試'); return; }
        }

        // 抓股價
        const res = await API.getStockPrice(symbol);
        if (res.status !== 'success') { showError(res.message || '查詢失敗'); return; }

        lastStockSymbol = symbol;
        const stockPrice = res.data.price;
        updateSourceLabel(res.data.updated_at);

        // 換算
        const amountUSD = calcUnit === 'TWD' ? amount / exchangeRate : amount;
        const amountTWD = calcUnit === 'TWD' ? amount : amount * exchangeRate;
        const shares = Math.floor(amountUSD / stockPrice);
        const remainder = amountUSD - shares * stockPrice;

        // 顯示結果
        document.getElementById('res-twd').textContent = `${formatNum(amountTWD)} TWD`;
        document.getElementById('res-usd').textContent = `${formatNum(amountUSD)} USD`;
        document.getElementById('res-stock-label').textContent = `${symbol} 現價`;
        document.getElementById('res-price').textContent = `$${stockPrice.toFixed(2)} USD`;
        document.getElementById('res-shares').textContent = `${shares} 股`;
        document.getElementById('res-remainder').textContent = `$${remainder.toFixed(2)} USD`;

        resultEl.classList.remove('hidden');
        gsap.from(resultEl, { duration: 0.3, y: 8, opacity: 0, ease: 'power2.out' });
    }

    // ==================== 全部刷新 ====================

    async function refreshAll() {
        const icon = document.getElementById('refresh-icon');
        gsap.to(icon, { rotation: 360, duration: 0.6, ease: 'power2.out', onComplete: () => gsap.set(icon, { rotation: 0 }) });

        // 刷新匯率
        await loadExchangeRate();

        // 若匯率換算框有值，重新換算
        const twdVal = document.getElementById('calc-twd').value;
        if (twdVal) convertCurrency('twd');

        // 若之前有試算過股票，重新試算
        if (lastStockSymbol) {
            document.getElementById('calc-symbol').value = lastStockSymbol;
            await calcShares();
        }
    }

    // ==================== 工具函式 ====================

    function updateSourceLabel(time) {
        document.getElementById('calc-source-label').textContent = `Yahoo Finance · 更新於 ${time}`;
    }

    function showError(msg) {
        const el = document.getElementById('calc-error');
        el.textContent = msg;
        el.classList.remove('hidden');
    }

    function formatNum(n) {
        return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    // ==================== 公開介面 ====================
    return { togglePanel, convertCurrency, swapCurrency, setCalcUnit, calcShares, refreshAll };
})();

// 全域函式供 HTML onclick 使用
function toggleCalculatorPanel() { Calculator.togglePanel(); }
function convertCurrency(source) { Calculator.convertCurrency(source); }
function swapCurrency() { Calculator.swapCurrency(); }
function setCalcUnit(unit) { Calculator.setCalcUnit(unit); }
function calcShares() { Calculator.calcShares(); }
function refreshAll() { Calculator.refreshAll(); }
