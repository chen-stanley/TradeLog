// web/js/charts.js
// 圖表分析頁邏輯

let chartInstances = {};  // 存放所有 Chart.js 實例，方便之後銷毀重建

// ==================== 初始化 ====================

async function initCharts() {
    gsap.from("#page-charts", { y: 30, opacity: 0, duration: 0.8, ease: "power3.out" });
    await refreshCharts();
}

// ==================== 資料刷新 ====================

async function refreshCharts() {
    const res = await API.getChartData();
    if (res.status !== 'success') return;

    const d = res.data;
    renderStatCards(d.win_rate, d.best, d.worst);
    renderPieChart(d.market_share);
    renderBarChart(d.monthly);
    renderRankChart(d.symbol_profit);
    renderLineChart(d.cumulative);
}

// ==================== 工具函數 ====================

function destroyChart(id) {
    if (chartInstances[id]) {
        chartInstances[id].destroy();
        delete chartInstances[id];
    }
}

function isDark() {
    return document.documentElement.classList.contains('dark');
}

function gridColor() {
    return isDark() ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
}

function tickColor() {
    return isDark() ? '#9CA3AF' : '#6B7280';
}

function formatMonth(ym) {
    // YYYYMM → YYYY/MM
    return `${ym.slice(0, 4)}/${ym.slice(4, 6)}`;
}

function formatDate(d) {
    // YYYYMMDD → YYYY/MM/DD
    return `${d.slice(0, 4)}/${d.slice(4, 6)}/${d.slice(6, 8)}`;
}

// ==================== 統計卡 ====================

function renderStatCards(winRate, best, worst) {
    // 勝率環形進度
    const rate = winRate.rate || 0;
    document.getElementById('c-win-rate').innerText  = `${rate}%`;
    document.getElementById('c-wins').innerText      = winRate.wins;
    document.getElementById('c-losses').innerText    = winRate.losses;
    document.getElementById('c-total').innerText     = winRate.total;

    // 勝率圓環
    destroyChart('winRateChart');
    const ctx = document.getElementById('winRateChart').getContext('2d');
    chartInstances['winRateChart'] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [winRate.wins, winRate.losses, Math.max(0, winRate.total - winRate.wins - winRate.losses)],
                backgroundColor: ['#0ECB81', '#FF6B6B', isDark() ? '#3E4651' : '#E5E7EB'],
                borderWidth: 0,
                hoverOffset: 4,
            }]
        },
        options: {
            cutout: '75%',
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            animation: { animateRotate: true, duration: 1200 }
        }
    });

    // 最佳標的
    const bestProfit = best.profit || 0;
    document.getElementById('c-best-symbol').innerText = best.symbol || '--';
    document.getElementById('c-best-profit').innerText = bestProfit >= 0
        ? `+${formatNum(bestProfit)}` : formatNum(bestProfit);
    document.getElementById('c-best-profit').className = `text-2xl font-extrabold table-num mt-1 ${bestProfit >= 0 ? 'text-success' : 'text-danger'}`;

    // 最差標的
    const worstProfit = worst.profit || 0;
    document.getElementById('c-worst-symbol').innerText = worst.symbol || '--';
    document.getElementById('c-worst-profit').innerText = worstProfit >= 0
        ? `+${formatNum(worstProfit)}` : formatNum(worstProfit);
    document.getElementById('c-worst-profit').className = `text-2xl font-extrabold table-num mt-1 ${worstProfit >= 0 ? 'text-success' : 'text-danger'}`;
}

// ==================== 圓餅圖（市場佔比）====================

function renderPieChart(marketShare) {
    destroyChart('pieChart');
    const total = marketShare.twd + marketShare.usd + marketShare.crypto;

    if (total === 0) {
        document.getElementById('pie-empty').classList.remove('hidden');
        return;
    }
    document.getElementById('pie-empty').classList.add('hidden');

    const ctx = document.getElementById('pieChart').getContext('2d');
    chartInstances['pieChart'] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['台股', '美股', 'Crypto'],
            datasets: [{
                data: [marketShare.twd, marketShare.usd, marketShare.crypto],
                backgroundColor: ['#26C0DB', '#A78BFA', '#4ECDC4'],
                borderColor: isDark() ? '#2B3139' : '#FFFFFF',
                borderWidth: 3,
                hoverOffset: 8,
            }]
        },
        options: {
            cutout: '60%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: tickColor(),
                        padding: 16,
                        font: { size: 12, weight: '600' },
                        usePointStyle: true,
                        pointStyleWidth: 8,
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const count = ctx.parsed;
                            const pct = ((count / total) * 100).toFixed(1);
                            return ` ${ctx.label}：${count} 筆 (${pct}%)`;
                        }
                    }
                }
            },
            animation: { animateRotate: true, duration: 1200 }
        }
    });
}

// ==================== 長條圖（每月盈虧）====================

function renderBarChart(monthly) {
    destroyChart('barChart');
    const labels  = Object.keys(monthly).map(formatMonth);
    const twdData = Object.values(monthly).map(m => m.twd);
    const usdData = Object.values(monthly).map(m => m.usd);
    const cryData = Object.values(monthly).map(m => m.crypto);

    if (labels.length === 0) {
        document.getElementById('bar-empty').classList.remove('hidden');
        return;
    }
    document.getElementById('bar-empty').classList.add('hidden');

    const ctx = document.getElementById('barChart').getContext('2d');
    chartInstances['barChart'] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: '台股 (TWD)',
                    data: twdData,
                    backgroundColor: (ctx) => ctx.raw >= 0 ? 'rgba(38,192,219,0.8)' : 'rgba(255,107,107,0.8)',
                    borderRadius: 6,
                    borderSkipped: false,
                },
                {
                    label: '美股 (USD)',
                    data: usdData,
                    backgroundColor: (ctx) => ctx.raw >= 0 ? 'rgba(167,139,250,0.8)' : 'rgba(255,107,107,0.6)',
                    borderRadius: 6,
                    borderSkipped: false,
                },
                {
                    label: 'Crypto (USDT)',
                    data: cryData,
                    backgroundColor: (ctx) => ctx.raw >= 0 ? 'rgba(78,205,196,0.8)' : 'rgba(255,107,107,0.5)',
                    borderRadius: 6,
                    borderSkipped: false,
                },
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: tickColor(),
                        font: { size: 12, weight: '600' },
                        usePointStyle: true,
                        pointStyleWidth: 8,
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const val = ctx.parsed.y;
                            const prefix = val >= 0 ? '+' : '';
                            return ` ${ctx.dataset.label}: ${prefix}${val.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: gridColor() },
                    ticks: { color: tickColor(), font: { size: 11 } }
                },
                y: {
                    grid: { color: gridColor() },
                    ticks: {
                        color: tickColor(),
                        font: { size: 11 },
                        callback: (val) => val.toLocaleString('en-US')
                    }
                }
            }
        }
    });
}

// ==================== 橫向長條圖（標的排行）====================

function renderRankChart(symbolProfit) {
    destroyChart('rankChart');
    const entries = Object.entries(symbolProfit);

    if (entries.length === 0) {
        document.getElementById('rank-empty').classList.remove('hidden');
        return;
    }
    document.getElementById('rank-empty').classList.add('hidden');

    // 取前10名（正負各排）
    const sorted  = entries.sort((a, b) => b[1] - a[1]);
    const top     = sorted.slice(0, 10);
    const labels  = top.map(e => e[0]);
    const values  = top.map(e => e[1]);
    const colors  = values.map(v => v >= 0 ? 'rgba(14,203,129,0.85)' : 'rgba(255,107,107,0.85)');

    const ctx = document.getElementById('rankChart').getContext('2d');
    chartInstances['rankChart'] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: colors,
                borderRadius: 6,
                borderSkipped: false,
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const val = ctx.parsed.x;
                            const prefix = val >= 0 ? '+' : '';
                            return ` 盈虧: ${prefix}${val.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: gridColor() },
                    ticks: {
                        color: tickColor(),
                        font: { size: 11 },
                        callback: (val) => val.toLocaleString('en-US')
                    }
                },
                y: {
                    grid: { display: false },
                    ticks: { color: tickColor(), font: { size: 11, weight: '600' } }
                }
            }
        }
    });
}

// ==================== 折線圖（累積盈虧走勢）====================

function renderLineChart(cumulative) {
    destroyChart('lineChart');

    if (cumulative.length === 0) {
        document.getElementById('line-empty').classList.remove('hidden');
        return;
    }
    document.getElementById('line-empty').classList.add('hidden');

    const labels = cumulative.map(c => formatDate(c.date));
    const values = cumulative.map(c => c.total);
    const lastVal = values[values.length - 1] || 0;
    const lineColor = lastVal >= 0 ? '#0ECB81' : '#FF6B6B';

    const ctx = document.getElementById('lineChart').getContext('2d');

    // 漸層填充
    const gradient = ctx.createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, lastVal >= 0 ? 'rgba(14,203,129,0.3)' : 'rgba(255,107,107,0.3)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');

    chartInstances['lineChart'] = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: '累積盈虧',
                data: values,
                borderColor: lineColor,
                backgroundColor: gradient,
                borderWidth: 2.5,
                pointRadius: cumulative.length > 30 ? 0 : 4,
                pointHoverRadius: 6,
                pointBackgroundColor: lineColor,
                fill: true,
                tension: 0.4,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const val = ctx.parsed.y;
                            const prefix = val >= 0 ? '+' : '';
                            return ` 累積盈虧: ${prefix}${val.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: gridColor() },
                    ticks: {
                        color: tickColor(),
                        font: { size: 10 },
                        maxTicksLimit: 12,
                    }
                },
                y: {
                    grid: { color: gridColor() },
                    ticks: {
                        color: tickColor(),
                        font: { size: 11 },
                        callback: (val) => val.toLocaleString('en-US')
                    }
                }
            },
            animation: { duration: 1200, easing: 'easeInOutQuart' }
        }
    });
}