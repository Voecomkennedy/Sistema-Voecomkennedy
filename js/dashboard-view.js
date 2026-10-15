// Apenas apresenta o agrupamento mensal já utilizado pelo balanço confiável.
(function () {
    const money = n => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n);
    function render() {
        const host = document.getElementById('monthlyRevenueChart');
        if (!host || document.documentElement.dataset.appAutenticado !== 'true') return;
        const groups = new Map(StorageManager.agruparBalancoPorMes().map(row => [row.mes, row]));
        const now = new Date();
        const rows = Array.from({ length: 6 }, (_, i) => {
            const date = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            return { month: new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(date).replace('.', ''), label: new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(date), value: groups.get(key)?.receitaProjetada || 0 };
        });
        const max = Math.max(...rows.map(row => row.value));
        if (!max) { host.innerHTML = '<div class="panel-chart-empty">As vendas classificadas aparecerão aqui.<small>O gráfico usa a data da venda e o mesmo cálculo do balanço.</small></div>'; return; }
        const ceiling = Math.ceil(max / 4 / 1000) * 4000 || max;
        const y = value => 198 - value / ceiling * 164;
        const grid = [0, 1, 2, 3, 4].map(i => `<line x1="68" y1="${y(i * ceiling / 4)}" x2="654" y2="${y(i * ceiling / 4)}" stroke="#E7EDF2"/><text x="54" y="${y(i * ceiling / 4) + 4}" text-anchor="end" fill="#64748B" font-size="11">${i * ceiling / 4 / 1000} mil</text>`).join('');
        const bars = rows.map((row, i) => `<g><rect x="${98 + i * 94}" y="${y(row.value)}" width="42" height="${198 - y(row.value)}" rx="5" fill="${i === 5 ? '#1A3D63' : '#B3CFE5'}"><title>${row.label}: ${money(row.value)}</title></rect><text x="${119 + i * 94}" y="225" text-anchor="middle" fill="#64748B" font-size="12">${row.month}</text></g>`).join('');
        host.innerHTML = `<svg viewBox="0 0 680 242" role="img" aria-labelledby="monthlyChartTitle monthlyChartDescription"><title id="monthlyChartTitle">Vendido líquido por mês</title><desc id="monthlyChartDescription">${rows.map(row => row.label + ': ' + money(row.value)).join('; ')}</desc>${grid}${bars}</svg><details class="panel-chart-data"><summary>Ver valores do gráfico</summary><table><thead><tr><th>Mês</th><th>Vendido líquido</th></tr></thead><tbody>${rows.map(row => `<tr><td>${row.label}</td><td>${money(row.value)}</td></tr>`).join('')}</tbody></table></details>`;
    }
    document.addEventListener('app:ready', render);
    window.addEventListener('focus', render);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
})();
