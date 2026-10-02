'use strict';

// =====================================================================
// BANK PAGE: optional loans. Your credit score, the offer you would get,
// the loans you have, and the bank's own history. Nothing here appears on
// the City page; payments come out by themselves every day.
// =====================================================================

let form = { amount: null, term: 30 };          // the loan form (what was typed, so a redraw never loses it)

const rateText = rate => `${(rate * 100).toFixed(2)}% per ${RATE_PERIOD} days`;
const whenText = day => `${dateOf(day)} (day ${day})`;

// ---- Credit score ----

const FACTORS = [
  ['profit', 'Profit', c => c.days < 3 ? 'Not enough history yet' : `Averaging ${signedWhole(c.avgProfit)} a day over the last ${c.days} days`],
  ['history', 'Payment history', c => c.recentMisses ? `${c.recentMisses} missed payment${c.recentMisses === 1 ? '' : 's'} in the last 90 days` : 'No missed payments'],
  ['cash', 'Cash', () => `${money(state.cash)} on hand`],
  ['debt', 'Debt', c => c.debt ? `${money(c.debt)} owed, ${c.ratio >= 1 ? 'more than everything you own' : `${Math.round(c.ratio * 100)}% of what you own`}` : 'No debt'],
];

function renderCredit() {
  const c = creditReport(), limit = loanLimit(c);
  const factors = FACTORS.map(([key, label, note]) => `<div class="factor">
    <span><b>${label}</b><small>${note(c)}</small></span><span class="num">${c.parts[key].points} of ${c.parts[key].max}</span></div>`).join('');
  $('credit').innerHTML = `<h2>Credit score</h2>
    <div class="score"><b class="num">${c.score}</b><span>${c.rating}</span></div>
    <div class="meter"><i style="width:${Math.round((c.score - SCORE_MIN) / (SCORE_MAX - SCORE_MIN) * 100)}%"></i></div>
    <p class="muted small-note" style="margin-top:0">The score runs from ${SCORE_MIN} to ${SCORE_MAX}.</p>
    ${factors}
    ${row('Interest rate right now', `<b class="num">${rateText(loanRate(c.score))}</b>`, 'total')}
    ${row('You can borrow up to', `<b class="num">${limit >= LOAN_MIN ? money(limit) : 'nothing right now'}</b>`)}
    <p class="muted small-note">The rate follows recent inflation (about ${(periodInflation() * 100).toFixed(1)}% over ${RATE_PERIOD} days) and your credit score. A better score means a lower rate and a higher limit. Borrowing lowers the score a little, and missed payments lower it a lot.</p>`;
}

// ---- The loan form ----

function formChoices() {
  const limit = loanLimit();
  const amount = form.amount !== null ? form.amount : limit >= LOAN_MIN ? Math.min(limit, 2000) : LOAN_MIN;
  return { amount, term: form.term, limit };
}

// The offer for what is typed, with the warning that goes with it. Drawn on its own so typing is never interrupted.
function quoteHtml() {
  const f = formChoices(), q = loanQuote(f.amount, f.term);
  if (!q.ok) return `<div class="alert bad" role="alert"><span>${q.reason}</span></div>
    <div class="form-actions"><button class="primary" disabled>Review loan</button></div>`;
  return `<div class="est"><div class="est-title">The offer</div>
      ${row('Interest rate', `<span class="num">${rateText(q.rate)}</span>`)}
      ${row('Daily payment', `<b class="num">${price2(q.payment)}</b>`)}
      ${row('Interest you will pay', `<span class="num">${price2(q.interest)}</span>`)}
      ${row('Total repayment', `<b class="num">${price2(q.total)}</b>`, 'total')}
      ${row('First payment', `<span>${whenText(q.firstPay)}</span>`)}
      ${row('Due date (last payment)', `<span>${whenText(q.due)}</span>`)}
    </div>
    <div class="alert warn" role="alert"><span>You will pay ${price2(q.payment)} every day for ${q.term} days, ${price2(q.total)} in all for ${money(q.amount)} borrowed. It comes out of your cash automatically.</span></div>
    <div class="form-actions"><button class="primary" id="review-loan">Review loan</button></div>`;
}

function renderForm() {
  const f = formChoices();
  $('loan-form').innerHTML = `<h2>Take a loan</h2>
    <p class="muted small-note" style="margin-top:0">Loans are optional. You do not need one to play, and every loan costs interest.</p>
    <div class="field"><label for="ln-amount">Amount</label><input id="ln-amount" type="number" min="${LOAN_MIN}" step="100" value="${Number.isFinite(f.amount) ? f.amount : ''}"></div>
    <div class="field"><label for="ln-term">Repay over</label><select id="ln-term">${LOAN_TERMS.map(d =>
      `<option value="${d}" ${d === f.term ? 'selected' : ''}>${d} days</option>`).join('')}</select></div>
    <div class="quote-box">${quoteHtml()}</div>`;
}

// The last chance to say no: the same numbers again, plainly, and what happens if you cannot pay.
function reviewLoan() {
  const f = formChoices(), q = loanQuote(f.amount, f.term);
  if (!q.ok) { notify(q.reason); return; }
  openModal('Before you borrow',
    `<p>You are borrowing <b>${money(q.amount)}</b> over <b>${q.term} days</b> at ${rateText(q.rate)}.</p>
     ${row('Expected daily payment', `<b class="num">${price2(q.payment)}</b>`)}
     ${row('Total repayment', `<b class="num">${price2(q.total)}</b>`)}
     ${row('Extra you pay in interest', `<span class="num">${price2(q.interest)}</span>`)}
     ${row('Last payment', `<span>${whenText(q.due)}</span>`)}
     <ul>
       <li>The payment comes out of your cash automatically at the end of every day, starting on day ${q.firstPay}.</li>
       <li>If you do not have the cash, the payment is missed. You pay a late fee of at least ${price2(lateFeeFor(q.payment))}, your credit score drops, and the loan keeps going.</li>
       <li>You can pay the loan off early at any time, with no penalty.</li>
     </ul>`,
    [{ label: 'Cancel' }, { label: `Borrow ${money(q.amount)}`, kind: 'primary', onClick: () => {
      reloadState();                                         // the game may have moved on while the dialog was open
      const result = gameService.createLoan(q.amount, q.term, q.rate);
      if (result.ok) notify(`Loan ${result.loan.id} approved. ${money(q.amount)} was added to your cash.`);
    } }]);
}

// ---- Your loans ----

function dueText(loan) {
  const left = loan.due - state.day;
  if (left < 0) return `${whenText(loan.due)}. ${-left} day${left === -1 ? '' : 's'} late`;
  return `${whenText(loan.due)}, ${left === 0 ? 'today' : `in ${left} day${left === 1 ? '' : 's'}`}`;
}

function loanCard(loan) {
  const behind = loan.behind || state.day > loan.due;
  const status = loan.behind ? `Behind: ${loan.missed} missed` : state.day > loan.due ? 'Past its due date' : loan.missed ? `On track (${loan.missed} missed before)` : 'On track';
  const repaid = Math.round((1 - loan.balance / loan.principal) * 100);
  return `<div class="loan">
    <div class="loan-head"><b>Loan ${loan.id}</b><span class="pill ${behind ? 'late' : 'ok'}">${status}</span>
      <button class="small" data-payoff="${loan.id}"${state.cash < loan.balance ? ' disabled title="Not enough cash to pay this off"' : ''}>Pay off ${money(loan.balance)}</button></div>
    ${row('Borrowed', `<span class="num">${money(loan.principal)} on day ${loan.day}</span>`)}
    ${row('Interest rate', `<span class="num">${rateText(loan.rate)}</span>`)}
    ${row('Daily payment', `<span class="num">${price2(Math.min(loan.payment, loan.balance))}</span>`)}
    ${row('Remaining balance', `<b class="num">${price2(loan.balance)}</b>`)}
    ${row('Due date', `<span class="${state.day > loan.due ? 'neg' : ''}">${dueText(loan)}</span>`)}
    <div class="actions-row"><label>Extra principal payment <input id="partial-loan-${loan.id}" type="number" min="0.01" step="0.01" max="${Math.max(0, Math.min(state.cash, loan.balance))}" placeholder="Amount"></label><button data-partial-loan="${loan.id}">Pay amount</button><button data-restructure-loan="${loan.id}" ${restructureQuote(loan.id).ok ? '' : 'disabled'}>Review restructuring</button></div>
    <div class="meter"><i style="width:${clamp(repaid, 0, 100)}%"></i></div>
    <p class="muted small-note" style="margin-top:0">${repaid}% paid back${loan.fees ? `, ${price2(loan.fees)} in late fees so far` : ''}.</p>
  </div>`;
}

function renderLoans() {
  const open = activeLoans(), closed = state.bank.loans.filter(l => l.status === 'paid').reverse().slice(0, 8);
  const summary = open.length
    ? `<div class="loan-total">${row('You owe', `<b class="num">${money(totalDebt())}</b>`)}${row('Payments each day', `<span class="num">${price2(loanPaymentsPerDay())}</span>`)}</div>` : '';
  const paidRows = closed.map(l => `<div class="del-row"><span class="del-main"><b>Loan ${l.id}</b><small>${money(l.principal)} borrowed on day ${l.day}</small></span>
    <span class="del-mid"><small>Paid off on day ${l.closedDay}</small><small>Cost ${price2(l.interestPaid + l.fees)} in interest and fees</small></span></div>`).join('');
  $('loans').innerHTML = `<h2>Your loans</h2>${summary}
    ${open.map(loanCard).join('') || `<div class="empty-state">${icon('coins')}<b>No loans</b>You do not owe the bank anything.</div>`}
    ${paidRows ? `<h3>Paid off</h3>${paidRows}` : ''}`;
}

function renderHistory() {
  const list = allTransactions(30, 'bank');
  $('bank-history').innerHTML = `<h2>Bank history</h2>
    <div class="tx-list">${txRows(list) || '<div class="empty-state"><b>Nothing yet</b>Loans, payments and fees will be listed here.</div>'}</div>
    <p class="muted small-note">These also appear in the transaction history on the <a href="${pageLink('finance')}">Finance page</a>, and interest and late fees count in your daily profit or loss.</p>`;
}

function renderPage() {
  renderCredit();
  renderForm();
  renderLoans();
  renderHistory();
}

// ---- Clicks ----

// What was typed is remembered, and only the offer is redrawn, so the cursor stays in the field.
const showQuote = () => { const box = document.querySelector('#loan-form .quote-box'); if (box) box.innerHTML = quoteHtml(); };
$('loan-form').addEventListener('input', e => {
  if (e.target.id === 'ln-amount') form.amount = e.target.value === '' ? NaN : Number(e.target.value);
  else if (e.target.id === 'ln-term') form.term = Number(e.target.value);
  else return;
  showQuote();
});

$('loan-form').addEventListener('change', e => {
  if (e.target.id === 'ln-term') { form.term = Number(e.target.value); showQuote(); }
});

onAction($('loan-form'), 'click', e => {
  if (e.target.id !== 'review-loan') return;
  reviewLoan();
  render(false);
});

onAction($('loans'), 'click', e => {
  const button = e.target.closest('[data-payoff]');
  if (!button) return;
  const result = gameService.payOffLoan(Number(button.dataset.payoff));
  if (result.ok) notify('The loan is paid off.');
  render(true);
});

startPage('bank', renderPage);


onAction($('loans'), 'click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.partialLoan) {
    const id = Number(b.dataset.partialLoan), r = gameService.payLoanPart(id, Number($('partial-loan-' + id).value));
    notify(r.ok ? 'Principal payment recorded. Daily payments continue; the loan finishes sooner.' : r.reason); render(true);
  } else if (b.dataset.restructureLoan) {
    const id = Number(b.dataset.restructureLoan), q = restructureQuote(id); if (!q.ok) { notify(q.reason); return; }
    openModal('Restructure loan', '<p>Extend repayment to ' + q.term + ' days at the existing fixed rate. New payment: ' + money(q.payment) + '/day. Remaining repayment: ' + price2(q.total) + ', including ' + price2(q.interest) + ' interest. A longer term can increase total interest. Past misses remain on your credit report. This option is available once per loan.</p>',
      [{ label: 'Cancel' }, { label: 'Confirm restructuring', onClick: () => { state = loadGame(); const r = gameService.restructureLoan(id, q); notify(r.ok ? 'Loan restructured.' : r.reason); } }]);
  }
});