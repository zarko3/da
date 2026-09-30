'use strict';

// =====================================================================
// FINANCE PAGE: where the money goes. The day's summary, taxes, inflation,
// how each building is doing, and every transaction.
// =====================================================================

let filter = 'all';                   // 'all', or the number of one building whose history to show

// Links from other pages can pick a building, e.g. finance.html#plot=12.
function readStart() {
  const h = hashParams();
  filter = h.plot !== undefined && h.plot !== '' ? h.plot : uiGet('finance-filter', 'all');
}

function setFilter(value) {
  filter = value;
  uiSet('finance-filter', value);
}

// ---- Company and the day that just finished ----

function renderSummary() {
  const c = companyLevel();
  const day = state.plots.reduce((sum, p) => {
    const r = p.last;
    sum.income += r.revenue; sum.stock += r.stock; sum.wages += r.wages; sum.delivery += r.delivery;
    sum.hiring += r.hiring; sum.upkeep += r.maintenance; sum.taxes += r.property + r.tax;
    return sum;
  }, { income: 0, stock: 0, wages: 0, delivery: 0, hiring: 0, upkeep: 0, taxes: 0 });
  const bankDay = state.lastDay;
  const line = (label, n, isCost) => n ? row(label, plusMinus(isCost ? -n : n)) : '';
  $('fin-summary').innerHTML = `<h2>Company</h2>
    ${row('Cash', `<b class="num ${state.cash < 0 ? 'neg' : ''}">${money(state.cash)}</b>`)}
    ${row('Net worth', `<span class="num">${money(c.worth)}</span>`)}
    ${row('Company level', `<span>${c.level} · ${c.name}</span>`)}
    ${c.next ? `<div class="meter"><i style="width:${Math.round(c.progress * 100)}%"></i></div><p class="muted small-note">${money(c.next.from - c.worth)} more for level ${c.level + 1}.</p>` : ''}
    <h3>Daily summary</h3>
    <p class="muted small-note" style="margin-top:0">The day that just finished, across every building.</p>
    ${line('Money earned', day.income)}${line('Stock bought', day.stock, true)}${line('Wages', day.wages, true)}
    ${line('Delivery costs', day.delivery, true)}${line('Hiring fees', day.hiring, true)}${line('Upkeep', day.upkeep, true)}${line('Taxes', day.taxes, true)}
    ${line('Loan interest', bankDay.interest, true)}${line('Late fees', bankDay.lateFees, true)}
    ${row('Profit or loss', plusMinus(bankDay.profit), 'total')}
    ${bankDay.principal ? `<p class="muted small-note">Not counted above: ${price2(bankDay.principal)} paid back on loans. Paying back what you borrowed is not a cost.</p>` : ''}`;
}

// ---- Taxes ----

function renderTaxes() {
  const d = state.lastDay;
  const paid = state.plots.reduce((sum, p) => { sum.property += p.totals.propertyTax; sum.profit += p.totals.profitTax; return sum; }, { property: 0, profit: 0 });
  $('fin-taxes').innerHTML = `<h2>Taxes</h2>
    ${row('Property tax today', `<span class="num">${price2(d.propertyTax)}</span>`)}
    ${row('Profit tax today', `<span class="num">${price2(d.profitTax)}</span>`)}
    ${row('Property tax paid so far', `<span class="num">${price2(paid.property)}</span>`)}
    ${row('Profit tax paid so far', `<span class="num">${price2(paid.profit)}</span>`)}
    ${row('All taxes paid so far', `<b class="num">${price2(paid.property + paid.profit)}</b>`, 'total')}
    <p class="muted small-note">Every plot you own pays ${(PROPERTY_TAX * 100).toFixed(2)}% of its land and building value each day, even an empty one.
    Each business also pays ${Math.round(PROFIT_TAX * 100)}% of any profit it makes in a day.</p>`;
}

// ---- Inflation ----

function renderInflation() {
  const farmhand = BUILDINGS.farm.roles[0];
  $('fin-inflation').innerHTML = `<h2>Inflation</h2>
    ${row('Change today', `<b class="num">${pct(state.inflationRate)} a day</b>`)}
    ${row('Prices compared with the start', `<span class="num">${state.inflation >= 1 ? '+' : ''}${((state.inflation - 1) * 100).toFixed(1)}%</span>`)}
    ${row('A farmhand now costs', `<span class="num">${money(wageOf(farmhand.wage))} a day <span class="muted">(was ${money(farmhand.wage)})</span></span>`)}
    ${row('An outskirts plot now costs', `<span class="num">${money(plotPrice(0))} <span class="muted">(was ${money(DISTRICTS.outskirts.price)})</span></span>`)}
    <p class="muted small-note">Wages, land, buildings and supplier prices all follow inflation. Your workers get raises as prices rise.</p>`;
}

// ---- How each building is doing ----

function renderBuildings() {
  const owned = state.plots.map((plot, i) => ({ plot, i })).filter(({ plot }) => plot.building);
  if (!owned.length) {
    $('fin-buildings').innerHTML = `<h2>Profit by building</h2><div class="empty-state">${icon('chart')}<b>No buildings yet</b>Build something on the <a href="${pageLink('city')}">City page</a>.</div>`;
    return;
  }
  const rows = owned.map(({ plot, i }) => {
    const today = dayProfit(plot.last), total = profitOf(plot.totals);
    return `<tr><td>${BUILDINGS[plot.building].name} <span class="muted">(${plotLabel(i)})</span></td>
      <td class="${today < 0 ? 'neg' : 'pos'}">${signedWhole(today)}</td>
      <td class="${total < 0 ? 'neg' : 'pos'}">${signedWhole(total)}</td>
      <td><button class="small" data-filter="${i}">History</button></td></tr>`;
  }).join('');
  // Plots you own but have not built on still pay property tax, so they belong in the total.
  const empties = state.plots.filter(p => p.owned && !p.building);
  const emptyToday = empties.reduce((s, p) => s + dayProfit(p.last), 0);
  const emptyAll = empties.reduce((s, p) => s + profitOf(p.totals), 0);
  const emptyRow = empties.length
    ? `<tr><td>Empty plots <span class="muted">(${empties.length}, land tax only)</span></td><td class="neg">${signedWhole(emptyToday)}</td><td class="neg">${signedWhole(emptyAll)}</td><td></td></tr>` : '';
  // Loan interest and late fees are costs of the company as a whole, so they get a row of their own.
  const bankToday = -round2(state.lastDay.interest + state.lastDay.lateFees), bankAll = -round2(state.bank.totals.interest + state.bank.totals.fees);
  const bankRow = bankAll || bankToday
    ? `<tr><td>Bank <span class="muted">(interest and late fees)</span></td><td class="neg">${signedWhole(bankToday)}</td><td class="neg">${signedWhole(bankAll)}</td><td></td></tr>` : '';
  const sumToday = round2(owned.reduce((s, { plot }) => s + dayProfit(plot.last), 0) + emptyToday + bankToday);   // rounded like the daily summary
  const sumAll = round2(owned.reduce((s, { plot }) => s + profitOf(plot.totals), 0) + emptyAll + bankAll);
  $('fin-buildings').innerHTML = `<h2>Profit by building</h2>
    <table class="fin-table"><thead><tr><th>Building</th><th>Today</th><th>So far</th><th></th></tr></thead><tbody>${rows}${emptyRow}${bankRow}</tbody>
    <tfoot><tr><td>Total</td><td class="${sumToday < 0 ? 'neg' : 'pos'}">${signedWhole(sumToday)}</td><td class="${sumAll < 0 ? 'neg' : 'pos'}">${signedWhole(sumAll)}</td><td></td></tr></tfoot></table>
    <p class="muted small-note">"So far" is all the profit a building has made since you built it, after wages, upkeep and taxes. It does not count what you spent on the plot, the building and upgrades.</p>`;
}

// ---- Every transaction ----

function renderHistory() {
  const owned = state.plots.map((plot, i) => ({ plot, i })).filter(({ plot }) => plot.building);
  if (filter !== 'all' && filter !== 'bank' && !state.plots[Number(filter)]) filter = 'all';
  const only = filter === 'all' ? undefined : filter === 'bank' ? 'bank' : Number(filter);
  const list = allTransactions(100, only);
  const options = `<option value="all" ${filter === 'all' ? 'selected' : ''}>All buildings</option>` +
    owned.map(({ plot, i }) => `<option value="${i}" ${String(i) === String(filter) ? 'selected' : ''}>${BUILDINGS[plot.building].name} (${plotLabel(i)})</option>`).join('') +
    `<option value="bank" ${filter === 'bank' ? 'selected' : ''}>The bank (loans and fees)</option>`;
  $('fin-history').innerHTML = `<h2>Transaction history</h2>
    <div class="field"><label>Show</label><select id="fin-filter">${options}</select></div>
    <div class="tx-list">${txRows(list) || '<div class="empty-state"><b>No transactions yet</b>Money movements will be listed here.</div>'}</div>
    ${list.length >= 100 ? '<p class="muted small-note">Showing the newest 100.</p>' : ''}`;
}

function renderPage() {
  renderSummary();
  renderTaxes();
  renderInflation();
  renderBuildings();
  renderHistory();
}

// ---- Clicks ----

$('fin-buildings').addEventListener('click', e => {
  const button = e.target.closest('[data-filter]');
  if (!button) return;
  setFilter(button.dataset.filter);
  render(true);
  const box = $('fin-history');
  if (box.scrollIntoView) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

$('fin-history').addEventListener('change', e => {
  if (e.target.id !== 'fin-filter') return;
  setFilter(e.target.value);
  render(true);
});

readStart();
startPage('finance', renderPage);
