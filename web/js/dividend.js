// web/js/dividend.js
// 高股息專區：持倉管理、配息記錄、儀表板、個股報告書

let _divHoldings = [];        // 持倉快取
let _divLivePrices = {};      // { symbol: price|null }
let _divLiveUpdatedAt = null;
let _divCurrentSymbol = null; // 個股報告書當前標的
let _divView = 'dashboard';   // 'dashboard' | 'report'
let _divBarChart = null;
let _divLineChart = null;
let _divChartYear = new Date().getFullYear();
let _divCachedAccDiv = 0;     // 最後一次抓到的累積股息，供刷新股價時使用
let _divCachedTotalCost = 0;  // 最後一次計算的總投入成本

// ==================== 初始化 ====================

async function initDividend() {
    renderDividendShell();
    await loadDividendDashboard();
}

function renderDividendShell() {
    const page = document.getElementById('page-dividend');
    page.innerHTML = `
        <!-- 頁首 -->
        <div class="flex items-center gap-3 flex-shrink-0" id="div-header">
            <div class="bg-yellow-400/10 dark:bg-yellow-400/20 p-2 rounded-xl border border-yellow-400/20">
                <iconify-icon icon="solar:money-bag-bold-duotone" class="text-yellow-400 text-2xl"></iconify-icon>
            </div>
            <div>
                <h1 class="text-xl font-extrabold">高股息專區</h1>
                <p class="text-xs text-gray-500 dark:text-gray-400">存股持倉管理 · 股息收入追蹤</p>
            </div>
            <div class="ml-auto flex items-center gap-2" id="div-header-actions"></div>
        </div>

        <!-- 動態主內容 -->
        <div id="div-main" class="flex flex-col gap-4 flex-1"></div>

        <!-- Modals -->
        <div id="div-modal-overlay" class="hidden fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm" onclick="closeDivModal(event)">
            <div id="div-modal-box" class="glass rounded-3xl p-6 w-[400px] shadow-2xl relative" onclick="event.stopPropagation()">
                <div id="div-modal-content"></div>
            </div>
        </div>
    `;
}

// ==================== 儀表板 ====================

function _divFadeOut(cb) {
    const main = document.getElementById('div-main');
    if (main) gsap.to(main, { opacity: 0, y: -10, duration: 0.18, ease: 'power1.in', onComplete: cb });
    else cb();
}

function _divFadeIn() {
    const main = document.getElementById('div-main');
    if (main) gsap.fromTo(main, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' });
}

async function loadDividendDashboard() {
    _divView = 'dashboard';
    _divCurrentSymbol = null;

    const [holdingsRes, recordsRes] = await Promise.all([
        API.getDividendHoldings(),
        API.getDividendRecords(''),
    ]);
    _divHoldings = (holdingsRes.status === 'success') ? holdingsRes.data : [];

    // 預設顯示有記錄的最新年份
    if (recordsRes.status === 'success' && recordsRes.data.length > 0) {
        const years = recordsRes.data
            .filter(r => r.date)
            .map(r => parseInt(r.date.slice(0, 4), 10));
        _divChartYear = Math.max(...years);
    } else {
        _divChartYear = new Date().getFullYear();
    }

    renderDividendHeaderActions('dashboard');
    _divFadeOut(() => { renderDividendDashboard(); _divFadeIn(); });
    fetchDivLivePrices();
}

function renderDividendHeaderActions(view, holding) {
    const iconBox = document.querySelector('#div-header .bg-yellow-400\\/10');
    const h1 = document.querySelector('#div-header h1');
    const p  = document.querySelector('#div-header p');
    const actionsEl = document.getElementById('div-header-actions');

    if (view === 'dashboard') {
        if (iconBox) iconBox.style.display = '';
        if (h1) h1.innerHTML = '高股息專區';
        if (p)  p.innerHTML  = '存股持倉管理 · 股息收入追蹤';
        actionsEl.innerHTML = `
            <div class="text-xs text-gray-400/60 flex items-center gap-1" id="div-price-source"></div>
            <button onclick="fetchDivLivePrices()" class="px-4 py-2 bg-success/10 hover:bg-success/20 text-success rounded-xl font-bold transition flex items-center gap-2 text-sm border border-success/20">
                <iconify-icon icon="solar:refresh-bold-duotone"></iconify-icon> 刷新股價
            </button>
            <button onclick="openDivHoldingModal()" class="px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-xl font-bold transition flex items-center gap-2 text-sm border border-primary/20">
                <iconify-icon icon="solar:add-circle-bold-duotone"></iconify-icon> 新增持倉
            </button>
        `;
    } else {
        if (iconBox) iconBox.style.display = 'none';
        if (h1) h1.innerHTML = `
            <span class="text-primary">${holding.symbol}</span>
            <span class="text-gray-500 dark:text-gray-400 font-bold text-base ml-1">${holding.name || ''}</span>
        `;
        if (p) p.innerHTML = `
            <span class="inline-flex items-center gap-1 text-success bg-success/10 px-2 py-0.5 rounded-lg text-xs font-bold border border-success/20">
                <iconify-icon icon="solar:arrow-up-bold"></iconify-icon> 持有中
            </span>
        `;
        actionsEl.innerHTML = `
            <button onclick="loadDividendDashboard()" class="px-4 py-2 bg-gray-200 dark:bg-inputBgDark hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-xl font-bold transition flex items-center gap-2 text-sm">
                <iconify-icon icon="solar:alt-arrow-left-bold"></iconify-icon> 返回
            </button>
            <button onclick="openDivHoldingModal('${holding.id}')" class="px-4 py-2 bg-gray-200 dark:bg-inputBgDark hover:bg-primary/10 text-gray-600 dark:text-gray-300 hover:text-primary rounded-xl font-bold transition flex items-center gap-2 text-sm">
                <iconify-icon icon="solar:pen-bold-duotone"></iconify-icon> 編輯持倉
            </button>
            <button onclick="openDivRecordModal(_divCurrentSymbol)" class="px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-xl font-bold transition flex items-center gap-2 text-sm border border-primary/20">
                <iconify-icon icon="solar:add-circle-bold-duotone"></iconify-icon> 新增配息
            </button>
        `;
    }
}

function renderDividendDashboard() {
    const main = document.getElementById('div-main');
    main.innerHTML = `
        <!-- 統計卡 -->
        <div class="grid grid-cols-5 gap-3 flex-shrink-0" id="div-stat-cards">
            ${renderDivStatCards()}
        </div>

        <!-- 月收入長條圖（全寬） -->
        <div class="glass rounded-3xl p-5 shadow-xl flex-shrink-0" style="height:230px">
            <div class="flex items-center gap-2 mb-3">
                <iconify-icon icon="solar:chart-bold-duotone" class="text-yellow-400 text-lg"></iconify-icon>
                <span class="font-bold text-sm flex-1">每月股息收入</span>
                <div class="flex items-center gap-1">
                    <button onclick="divChartPrevYear()" class="w-7 h-7 rounded-lg bg-inputBgLight dark:bg-inputBgDark hover:bg-primary/20 hover:text-primary text-gray-500 dark:text-gray-400 flex items-center justify-center transition-all text-xs">
                        <iconify-icon icon="solar:alt-arrow-left-bold"></iconify-icon>
                    </button>
                    <span id="div-chart-year-label" class="font-bold text-sm w-16 text-center">${_divChartYear} 年</span>
                    <button onclick="divChartNextYear()" class="w-7 h-7 rounded-lg bg-inputBgLight dark:bg-inputBgDark hover:bg-primary/20 hover:text-primary text-gray-500 dark:text-gray-400 flex items-center justify-center transition-all text-xs">
                        <iconify-icon icon="solar:alt-arrow-right-bold"></iconify-icon>
                    </button>
                </div>
            </div>
            <div class="relative" style="height:160px">
                <canvas id="div-bar-chart"></canvas>
            </div>
        </div>

        <!-- 持倉總覽表格（全寬） -->
        <div class="glass rounded-3xl flex flex-col shadow-xl overflow-hidden flex-1">
            <div class="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                <span class="font-bold text-sm flex items-center gap-2">
                    <iconify-icon icon="solar:case-bold-duotone" class="text-yellow-400"></iconify-icon> 持倉總覽
                </span>
                <div id="div-live-info" class="text-xs text-gray-400"></div>
            </div>
            <div class="flex-1 overflow-auto custom-scrollbar">
                <table class="w-full text-center border-collapse table-auto">
                    <thead class="text-gray-500 dark:text-gray-400 text-xs tracking-wider border-b border-gray-300 dark:border-gray-700 sticky top-0 bg-white/95 dark:bg-bgDark/95 backdrop-blur-md z-10">
                        <tr>
                            <th class="px-3 py-2">標的</th>
                            <th class="px-3 py-2">名稱</th>
                            <th class="px-3 py-2">股數</th>
                            <th class="px-3 py-2">均價</th>
                            <th class="px-3 py-2">現價</th>
                            <th class="px-3 py-2">未實現%</th>
                            <th class="px-3 py-2">成本殖利率</th>
                            <th class="px-3 py-2">現價殖利率</th>
                            <th class="px-3 py-2">今年已領</th>
                            <th class="px-3 py-2">年化報酬率</th>
                            <th class="px-3 py-2">操作</th>
                        </tr>
                    </thead>
                    <tbody id="div-holdings-tbody" class="text-sm text-gray-700 dark:text-gray-200"></tbody>
                </table>
            </div>
        </div>
    `;

    renderDivHoldingsTable();
    renderDivBarChart();

    // 統計卡 stagger 入場
    gsap.from('#div-stat-cards > div', {
        opacity: 0, y: 20, duration: 0.4, stagger: 0.07, ease: 'power2.out'
    });
    // 長條圖 + 持倉表 滑入
    gsap.from('#div-main > div:not(:first-child)', {
        opacity: 0, y: 24, duration: 0.45, delay: 0.25, stagger: 0.1, ease: 'power2.out'
    });
}

// ==================== 統計卡 ====================

function renderDivStatCards() {
    const totalCost = _divHoldings.reduce((s, h) => s + (h.avg_cost * h.qty), 0);
    return `
        <div class="glass rounded-2xl p-4 shadow-lg relative overflow-hidden">
            <div class="absolute -right-4 -top-4 w-24 h-24 bg-yellow-400 rounded-full opacity-10 blur-2xl"></div>
            <div class="flex items-center gap-2 mb-2">
                <iconify-icon icon="solar:wallet-bold-duotone" class="text-yellow-400"></iconify-icon>
                <p class="text-xs text-gray-500 dark:text-gray-400 font-bold">總投入成本</p>
            </div>
            <div class="text-xl font-extrabold table-num text-yellow-400" id="div-stat-cost">NT$${Math.round(totalCost).toLocaleString()}</div>
            <div class="text-xs text-gray-400 mt-1">TWD</div>
        </div>
        <div class="glass rounded-2xl p-4 shadow-lg relative overflow-hidden">
            <div class="absolute -right-4 -top-4 w-24 h-24 bg-green-500 rounded-full opacity-10 blur-2xl"></div>
            <div class="flex items-center gap-2 mb-2">
                <iconify-icon icon="solar:cash-out-bold-duotone" class="text-success"></iconify-icon>
                <p class="text-xs text-gray-500 dark:text-gray-400 font-bold">累積股息</p>
            </div>
            <div class="text-xl font-extrabold table-num text-success" id="div-stat-total-div">NT$--</div>
            <div class="text-xs text-gray-400 mt-1" id="div-stat-div-pct">-- 累積報酬</div>
        </div>
        <div class="glass rounded-2xl p-4 shadow-lg relative overflow-hidden">
            <div class="absolute -right-4 -top-4 w-24 h-24 bg-blue-500 rounded-full opacity-10 blur-2xl"></div>
            <div class="flex items-center gap-2 mb-2">
                <iconify-icon icon="solar:chart-2-bold-duotone" class="text-primary"></iconify-icon>
                <p class="text-xs text-gray-500 dark:text-gray-400 font-bold">未實現價差</p>
            </div>
            <div class="text-xl font-extrabold table-num text-gray-400" id="div-stat-unrealized">--</div>
            <div class="text-xs text-gray-400 mt-1" id="div-stat-unreal-pct">需即時股價</div>
        </div>
        <div class="glass rounded-2xl p-4 shadow-lg relative overflow-hidden">
            <div class="absolute -right-4 -top-4 w-24 h-24 bg-orange-400 rounded-full opacity-10 blur-2xl"></div>
            <div class="flex items-center gap-2 mb-2">
                <iconify-icon icon="solar:cup-star-bold-duotone" class="text-orange-400"></iconify-icon>
                <p class="text-xs text-gray-500 dark:text-gray-400 font-bold">總報酬</p>
            </div>
            <div class="text-xl font-extrabold table-num text-gray-400" id="div-stat-total-return">--</div>
            <div class="text-xs text-gray-400 mt-1" id="div-stat-return-pct">價差＋股息</div>
            <div class="text-xs text-gray-400 mt-0.5">未實現價差 + 累積股息</div>
        </div>
        <div class="glass rounded-2xl p-4 shadow-lg relative overflow-hidden">
            <div class="absolute -right-4 -top-4 w-24 h-24 bg-purple-500 rounded-full opacity-10 blur-2xl"></div>
            <div class="flex items-center gap-2 mb-2">
                <iconify-icon icon="solar:calendar-bold-duotone" class="text-purple-400"></iconify-icon>
                <p class="text-xs text-gray-500 dark:text-gray-400 font-bold">年化收入預估</p>
            </div>
            <div class="text-xl font-extrabold table-num text-purple-400" id="div-stat-annual">NT$--</div>
            <div class="text-xs text-gray-400 mt-1" id="div-stat-annual-pct">-- 殖利率</div>
        </div>
    `;
}

async function updateDivStatCards(records = null) {
    if (!records) {
        const res = await API.getDividendRecords('');
        if (res.status !== 'success') return;
        records = res.data;
    }

    const now = new Date();
    const oneYearAgo = new Date(now);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const totalCost = _divHoldings.reduce((s, h) => s + (h.avg_cost * h.qty), 0);

    const accDiv = records
        .filter(r => r.status === '入帳')
        .reduce((s, r) => s + (r.total || 0), 0);

    // Forward Yield：最近一次每股配息 × 年配頻率 × 持股數
    let annualDiv = 0;
    for (const h of _divHoldings) {
        const latest = records.find(r => r.symbol === h.symbol && r.status === '入帳');
        if (!latest) continue;
        const freq = h.freq || 4;
        annualDiv += latest.cash_per_share * freq * h.qty;
    }

    const el = (id) => document.getElementById(id);
    if (el('div-stat-total-div')) el('div-stat-total-div').textContent = `NT$${Math.round(accDiv).toLocaleString()}`;
    if (el('div-stat-annual'))    el('div-stat-annual').textContent    = `NT$${Math.round(annualDiv).toLocaleString()} /年`;

    // 累積報酬率（累積股息 ÷ 總投入成本）
    if (el('div-stat-div-pct') && totalCost > 0) {
        const pct = (accDiv / totalCost * 100).toFixed(1);
        el('div-stat-div-pct').textContent = `+${pct}% 累積報酬`;
    }

    // Forward Yield 殖利率（年化預估 ÷ 總投入成本）
    if (el('div-stat-annual-pct') && totalCost > 0) {
        const pct = (annualDiv / totalCost * 100).toFixed(1);
        el('div-stat-annual-pct').textContent = `殖利率 ${pct}%`;
    }

    _divCachedAccDiv = accDiv;
    _divCachedTotalCost = totalCost;
    updateDivUnrealizedCard(accDiv, totalCost);
}

// _accDiv 與 totalCost 由 updateDivStatCards 傳入，避免重複查詢
function updateDivUnrealizedCard(accDiv, totalCost) {
    const elUnreal = document.getElementById('div-stat-unrealized');
    const elUnrealPct = document.getElementById('div-stat-unreal-pct');
    const elReturn = document.getElementById('div-stat-total-return');
    const elReturnPct = document.getElementById('div-stat-return-pct');
    if (!elUnreal) return;

    let unrealTotal = 0;
    let hasPrice = false;
    for (const h of _divHoldings) {
        const price = _divLivePrices[h.symbol];
        if (price !== undefined && price !== null) {
            unrealTotal += (price - h.avg_cost) * h.qty;
            hasPrice = true;
        }
    }

    if (!hasPrice && _divHoldings.length > 0) {
        elUnreal.textContent = '--';
        elUnreal.className = 'text-xl font-extrabold table-num text-gray-400';
        if (elUnrealPct) elUnrealPct.textContent = '需即時股價';
        if (elReturn) { elReturn.textContent = '--'; elReturn.className = 'text-xl font-extrabold table-num text-gray-400'; }
        if (elReturnPct) elReturnPct.textContent = '價差＋股息';
        return;
    }

    const cost = totalCost ?? _divHoldings.reduce((s, h) => s + (h.avg_cost * h.qty), 0);
    const unrealColor = unrealTotal >= 0 ? 'text-success' : 'text-danger';
    elUnreal.textContent = `NT$${Math.round(unrealTotal).toLocaleString()}`;
    elUnreal.className = `text-xl font-extrabold table-num ${unrealColor}`;
    if (elUnrealPct && cost > 0) {
        const pct = (unrealTotal / cost * 100).toFixed(1);
        elUnrealPct.textContent = `${pct >= 0 ? '+' : ''}${pct}%`;
        elUnrealPct.className = `text-xs mt-1 ${unrealColor}`;
    }

    // 總報酬 = 未實現價差 + 累積股息
    const acc = accDiv ?? 0;
    const totalReturn = unrealTotal + acc;
    const returnColor = totalReturn >= 0 ? 'text-success' : 'text-danger';
    if (elReturn) {
        elReturn.textContent = `NT$${Math.round(totalReturn).toLocaleString()}`;
        elReturn.className = `text-xl font-extrabold table-num ${returnColor}`;
    }
    if (elReturnPct && cost > 0) {
        const pct = (totalReturn / cost * 100).toFixed(1);
        elReturnPct.textContent = `${pct >= 0 ? '+' : ''}${pct}%`;
        elReturnPct.className = `text-xs mt-1 ${returnColor}`;
    }
}

// ==================== 月收入長條圖 ====================

async function divChartPrevYear() {
    _divChartYear--;
    const label = document.getElementById('div-chart-year-label');
    if (label) label.textContent = `${_divChartYear} 年`;
    await renderDivBarChart();
}

async function divChartNextYear() {
    _divChartYear++;
    const label = document.getElementById('div-chart-year-label');
    if (label) label.textContent = `${_divChartYear} 年`;
    await renderDivBarChart();
}

async function renderDivBarChart() {
    const res = await API.getDividendRecords('');
    if (res.status !== 'success') return;

    const records = res.data;
    const monthly = Array(12).fill(0);

    for (const r of records) {
        if (r.status !== '入帳') continue;
        if (!r.date || !r.date.startsWith(String(_divChartYear))) continue;
        const m = parseInt(r.date.slice(5, 7), 10) - 1;
        monthly[m] += r.total || 0;
    }

    const canvas = document.getElementById('div-bar-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (_divBarChart) { _divBarChart.destroy(); _divBarChart = null; }

    const isDark = document.documentElement.classList.contains('dark');
    const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    const labelColor = isDark ? '#9CA3AF' : '#6B7280';

    _divBarChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'],
            datasets: [{
                data: monthly,
                backgroundColor: 'rgba(250,204,21,0.7)',
                borderRadius: 6,
                borderSkipped: false,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: { label: (c) => `NT$${Math.round(c.raw).toLocaleString()}` }
                }
            },
            scales: {
                x: { grid: { color: gridColor }, ticks: { color: labelColor, font: { size: 10 } } },
                y: { grid: { color: gridColor }, ticks: { color: labelColor, font: { size: 10 },
                    callback: (v) => `NT$${Math.round(v).toLocaleString()}` } }
            }
        }
    });

    updateDivStatCards(records);
    updateDivYieldCells(records);
}

// ==================== 持倉總覽表格 ====================

function renderDivHoldingsTable() {
    const tbody = document.getElementById('div-holdings-tbody');
    if (!tbody) return;

    if (_divHoldings.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="py-16 text-gray-400 text-center">尚無持倉，點擊「新增持倉」開始記錄</td></tr>`;
        return;
    }

    tbody.innerHTML = _divHoldings.map(h => {
        const price = _divLivePrices[h.symbol];
        const priceStr = (price !== undefined && price !== null) ? price.toLocaleString() : '--';
        const unrealPct = (price && h.avg_cost > 0)
            ? (((price - h.avg_cost) / h.avg_cost) * 100).toFixed(2)
            : null;
        const unrealStr = unrealPct !== null
            ? `<span class="${parseFloat(unrealPct) >= 0 ? 'text-success' : 'text-danger'}">${unrealPct >= 0 ? '+' : ''}${unrealPct}%</span>`
            : '--';

        return `<tr onclick="loadDividendReport('${h.symbol}')"
            class="border-b border-gray-100 dark:border-gray-700/50 hover:bg-primary/5 dark:hover:bg-primary/10 transition-colors cursor-pointer group">
            <td class="px-3 py-2.5 font-bold text-primary group-hover:underline">${h.symbol}</td>
            <td class="px-3 py-2.5 text-left text-xs text-gray-500 dark:text-gray-400">${h.name || '--'}</td>
            <td class="px-3 py-2.5 table-num">${h.qty.toLocaleString()}</td>
            <td class="px-3 py-2.5 table-num">${h.avg_cost.toLocaleString()}</td>
            <td class="px-3 py-2.5 table-num div-price-cell" data-sym="${h.symbol}">${priceStr}</td>
            <td class="px-3 py-2.5 div-unreal-cell" data-sym="${h.symbol}">${unrealStr}</td>
            <td class="px-3 py-2.5 table-num div-cost-yield-cell" data-sym="${h.symbol}">--</td>
            <td class="px-3 py-2.5 table-num div-price-yield-cell" data-sym="${h.symbol}">--</td>
            <td class="px-3 py-2.5 table-num div-this-year-cell" data-sym="${h.symbol}">--</td>
            <td class="px-3 py-2.5 table-num div-annual-return-cell" data-sym="${h.symbol}">--</td>
            <td class="px-3 py-2.5" onclick="event.stopPropagation()">
                <div class="flex items-center justify-center gap-1">
                    <button onclick="openDivHoldingModal('${h.id}')" class="p-1.5 rounded-lg hover:bg-primary/10 text-primary transition">
                        <iconify-icon icon="solar:pen-bold-duotone" class="text-base"></iconify-icon>
                    </button>
                    <button onclick="deleteDivHolding(${h.id}, '${h.symbol}')" class="p-1.5 rounded-lg hover:bg-danger/10 text-danger transition">
                        <iconify-icon icon="solar:trash-bin-trash-bold" class="text-base"></iconify-icon>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');

}

async function updateDivYieldCells(records = null) {
    if (!records) {
        const res = await API.getDividendRecords('');
        if (res.status !== 'success') return;
        records = res.data;
    }

    const now = new Date();
    const oneYearAgo = new Date(now);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const thisYear = now.getFullYear();

    for (const h of _divHoldings) {
        const symRecords = records.filter(r => r.symbol === h.symbol && r.status === '入帳');
        const past12 = symRecords.filter(r => r.date >= oneYearAgo.toISOString().slice(0, 10))
            .reduce((s, r) => s + (r.total || 0), 0);
        const thisYearTotal = symRecords.filter(r => r.date && r.date.startsWith(String(thisYear)))
            .reduce((s, r) => s + (r.total || 0), 0);

        const cost = h.avg_cost * h.qty;
        const price = _divLivePrices[h.symbol];
        const marketVal = price ? price * h.qty : null;

        const costYield = cost > 0 ? ((past12 / cost) * 100).toFixed(2) + '%' : '--';
        const priceYield = (marketVal && marketVal > 0) ? ((past12 / marketVal) * 100).toFixed(2) + '%' : '--';

        // 年化報酬率
        const unrealPnl = (price !== null && price !== undefined) ? (price - h.avg_cost) * h.qty : null;
        const accDiv = symRecords.reduce((s, r) => s + (r.total || 0), 0);
        const totalReturn = unrealPnl !== null ? unrealPnl + accDiv : null;
        let annualStr = '--';
        let annualColor = 'text-gray-400';
        if (totalReturn !== null && cost > 0 && h.created_at) {
            const years = (Date.now() - new Date(h.created_at).getTime()) / (365.25 * 24 * 3600 * 1000);
            if (years >= 1 / 12) {
                const pct = ((totalReturn / cost) / years * 100).toFixed(2);
                annualStr = `${pct >= 0 ? '+' : ''}${pct}%`;
                annualColor = parseFloat(pct) >= 0 ? 'text-success' : 'text-danger';
            }
        }

        const costCell   = document.querySelector(`.div-cost-yield-cell[data-sym="${h.symbol}"]`);
        const priceCell  = document.querySelector(`.div-price-yield-cell[data-sym="${h.symbol}"]`);
        const yearCell   = document.querySelector(`.div-this-year-cell[data-sym="${h.symbol}"]`);
        const annualCell = document.querySelector(`.div-annual-return-cell[data-sym="${h.symbol}"]`);

        if (costCell)   costCell.textContent = costYield;
        if (priceCell)  priceCell.textContent = priceYield;
        if (yearCell)   yearCell.textContent = `NT$${Math.round(thisYearTotal).toLocaleString()}`;
        if (annualCell) { annualCell.textContent = annualStr; annualCell.className = `px-3 py-2.5 table-num font-bold div-annual-return-cell ${annualColor}`; }
    }
}

// ==================== 即時股價 ====================

async function fetchDivLivePrices() {
    const src = document.getElementById('div-price-source');
    if (src) src.innerHTML = `<iconify-icon icon="solar:refresh-bold-duotone" class="animate-spin"></iconify-icon> 抓取中...`;

    const res = await API.getDividendLivePrices();
    if (res.status !== 'success') {
        if (src) src.textContent = '股價抓取失敗';
        return;
    }

    _divLivePrices = res.data.prices || {};
    _divLiveUpdatedAt = res.data.updated_at;

    if (src) src.innerHTML = `<iconify-icon icon="solar:clock-circle-bold-duotone"></iconify-icon> Yahoo Finance · ${_divLiveUpdatedAt}`;

    const liveInfo = document.getElementById('div-live-info');
    if (liveInfo) liveInfo.innerHTML = `<iconify-icon icon="solar:clock-circle-bold-duotone"></iconify-icon> ${_divLiveUpdatedAt} · Yahoo Finance`;

    // 更新表格價格欄
    document.querySelectorAll('.div-price-cell').forEach(cell => {
        const sym = cell.dataset.sym;
        const price = _divLivePrices[sym];
        cell.textContent = (price !== undefined && price !== null) ? price.toLocaleString() : '--';
    });

    // 更新未實現%欄
    document.querySelectorAll('.div-unreal-cell').forEach(cell => {
        const sym = cell.dataset.sym;
        const h = _divHoldings.find(x => x.symbol === sym);
        if (!h) return;
        const price = _divLivePrices[sym];
        if (!price || h.avg_cost <= 0) { cell.innerHTML = '--'; return; }
        const pct = ((price - h.avg_cost) / h.avg_cost * 100).toFixed(2);
        cell.innerHTML = `<span class="${pct >= 0 ? 'text-success' : 'text-danger'}">${pct >= 0 ? '+' : ''}${pct}%</span>`;
    });

    updateDivUnrealizedCard(_divCachedAccDiv, _divCachedTotalCost);
    updateDivYieldCells();

    // 若在個股報告書，也更新摘要
    if (_divView === 'report' && _divCurrentSymbol) {
        updateReportSummaryPrices();
    }
}

// ==================== 持倉管理 Modal ====================

async function openDivHoldingModal(holdingId) {
    let holding = null;
    if (holdingId) {
        holding = _divHoldings.find(h => String(h.id) === String(holdingId));
    }

    const title = holding ? '編輯持倉' : '新增持倉';
    const content = `
        <div class="flex items-center gap-2 mb-5">
            <iconify-icon icon="solar:case-bold-duotone" class="text-yellow-400 text-xl"></iconify-icon>
            <h3 class="font-extrabold text-lg">${title}</h3>
            <button onclick="closeDivModal()" class="ml-auto w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-inputBgLight dark:hover:bg-inputBgDark transition">
                <iconify-icon icon="solar:close-bold"></iconify-icon>
            </button>
        </div>
        <div class="space-y-3">
            <div>
                <label class="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1 block">標的代號</label>
                <input id="div-h-symbol" type="text" placeholder="例：0056" value="${holding ? holding.symbol : ''}"
                    class="w-full px-3 py-2.5 bg-inputBgLight dark:bg-inputBgDark rounded-xl text-sm outline-none border border-transparent focus:border-primary transition"
                    ${holding ? 'readonly' : ''}>
            </div>
            <div>
                <label class="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1 block">名稱</label>
                <input id="div-h-name" type="text" placeholder="例：元大高股息" value="${holding ? (holding.name || '') : ''}"
                    class="w-full px-3 py-2.5 bg-inputBgLight dark:bg-inputBgDark rounded-xl text-sm outline-none border border-transparent focus:border-primary transition">
            </div>
            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1 block">持股數</label>
                    <input id="div-h-qty" type="number" placeholder="0" value="${holding ? holding.qty : ''}"
                        class="w-full px-3 py-2.5 bg-inputBgLight dark:bg-inputBgDark rounded-xl text-sm outline-none border border-transparent focus:border-primary transition">
                </div>
                <div>
                    <label class="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1 block">均價 (TWD)</label>
                    <input id="div-h-avgcost" type="number" placeholder="0" value="${holding ? holding.avg_cost : ''}"
                        class="w-full px-3 py-2.5 bg-inputBgLight dark:bg-inputBgDark rounded-xl text-sm outline-none border border-transparent focus:border-primary transition">
                </div>
            </div>
            <div>
                <label class="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1 block">配息頻率</label>
                <select id="div-h-freq" class="w-full px-3 py-2.5 bg-inputBgLight dark:bg-inputBgDark rounded-xl text-sm outline-none border border-transparent focus:border-primary transition">
                    <option value="1" ${(holding?.freq ?? 4) === 1 ? 'selected' : ''}>年配（1次/年）</option>
                    <option value="2" ${(holding?.freq ?? 4) === 2 ? 'selected' : ''}>半年配（2次/年）</option>
                    <option value="4" ${(holding?.freq ?? 4) === 4 ? 'selected' : ''}>季配（4次/年）</option>
                    <option value="12" ${(holding?.freq ?? 4) === 12 ? 'selected' : ''}>月配（12次/年）</option>
                </select>
            </div>
            ${holding ? `
            <div class="mt-1">
                <button onclick="toggleDivAddCalc()" class="flex items-center gap-1.5 text-xs text-primary font-bold hover:underline">
                    <iconify-icon icon="solar:calculator-bold-duotone"></iconify-icon>
                    <span>加減碼計算機</span>
                    <iconify-icon icon="solar:alt-arrow-down-bold" id="div-calc-chevron" class="transition-transform"></iconify-icon>
                </button>
                <div id="div-add-calc" class="hidden mt-2 p-3 bg-yellow-400/5 border border-yellow-400/20 rounded-xl space-y-2">
                    <div class="flex gap-1.5">
                        <button id="div-calc-btn-buy" onclick="setDivCalcMode('buy')"
                            class="flex-1 py-1.5 rounded-lg text-xs font-bold transition bg-success/20 text-success border border-success/30">
                            ＋ 加碼
                        </button>
                        <button id="div-calc-btn-sell" onclick="setDivCalcMode('sell')"
                            class="flex-1 py-1.5 rounded-lg text-xs font-bold transition bg-inputBgLight dark:bg-inputBgDark text-gray-400 border border-transparent">
                            － 減碼
                        </button>
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        <div>
                            <label id="div-calc-qty-label" class="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1 block">加買股數</label>
                            <input id="div-calc-qty" type="number" placeholder="0" oninput="calcDivResult()"
                                class="w-full px-3 py-2 bg-inputBgLight dark:bg-inputBgDark rounded-xl text-sm outline-none border border-transparent focus:border-yellow-400 transition">
                        </div>
                        <div id="div-calc-price-wrap">
                            <label class="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1 block">加買價格</label>
                            <input id="div-calc-price" type="number" placeholder="0" step="0.01" oninput="calcDivResult()"
                                class="w-full px-3 py-2 bg-inputBgLight dark:bg-inputBgDark rounded-xl text-sm outline-none border border-transparent focus:border-yellow-400 transition">
                        </div>
                    </div>
                    <div id="div-calc-result" class="hidden text-xs bg-inputBgLight dark:bg-inputBgDark rounded-xl px-3 py-2 space-y-0.5">
                        <div class="flex justify-between"><span class="text-gray-400">新持股數</span><span id="div-calc-new-qty" class="font-bold table-num"></span></div>
                        <div id="div-calc-avg-row" class="flex justify-between"><span class="text-gray-400">新加權均價</span><span id="div-calc-new-avg" class="font-bold table-num text-yellow-400"></span></div>
                    </div>
                    <button onclick="applyDivCalc()" class="w-full py-2 bg-yellow-400/20 hover:bg-yellow-400/30 text-yellow-500 dark:text-yellow-300 font-bold rounded-xl text-xs transition flex items-center justify-center gap-1.5">
                        <iconify-icon icon="solar:check-circle-bold-duotone"></iconify-icon> 套用至上方欄位
                    </button>
                </div>
            </div>
            ` : ''}
        </div>
        <button onclick="saveDivHolding(${holding ? holding.id : 'null'})"
            class="w-full mt-5 bg-primary hover:bg-cyan-400 text-white dark:text-bgDark font-bold py-3 rounded-xl transition flex items-center justify-center gap-2">
            <iconify-icon icon="solar:diskette-bold"></iconify-icon> 儲存
        </button>
    `;

    document.getElementById('div-modal-content').innerHTML = content;
    _openDivModal();
}

let _divCalcMode = 'buy';

function toggleDivAddCalc() {
    const panel = document.getElementById('div-add-calc');
    const chevron = document.getElementById('div-calc-chevron');
    const isHidden = panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !isHidden);
    if (chevron) chevron.style.transform = isHidden ? 'rotate(180deg)' : '';
    if (isHidden) setDivCalcMode('buy');
}

function setDivCalcMode(mode) {
    _divCalcMode = mode;
    const btnBuy  = document.getElementById('div-calc-btn-buy');
    const btnSell = document.getElementById('div-calc-btn-sell');
    const qtyLabel    = document.getElementById('div-calc-qty-label');
    const priceWrap   = document.getElementById('div-calc-price-wrap');
    const avgRow      = document.getElementById('div-calc-avg-row');

    if (mode === 'buy') {
        btnBuy.className  = 'flex-1 py-1.5 rounded-lg text-xs font-bold transition bg-success/20 text-success border border-success/30';
        btnSell.className = 'flex-1 py-1.5 rounded-lg text-xs font-bold transition bg-inputBgLight dark:bg-inputBgDark text-gray-400 border border-transparent';
        if (qtyLabel) qtyLabel.textContent = '加買股數';
        if (priceWrap) priceWrap.classList.remove('hidden');
        if (avgRow) avgRow.classList.remove('hidden');
    } else {
        btnSell.className = 'flex-1 py-1.5 rounded-lg text-xs font-bold transition bg-danger/20 text-danger border border-danger/30';
        btnBuy.className  = 'flex-1 py-1.5 rounded-lg text-xs font-bold transition bg-inputBgLight dark:bg-inputBgDark text-gray-400 border border-transparent';
        if (qtyLabel) qtyLabel.textContent = '減賣股數';
        if (priceWrap) priceWrap.classList.add('hidden');
        if (avgRow) avgRow.classList.add('hidden');
    }

    document.getElementById('div-calc-qty').value = '';
    document.getElementById('div-calc-result').classList.add('hidden');
}

function calcDivResult() {
    const oldQty   = parseFloat(document.getElementById('div-h-qty')?.value) || 0;
    const oldAvg   = parseFloat(document.getElementById('div-h-avgcost')?.value) || 0;
    const chgQty   = parseFloat(document.getElementById('div-calc-qty')?.value) || 0;
    const result   = document.getElementById('div-calc-result');
    if (!result || chgQty <= 0) { result?.classList.add('hidden'); return; }

    if (_divCalcMode === 'buy') {
        const addPrice = parseFloat(document.getElementById('div-calc-price')?.value) || 0;
        if (addPrice <= 0) { result.classList.add('hidden'); return; }
        const newQty = oldQty + chgQty;
        const newAvg = ((oldQty * oldAvg) + (chgQty * addPrice)) / newQty;
        document.getElementById('div-calc-new-qty').textContent = newQty.toLocaleString() + ' 股';
        document.getElementById('div-calc-new-avg').textContent = 'NT$' + newAvg.toFixed(2);
    } else {
        if (chgQty > oldQty) { result.classList.add('hidden'); return; }
        const newQty = oldQty - chgQty;
        document.getElementById('div-calc-new-qty').textContent = newQty.toLocaleString() + ' 股';
    }
    result.classList.remove('hidden');
}

function applyDivCalc() {
    const oldQty  = parseFloat(document.getElementById('div-h-qty')?.value) || 0;
    const oldAvg  = parseFloat(document.getElementById('div-h-avgcost')?.value) || 0;
    const chgQty  = parseFloat(document.getElementById('div-calc-qty')?.value) || 0;

    if (chgQty <= 0) { showToast('請填入股數', 'error'); return; }

    if (_divCalcMode === 'buy') {
        const addPrice = parseFloat(document.getElementById('div-calc-price')?.value) || 0;
        if (addPrice <= 0) { showToast('請填入加買價格', 'error'); return; }
        const newQty = oldQty + chgQty;
        const newAvg = ((oldQty * oldAvg) + (chgQty * addPrice)) / newQty;
        document.getElementById('div-h-qty').value = newQty;
        document.getElementById('div-h-avgcost').value = newAvg.toFixed(2);
        showToast('已套用：加碼後新均價與股數', 'success');
    } else {
        if (chgQty > oldQty) { showToast('減碼股數不能超過現有持股', 'error'); return; }
        document.getElementById('div-h-qty').value = oldQty - chgQty;
        showToast('已套用：減碼後新股數（均價不變）', 'success');
    }

    document.getElementById('div-calc-qty').value = '';
    if (document.getElementById('div-calc-price')) document.getElementById('div-calc-price').value = '';
    document.getElementById('div-calc-result').classList.add('hidden');
    toggleDivAddCalc();
}

async function saveDivHolding(holdingId) {
    const symbol = document.getElementById('div-h-symbol').value.trim().toUpperCase();
    const name = document.getElementById('div-h-name').value.trim();
    const qty = parseFloat(document.getElementById('div-h-qty').value) || 0;
    const avg_cost = parseFloat(document.getElementById('div-h-avgcost').value) || 0;
    const freq = parseInt(document.getElementById('div-h-freq').value) || 4;

    if (!symbol) { showToast('請輸入標的代號', 'error'); return; }

    const data = { symbol, name, qty, avg_cost, freq };

    let res;
    if (holdingId) {
        res = await API.updateDividendHolding(holdingId, data);
    } else {
        res = await API.addDividendHolding(data);
    }

    if (res.status === 'success') {
        showToast(holdingId ? '持倉已更新' : '持倉已新增', 'success');
        closeDivModal();
        await loadDividendDashboard();
    } else {
        showToast(`錯誤：${res.message}`, 'error');
    }
}

async function deleteDivHolding(id, symbol) {
    if (!confirm(`確定要刪除「${symbol}」持倉嗎？（配息記錄不受影響）`)) return;
    const res = await API.deleteDividendHolding(id);
    if (res.status === 'success') {
        showToast('持倉已刪除', 'success');
        await loadDividendDashboard();
    } else {
        showToast(`錯誤：${res.message}`, 'error');
    }
}

// ==================== 配息記錄 Modal ====================

async function openDivRecordModal(preSymbol) {
    const holdingsRes = await API.getDividendHoldings();
    const holdings = (holdingsRes.status === 'success') ? holdingsRes.data : [];

    const symbolOptions = holdings.map(h =>
        `<option value="${h.symbol}" ${h.symbol === preSymbol ? 'selected' : ''}>${h.symbol} ${h.name ? '- ' + h.name : ''}</option>`
    ).join('');

    const preQty = preSymbol ? (holdings.find(h => h.symbol === preSymbol)?.qty || '') : '';
    const today = new Date().toISOString().slice(0, 10);

    const content = `
        <div class="flex items-center gap-2 mb-5">
            <iconify-icon icon="solar:cash-out-bold-duotone" class="text-success text-xl"></iconify-icon>
            <h3 class="font-extrabold text-lg">新增配息記錄</h3>
            <button onclick="closeDivModal()" class="ml-auto w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-inputBgLight dark:hover:bg-inputBgDark transition">
                <iconify-icon icon="solar:close-bold"></iconify-icon>
            </button>
        </div>
        <div class="space-y-3">
            <div class="grid grid-cols-2 gap-3">
                <div class="col-span-2">
                    <label class="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1 block">標的</label>
                    <select id="div-r-symbol" onchange="onDivRecordSymbolChange()"
                        class="w-full px-3 py-2.5 bg-inputBgLight dark:bg-inputBgDark rounded-xl text-sm outline-none border border-transparent focus:border-primary transition">
                        <option value="">-- 選擇標的 --</option>
                        ${symbolOptions}
                    </select>
                </div>
                <div>
                    <label class="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1 block">日期</label>
                    <input id="div-r-date" type="date" value="${today}"
                        class="w-full px-3 py-2.5 bg-inputBgLight dark:bg-inputBgDark rounded-xl text-sm outline-none border border-transparent focus:border-primary transition">
                </div>
                <div>
                    <label class="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1 block">狀態</label>
                    <select id="div-r-status" class="w-full px-3 py-2.5 bg-inputBgLight dark:bg-inputBgDark rounded-xl text-sm outline-none border border-transparent focus:border-primary transition">
                        <option value="入帳">入帳</option>
                        <option value="預計">預計</option>
                    </select>
                </div>
                <div class="col-span-2">
                    <label class="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1 block">每股配息 (TWD)</label>
                    <div class="flex gap-2">
                        <input id="div-r-cps" type="number" placeholder="0.0" step="0.01"
                            oninput="updateDivRecordTotal()"
                            class="flex-1 px-3 py-2.5 bg-inputBgLight dark:bg-inputBgDark rounded-xl text-sm outline-none border border-transparent focus:border-primary transition">
                        <button onclick="autofetchDivAmount()"
                            class="px-4 py-2.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-xl transition text-xs font-bold border border-primary/20 whitespace-nowrap flex items-center gap-1.5">
                            <iconify-icon icon="solar:magic-stick-bold-duotone"></iconify-icon> 自動抓取
                        </button>
                    </div>
                    <div id="div-r-fetch-msg" class="text-xs mt-1 hidden"></div>
                </div>
                <div>
                    <label class="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1 block">股數</label>
                    <input id="div-r-qty" type="number" placeholder="0" value="${preQty}"
                        oninput="updateDivRecordTotal()"
                        class="w-full px-3 py-2.5 bg-inputBgLight dark:bg-inputBgDark rounded-xl text-sm outline-none border border-transparent focus:border-primary transition">
                </div>
                <div class="col-span-2">
                    <label class="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1 block">入帳金額（試算）</label>
                    <div id="div-r-total-preview" class="px-3 py-2.5 bg-inputBgLight/50 dark:bg-inputBgDark/50 rounded-xl text-sm font-bold text-success table-num">NT$0</div>
                </div>
                <div class="col-span-2">
                    <label class="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1 block">備註</label>
                    <input id="div-r-remark" type="text" placeholder="（選填）"
                        class="w-full px-3 py-2.5 bg-inputBgLight dark:bg-inputBgDark rounded-xl text-sm outline-none border border-transparent focus:border-primary transition">
                </div>
            </div>
        </div>
        <button onclick="saveDivRecord()"
            class="w-full mt-5 bg-success hover:bg-green-400 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2">
            <iconify-icon icon="solar:diskette-bold"></iconify-icon> 儲存配息
        </button>
    `;

    document.getElementById('div-modal-content').innerHTML = content;
    _openDivModal();
    updateDivRecordTotal();
}

function onDivRecordSymbolChange() {
    const sym = document.getElementById('div-r-symbol').value;
    const h = _divHoldings.find(x => x.symbol === sym);
    const qtyEl = document.getElementById('div-r-qty');
    if (h && qtyEl) {
        qtyEl.value = h.qty;
        updateDivRecordTotal();
    }
}

function updateDivRecordTotal() {
    const cps = parseFloat(document.getElementById('div-r-cps')?.value) || 0;
    const qty = parseFloat(document.getElementById('div-r-qty')?.value) || 0;
    const total = cps * qty;
    const el = document.getElementById('div-r-total-preview');
    if (el) el.textContent = `NT$${Math.round(total).toLocaleString()}`;
}

async function autofetchDivAmount() {
    const sym = document.getElementById('div-r-symbol').value;
    const msg = document.getElementById('div-r-fetch-msg');
    if (!sym) { showToast('請先選擇標的', 'error'); return; }

    msg.textContent = '抓取中...';
    msg.classList.remove('hidden', 'text-danger');
    msg.classList.add('text-gray-400');

    const res = await API.fetchDividendAmount(sym);
    if (res.status === 'success') {
        document.getElementById('div-r-cps').value = res.data.amount;
        msg.textContent = `已填入：${res.data.amount} TWD（可修改）`;
        msg.classList.add('text-success');
        updateDivRecordTotal();
    } else {
        msg.textContent = '查無資料，請手動填寫';
        msg.classList.remove('text-gray-400');
        msg.classList.add('text-danger');
    }
}

async function saveDivRecord() {
    const symbol = document.getElementById('div-r-symbol').value;
    const date = document.getElementById('div-r-date').value;
    const cash_per_share = parseFloat(document.getElementById('div-r-cps').value) || 0;
    const qty = parseFloat(document.getElementById('div-r-qty').value) || 0;
    const status = document.getElementById('div-r-status').value;
    const remark = document.getElementById('div-r-remark').value.trim();
    const total = cash_per_share * qty;

    if (!symbol) { showToast('請選擇標的', 'error'); return; }
    if (!date)   { showToast('請填入日期', 'error'); return; }

    const res = await API.addDividendRecord({ symbol, date, cash_per_share, qty, total, status, remark });
    if (res.status === 'success') {
        showToast('配息記錄已新增', 'success');
        closeDivModal();
        if (_divView === 'report' && _divCurrentSymbol === symbol) {
            await loadDividendReport(symbol);
        } else {
            await loadDividendDashboard();
        }
    } else {
        showToast(`錯誤：${res.message}`, 'error');
    }
}

// ==================== 個股報告書 ====================

async function loadDividendReport(symbol) {
    _divView = 'report';
    _divCurrentSymbol = symbol;

    const holding = _divHoldings.find(h => h.symbol === symbol);
    if (!holding) {
        showToast('找不到持倉資料', 'error');
        return;
    }

    const recordsRes = await API.getDividendRecords(symbol);
    const records = (recordsRes.status === 'success') ? recordsRes.data : [];

    renderDividendHeaderActions('report', holding);
    _divFadeOut(() => { renderDividendReport(holding, records); _divFadeIn(); });
}

function renderDividendReport(holding, records) {
    const main = document.getElementById('div-main');
    const price = _divLivePrices[holding.symbol];
    const hasPrice = (price !== null && price !== undefined);

    const cost = holding.avg_cost * holding.qty;
    const unrealPnl = hasPrice ? (price - holding.avg_cost) * holding.qty : null;
    const accDiv = records.filter(r => r.status === '入帳').reduce((s, r) => s + (r.total || 0), 0);
    const totalReturn = (unrealPnl !== null) ? unrealPnl + accDiv : null;

    const oneYearAgo = new Date(); oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const past12Div = records
        .filter(r => r.status === '入帳' && r.date >= oneYearAgo.toISOString().slice(0, 10))
        .reduce((s, r) => s + (r.total || 0), 0);

    const marketVal = hasPrice ? price * holding.qty : null;
    const costYield  = cost > 0 ? ((past12Div / cost) * 100).toFixed(2) + '%' : '--';
    const priceYield = (marketVal && marketVal > 0) ? ((past12Div / marketVal) * 100).toFixed(2) + '%' : '--';

    const fmtPct = (val, base) => base > 0 ? `(${val >= 0 ? '+' : ''}${(val / base * 100).toFixed(2)}%)` : '';
    const unrealColor  = unrealPnl  === null ? 'text-gray-400' : (unrealPnl  >= 0 ? 'text-success' : 'text-danger');
    const returnColor  = totalReturn === null ? 'text-gray-400' : (totalReturn >= 0 ? 'text-success' : 'text-danger');

    // 年化報酬率：從 created_at 到今天
    let annualizedReturn = null;
    if (totalReturn !== null && cost > 0 && holding.created_at) {
        const startDate = new Date(holding.created_at);
        const years = (Date.now() - startDate.getTime()) / (365.25 * 24 * 3600 * 1000);
        if (years >= 1 / 12) {  // 至少持有一個月才顯示
            annualizedReturn = ((totalReturn / cost) / years * 100).toFixed(2);
        }
    }
    const annualColor = annualizedReturn === null ? 'text-gray-400' : (parseFloat(annualizedReturn) >= 0 ? 'text-success' : 'text-danger');

    main.innerHTML = `
        <!-- 上半：摘要卡（左）+ 趨勢圖（右） -->
        <div class="grid grid-cols-5 gap-4 flex-shrink-0" style="min-height:260px">

            <!-- 左：持倉摘要卡 -->
            <div class="col-span-2 glass rounded-3xl p-5 shadow-xl flex flex-col gap-3">

                <!-- 持股 / 均價 / 現價 三欄 -->
                <div class="grid grid-cols-3 gap-2">
                    <div class="bg-gray-100/60 dark:bg-white/5 rounded-2xl p-3 text-center">
                        <div class="text-xs text-gray-400 font-bold mb-1">持股數</div>
                        <div class="font-extrabold table-num text-base">${holding.qty.toLocaleString()}</div>
                        <div class="text-xs text-gray-400">股</div>
                    </div>
                    <div class="bg-gray-100/60 dark:bg-white/5 rounded-2xl p-3 text-center">
                        <div class="text-xs text-gray-400 font-bold mb-1">均價</div>
                        <div class="font-extrabold table-num text-base">${holding.avg_cost.toLocaleString()}</div>
                        <div class="text-xs text-gray-400">TWD</div>
                    </div>
                    <div class="bg-gray-100/60 dark:bg-white/5 rounded-2xl p-3 text-center">
                        <div class="text-xs text-gray-400 font-bold mb-1">現價</div>
                        <div class="font-extrabold table-num text-base" id="div-rp-price">${hasPrice ? price.toLocaleString() : '--'}</div>
                        <div class="text-xs text-gray-400">TWD</div>
                    </div>
                </div>

                <!-- 損益三行 -->
                <div class="space-y-1.5">
                    <div class="flex justify-between items-center py-1.5 px-3 rounded-xl hover:bg-gray-50/50 dark:hover:bg-white/5 transition-colors">
                        <span class="text-xs text-gray-500 dark:text-gray-400 font-bold">投入成本</span>
                        <span class="font-bold table-num text-sm">NT$${Math.round(cost).toLocaleString()}</span>
                    </div>
                    <div class="flex justify-between items-center py-1.5 px-3 rounded-xl hover:bg-gray-50/50 dark:hover:bg-white/5 transition-colors">
                        <span class="text-xs text-gray-500 dark:text-gray-400 font-bold">未實現價差</span>
                        <div class="text-right">
                            <div class="font-bold table-num text-sm ${unrealColor}" id="div-rp-unreal">${unrealPnl !== null ? (unrealPnl >= 0 ? '+' : '') + 'NT$' + Math.round(unrealPnl).toLocaleString() : '--'}</div>
                            <div class="text-xs table-num ${unrealColor}" id="div-rp-unreal-pct">${unrealPnl !== null ? fmtPct(unrealPnl, cost) : ''}</div>
                        </div>
                    </div>
                    <div class="flex justify-between items-center py-1.5 px-3 rounded-xl hover:bg-gray-50/50 dark:hover:bg-white/5 transition-colors">
                        <span class="text-xs text-gray-500 dark:text-gray-400 font-bold">累積股息</span>
                        <span class="font-bold table-num text-sm text-success">NT$${Math.round(accDiv).toLocaleString()}</span>
                    </div>
                </div>

                <!-- 分隔線 -->
                <div class="border-t border-gray-200 dark:border-gray-700"></div>

                <!-- 總報酬 -->
                <div class="flex justify-between items-center py-1.5 px-3 rounded-xl hover:bg-gray-50/50 dark:hover:bg-white/5 transition-colors">
                    <span class="text-sm font-extrabold text-gray-700 dark:text-gray-200">總報酬</span>
                    <div class="text-right">
                        <span class="font-extrabold table-num text-lg ${returnColor}" id="div-rp-total-return">${totalReturn !== null ? (totalReturn >= 0 ? '+' : '') + 'NT$' + Math.round(totalReturn).toLocaleString() : '--'}</span>
                        <span class="text-xs font-bold table-num ${returnColor} ml-1" id="div-rp-return-pct">${totalReturn !== null ? fmtPct(totalReturn, cost) : ''}</span>
                    </div>
                </div>
                <!-- 年化報酬率 -->
                <div class="flex justify-between items-center py-1.5 px-3 rounded-xl hover:bg-gray-50/50 dark:hover:bg-white/5 transition-colors">
                    <span class="text-xs text-gray-500 dark:text-gray-400 font-bold">年化報酬率</span>
                    <span class="font-bold table-num text-sm ${annualColor}" id="div-rp-annual">${annualizedReturn !== null ? annualizedReturn + '% / 年' : '--'}</span>
                </div>

                <!-- 殖利率 -->
                <div class="grid grid-cols-2 gap-2 mt-auto">
                    <div class="bg-yellow-400/10 border border-yellow-400/20 rounded-2xl p-3 text-center">
                        <div class="text-xs text-gray-400 font-bold mb-1">成本殖利率</div>
                        <div class="font-extrabold text-yellow-400 text-base">${costYield}</div>
                    </div>
                    <div class="bg-yellow-400/10 border border-yellow-400/20 rounded-2xl p-3 text-center">
                        <div class="text-xs text-gray-400 font-bold mb-1">現價殖利率</div>
                        <div class="font-extrabold text-yellow-400 text-base">${priceYield}</div>
                    </div>
                </div>
            </div>

            <!-- 右：配息趨勢折線圖 -->
            <div class="col-span-3 glass rounded-3xl p-5 shadow-xl flex flex-col">
                <div class="flex items-center gap-2 mb-3 flex-shrink-0">
                    <iconify-icon icon="solar:chart-bold-duotone" class="text-success text-lg"></iconify-icon>
                    <span class="font-bold text-sm">每股配息趨勢</span>
                </div>
                <div class="flex-1 relative min-h-0" id="div-trend-container">
                    ${buildTrendContent(records)}
                </div>
            </div>
        </div>

        <!-- 下半：股息記錄表（全寬） -->
        <div class="glass rounded-3xl flex flex-col shadow-xl overflow-hidden flex-1">
            <div class="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                <span class="font-bold text-sm flex items-center gap-2">
                    <iconify-icon icon="solar:cash-out-bold-duotone" class="text-success"></iconify-icon> 股息記錄
                </span>
            </div>
            <div class="flex-1 overflow-auto custom-scrollbar">
                ${buildRecordListHTML(records, holding.symbol)}
            </div>
        </div>
    `;

    renderDivTrendChart(records);

    // 報告書各區塊依序滑入
    gsap.from('#div-main > div', {
        opacity: 0, y: 28, duration: 0.45, stagger: 0.12, ease: 'power2.out'
    });
    // 摘要卡內各行逐一淡入
    gsap.from('#div-main .glass:first-child > *', {
        opacity: 0, x: -12, duration: 0.35, stagger: 0.06, delay: 0.15, ease: 'power2.out'
    });
}

function buildTrendContent(records) {
    const confirmed = records.filter(r => r.status === '入帳');
    if (confirmed.length < 2) {
        return `<div class="absolute inset-0 flex items-center justify-center text-gray-400 text-sm text-center px-4">記錄不足，無法繪製趨勢<br><span class="text-xs">（需至少 2 筆已入帳記錄）</span></div>`;
    }
    return `<canvas id="div-line-chart"></canvas>`;
}

function buildRecordListHTML(records, symbol) {
    if (records.length === 0) {
        return `<div class="py-16 text-gray-400 text-center text-sm">尚無配息記錄</div>`;
    }
    return `<table class="w-full text-center border-collapse table-auto">
        <thead class="text-gray-500 dark:text-gray-400 text-xs tracking-wider border-b border-gray-300 dark:border-gray-700 sticky top-0 bg-white/95 dark:bg-bgDark/95 backdrop-blur-md z-10">
            <tr>
                <th class="px-3 py-2">日期</th>
                <th class="px-3 py-2">每股配息</th>
                <th class="px-3 py-2">股數</th>
                <th class="px-3 py-2">入帳金額</th>
                <th class="px-3 py-2">狀態</th>
                <th class="px-3 py-2">備註</th>
                <th class="px-3 py-2">操作</th>
            </tr>
        </thead>
        <tbody class="text-sm text-gray-700 dark:text-gray-200">
            ${records.map(r => `
                <tr class="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50/50 dark:hover:bg-white/5 transition-colors">
                    <td class="px-3 py-2.5 table-num">${r.date || '--'}</td>
                    <td class="px-3 py-2.5 table-num">NT$${(r.cash_per_share || 0).toFixed(2)}</td>
                    <td class="px-3 py-2.5 table-num">${(r.qty || 0).toLocaleString()}</td>
                    <td class="px-3 py-2.5 table-num font-bold ${r.status === '入帳' ? 'text-success' : 'text-gray-400'}">NT$${Math.round(r.total || 0).toLocaleString()}</td>
                    <td class="px-3 py-2.5">
                        ${r.status === '預計'
                            ? '<span class="text-xs bg-yellow-400/10 text-yellow-500 px-2 py-0.5 rounded-lg font-bold">⏳ 預計</span>'
                            : '<span class="text-xs bg-success/10 text-success px-2 py-0.5 rounded-lg font-bold">✓ 入帳</span>'}
                    </td>
                    <td class="px-3 py-2.5 text-xs text-gray-400">${r.remark || ''}</td>
                    <td class="px-3 py-2.5">
                        <button onclick="deleteDivRecord(${r.id}, '${symbol}')" class="p-1.5 rounded-lg hover:bg-danger/10 text-danger transition">
                            <iconify-icon icon="solar:trash-bin-trash-bold" class="text-base"></iconify-icon>
                        </button>
                    </td>
                </tr>
            `).join('')}
        </tbody>
    </table>`;
}

function renderDivTrendChart(records) {
    const confirmed = records.filter(r => r.status === '入帳').slice().reverse();
    if (confirmed.length < 2) return;

    const canvas = document.getElementById('div-line-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (_divLineChart) { _divLineChart.destroy(); _divLineChart = null; }

    const isDark = document.documentElement.classList.contains('dark');
    const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    const labelColor = isDark ? '#9CA3AF' : '#6B7280';

    _divLineChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: confirmed.map(r => r.date),
            datasets: [{
                data: confirmed.map(r => r.cash_per_share),
                borderColor: '#0ECB81',
                backgroundColor: 'rgba(14,203,129,0.1)',
                borderWidth: 2,
                pointRadius: 4,
                pointBackgroundColor: '#0ECB81',
                fill: true,
                tension: 0.3,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (c) => `NT$${parseFloat(c.raw).toFixed(2)} /股` } }
            },
            scales: {
                x: { grid: { color: gridColor }, ticks: { color: labelColor, font: { size: 10 } } },
                y: { grid: { color: gridColor }, ticks: { color: labelColor, font: { size: 10 },
                    callback: (v) => `NT$${parseFloat(v).toFixed(2)}` } }
            }
        }
    });
}

async function updateReportSummaryPrices() {
    if (!_divCurrentSymbol) return;
    const holding = _divHoldings.find(h => h.symbol === _divCurrentSymbol);
    if (!holding) return;

    const price = _divLivePrices[_divCurrentSymbol];
    if (price === null || price === undefined) return;

    const cost = holding.avg_cost * holding.qty;
    const pnl  = (price - holding.avg_cost) * holding.qty;
    const pnlColor = pnl >= 0 ? 'text-success' : 'text-danger';
    const fmtPct = (val, base) => base > 0 ? `(${val >= 0 ? '+' : ''}${(val / base * 100).toFixed(2)}%)` : '';

    // 抓累積股息，計算總報酬
    const res = await API.getDividendRecords(_divCurrentSymbol);
    const accDiv = (res.status === 'success')
        ? res.data.filter(r => r.status === '入帳').reduce((s, r) => s + (r.total || 0), 0)
        : 0;
    const totalReturn = pnl + accDiv;
    const returnColor = totalReturn >= 0 ? 'text-success' : 'text-danger';

    // 年化報酬率
    let annualStr = null;
    if (holding.created_at) {
        const years = (Date.now() - new Date(holding.created_at).getTime()) / (365.25 * 24 * 3600 * 1000);
        if (years >= 1 / 12) {
            annualStr = ((totalReturn / cost) / years * 100).toFixed(2) + '% / 年';
        }
    }

    const get = (id) => document.getElementById(id);
    if (get('div-rp-price'))       get('div-rp-price').textContent = `NT$${price.toLocaleString()}`;
    if (get('div-rp-unreal'))    { get('div-rp-unreal').textContent = `${pnl >= 0 ? '+' : ''}NT$${Math.round(pnl).toLocaleString()}`; get('div-rp-unreal').className = `font-bold table-num ${pnlColor}`; }
    if (get('div-rp-unreal-pct')){ get('div-rp-unreal-pct').textContent = fmtPct(pnl, cost); get('div-rp-unreal-pct').className = `text-sm table-num ${pnlColor}`; }
    if (get('div-rp-total-return')){ get('div-rp-total-return').textContent = `${totalReturn >= 0 ? '+' : ''}NT$${Math.round(totalReturn).toLocaleString()}`; get('div-rp-total-return').className = `font-extrabold table-num text-lg ${returnColor}`; }
    if (get('div-rp-return-pct')) { get('div-rp-return-pct').textContent = fmtPct(totalReturn, cost); get('div-rp-return-pct').className = `text-xs font-bold table-num ${returnColor}`; }
    if (get('div-rp-annual') && annualStr) { get('div-rp-annual').textContent = annualStr; get('div-rp-annual').className = `font-bold table-num text-sm ${returnColor}`; }
}

async function deleteDivRecord(id, symbol) {
    if (!confirm('確定要刪除此筆配息記錄？')) return;
    const res = await API.deleteDividendRecord(id);
    if (res.status === 'success') {
        showToast('已刪除', 'success');
        await loadDividendReport(symbol);
    } else {
        showToast(`錯誤：${res.message}`, 'error');
    }
}

// ==================== Modal 通用 ====================

function _openDivModal() {
    const overlay = document.getElementById('div-modal-overlay');
    const box = document.getElementById('div-modal-box');
    overlay.classList.remove('hidden');
    gsap.fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'power1.out' });
    gsap.fromTo(box, { scale: 0.92, opacity: 0, y: 16 }, { scale: 1, opacity: 1, y: 0, duration: 0.25, ease: 'back.out(1.4)' });
}

function closeDivModal(event) {
    if (event && event.target !== document.getElementById('div-modal-overlay')) return;
    const overlay = document.getElementById('div-modal-overlay');
    const box = document.getElementById('div-modal-box');
    gsap.to(box, { scale: 0.92, opacity: 0, y: 10, duration: 0.18, ease: 'power1.in' });
    gsap.to(overlay, { opacity: 0, duration: 0.2, ease: 'power1.in',
        onComplete: () => overlay.classList.add('hidden') });
}
