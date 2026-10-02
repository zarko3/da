# Plot Tycoon: guide for agents and developers

A browser property-tycoon game. Plain HTML, CSS and JavaScript. No build step, no backend, no accounts. Open `index.html` in a browser. The game is meant to go online later, so it has no speed controls and no manual "advance day": a day passes on a real-time clock.

## What the game is

The player starts with $6,000 in a world of twenty 15x15 cities. The City page shows one city at a time; players can switch cities, pan and zoom, buy several plots, build, hire workers, trade stock, move goods between buildings, take loans, pay taxes and survive inflation.

| Building | Purpose |
|---|---|
| Farm | Makes wheat, milk, fruit, coffee beans, timber. Cheapest way to start. |
| Factory | Turns crops and timber into bread, juice, snacks, artisan roast coffee, furniture. |
| Warehouse | Stores and resells goods; earns storage-contract income. |
| Shop, Cafe, Hotel | Need stock (or rooms) and serve customers. |
| Apartment | Earns rent. |
| Commercial Office | Signs lucrative corporate client service retainers. |
| Transport Depot | Trucks and drivers that carry goods between the player's own buildings. |

Districts (centre, midtown, suburbs, outskirts) set land price, traffic and fertility. Buildings have levels 1-5. Company level comes from net worth.

## Files

```
index.html  city.js      City: city selector, plot purchase, construction, inspector
world-map.js             Panning, zooming, viewport geometry and plot selection
company.html company.js  Company: owned buildings, workers, inventory, upgrades, Deliveries
market.html market.js    Market: supplier prices, buy/sell, player listings, shop prices
finance.html finance.js  Finance: daily summary, taxes, inflation, profit by building, history
bank.html   bank.js      Bank: credit score, loans, bank history
game.js                  ALL game rules and the saved state. No DOM access.
shared.js                Toolbar/nav, dashboard, alerts, dialogs, toasts, clock, cross-tab sync
style.css                One stylesheet for every page
AGENT.md                 This file
```

Backups of earlier versions (leave alone unless asked): `full-version/`, `single-page-version/`, `multi-page-before-transport/`, `multi-page-before-bank/`.

Every page loads, in order: `game.js`, `shared.js`, then its own script. They are classic scripts sharing one global scope, so top-level names must not collide. Each page script ends with `startPage(name, renderPage, { onNewGame })`.

## Architecture rules

- **Rules live in `game.js`, drawing lives elsewhere.** `game.js` must stay free of DOM code. It reports messages through `notify()` (toasts) and `log()` (Activity feed).
- **One save.** localStorage key `plot-tycoon-v3` holds a schema-versioned sparse save; runtime state expands it to all 4,500 plots. `loadGame()` migrates the original 10x10 format and the temporary 64x64 schema. `sessionStorage` (`uiGet`/`uiSet`) is only for UI memory such as the selected plot and city.
- **Handlers that change the game use `onAction(el, type, fn)`.** It re-reads the saved state first, so a page left open in another tab never overwrites newer changes. Plain `addEventListener` is fine for things that only change UI.
- **Money moves only through `earn()` / `spend()`** (per-building transactions) **or the bank functions** (`takeLoan`, `repayLoan`, `payLoans`). Every movement is recorded, which keeps the cash ledger auditable (see Invariants).
- **The clock.** `clockTick()` runs every 500 ms on every open page. A day runs only if `Date.now() - state.lastTick >= LOCAL_DEVELOPMENT_DAY_MS - 250` (4000 ms), so two open tabs do not normally advance the same day twice. `runWorldDay()` is the only function that increments the day. The `storage` event redraws a page when another tab saves.
- **Text.** UI is plain-language and calm. Follow the existing palette, small radii, underline tabs, no gradients, glows or hover transforms.

## Daily order (`runWorldDay` in `game.js`)

1. `processDeliveries()`: trucks and market orders that arrive today.
2. Production (farms, factories restock and produce).
3. Wages, maintenance, property tax.
4. Customers and rent; AI buys player listings.
5. Profit tax.
6. `payLoans()` (last, so the day's sales are in).
7. Reports: `operating` profit, then `profit = operating - loan interest - late fees`. Then `lastDay` is saved, bank history windows updated, inflation applied, supplier prices moved, `state.day++`, saved.

## Economy

- Costs: wages, maintenance (0.5% of building value per day plus a storage fee per unit), property tax (0.25% of land+building value per day), profit tax (18% of a building's positive daily profit). All scale with inflation.
- Inflation: small random daily change; wages, land, buildings and supplier prices follow it.
- `estimate()` gives the expected daily figures shown before building or hiring.

## Transport and contracts

- **Depot:** trucks = `1 + level`; each truck needs a driver (`operableTrucks`). Load per truck `40 * speed`. Trip days `1 + floor(distance / (6 * speed))`. Fuel per trip `max(3, distance * 1.5) * inflation`. Truck upkeep $6/truck/day. Storage 400.
- **Contract** (`createContract`): supplier, destination, item, quantity, delivery price, delivery time (a deadline in days, max 10). Stock leaves the supplier immediately and belongs to the delivery record (`state.deliveries`). Statuses: `pending`, `active`, `completed`, `failed`. A contract fails if no truck is free in time or the destination has no room; goods go back to the supplier.
- **Money on delivery:** the destination pays the depot the delivery price (`freight` income for the depot, `delivery` cost for the destination) and pays the supplier the goods price on arrival. Fuel is a depot cost.
- **Market orders** (`orderMarketDelivery`): AI-market and listing purchases arrive by themselves after `AI_DELIVERY_DAYS` (1) with no truck, and show as deliveries in progress. Shops and factories order tomorrow's stock today, so a new shop or factory earns nothing on its first day.
- **No double use:** stock on a delivery is not in any building's `inv`. Use `stockOf`, `incomingTo`, `freeSpace`, `inTransit`, `cargoAboard` rather than reading `inv` directly when space or availability matters.
- **History caps:** 120 finished contracts and 30 finished market orders are kept (`pruneDeliveries`), separately, so daily market orders never push contracts out.
- The Deliveries section on the Company page (`company.js`: `renderDeliveries`) shows Pending, Active, Completed, Failed.

## Bank and credit

- **State:** `state.bank = { loans, loanSeq, misses, profits, inflation, history, totals }`. A loan holds principal, rate (per 30 days), term, daily payment, balance, due day, next payment day, paid, interest paid, fees, missed count, `behind`, status (`active`/`paid`).
- **Loan quote** (`loanQuote(amount, term)`): amortised daily payment (rounded up), total repayment, interest cost, first payment (tomorrow), due date. Refuses: under $500, non-integer, unavailable period, 4 loans open, behind on a loan, score under 500, above the limit.
- **Rate** (`loanRate`): 2% base + 75% of average recent inflation over 30 days (missing days count as 0.15%) + up to 5% for a weak score, clamped to 1-15% per 30 days. Fixed when the loan is taken. `takeLoan` takes the rate the player saw and refuses if it moved.
- **Credit score** (`creditReport`): 300-850 from four parts: average daily profit (max 200 pts), payment history (250, minus 55 per miss in the last 90 days), cash (100), debt as a share of what you own (250). Ratings: Poor under 500, Fair under 620, Good under 740, Very good under 800, Excellent.
- **Limit** (`loanLimit`): total debt is kept under a share of what you own (30% at the lowest score up to 100% at the highest).
- **Daily payment** (`payLoans`): enough cash means principal and interest are paid. Not enough cash means the payment is missed: late fee (5% of the payment, at least $10 x inflation), unpaid interest is added to the balance, the miss is recorded (lowers the score), the loan carries on. Nothing is ever deleted and cash may go negative.
- **Accounting:** interest and late fees count as costs in daily profit or loss (`lastDay.interest`, `lastDay.lateFees`); principal repayment does not (`lastDay.principal`). Net worth subtracts total debt. Bank transactions have their own history (`loanIn`, `loanPayment`, `lateFee`) and appear in Finance history under "The bank". The Finance "Profit by building" table has a Bank row so totals match the daily summary.
## Perks, milestones, and city events

- **Company Perks:** Enterprise upgrades unlocked on the Company page (Fleet Logistics, Bulk Procurement, Targeted Marketing, Staff Academy, Solar & Clean Tech, Corporate Network). Unlocking charges capital and applies persistent business modifiers.
- **Milestones & Grants:** Goal milestones evaluated each day. Reaching targets awards one-time monetary grants directly to the company cash ledger with celebratory notifications.
- **City Events:** Dynamic economic occurrences that cycle periodically across the 20 cities (Economic Boom, Bumper Harvest, Cultural Tourism, Urban Redevelopment, Trade Expo). Modifies local yields, traffic, and demands for the duration of the event.

## Invariants to preserve

Cash ledger:

```
cash = 6000 + grants
     + sum over plots of (sale + rent + freight - purchase - wages - hiring - maintenance
                          - delivery - propertyTax - profitTax - capital)
     + bank.totals.borrowed - principal - interest - fees
```

Also: stock is never negative or fractional; a building never exceeds its capacity (stock plus incoming); a finished delivery holds no cargo; a completed delivery delivered something; a paid loan owes 0 and an active loan owes more than 0; credit score stays within 300-850. Stock on an active delivery exists in exactly one place.

## Adding things safely

1. Put the rule in `game.js`; add defaults in `newGame()` and `loadGame()`.
2. Money changes go through `earn`/`spend` (or a bank function) so history and totals stay right. New transaction types need an entry in `TX_LABEL`, and a decision on whether they are income (`INCOME_TYPES`) or a cost, and whether they count in `profitOf`/`dayCosts`.
3. New page: copy an existing `*.html`, add it to `PAGES` in `shared.js` (the nav is built from that list), add a `<page>.js` that ends with `startPage(...)`.
4. State-changing UI handlers use `onAction`. Inputs inside panels are protected from the 500 ms redraw by `isEditing()`; for live forms update only the changed part (see `showQuote` in `bank.js`) rather than the whole page.
5. Keep saves compatible. Never rename or remove a saved field without migrating it in `loadGame()`.

## Working on this codebase (gotchas)

- **Encoding.** Files are UTF-8 without BOM. The only non-ASCII characters are `· → … ▲ ▼` (and `game.js`/`bank.js` have none). Windows PowerShell 5.1 `Get-Content`/`Set-Content` re-encodes and produces mojibake like `Â·`. Edit with the editor tools, or with Node using `fs.readFileSync(f, 'utf8')`. In HTML use `&middot;` for the middle dot.
- **Bulk patches.** Anchor-based Node scripts (replace an exact, unique string, fail if it is missing or repeated) worked well. Do not push JS through PowerShell quoting; it mangles backticks and `$`.
- **Backtick strings** are common in the UI code; watch `$${...}` (a literal dollar sign followed by an interpolation).
- **Check rendering, not just logic.** A screenshot found a "228742% of what you own" display bug that logic tests missed.

## Testing

Tests are not stored in the project. They lived in the session scratchpad and can be rebuilt. The approach, worth repeating:

- A **Node `vm` harness** loads a page's HTML ids, `game.js`, `shared.js` and the page script against a stubbed DOM, with a shared fake localStorage so several "tabs" can run at once, plus a seedable `Math.random` and controllable clock. Clicks are simulated by calling captured handlers. Tests call game functions directly (`advanceDay()`, `createContract()`, `takeLoan()`).
- **Stress runs:** 90 game days of random actions across several seeds, auditing the invariants above every day (about 1,600 contracts, about 40% failing, and loans with many missed payments).
- **Real browser end-to-end:** headless Edge driven over the Chrome DevTools Protocol (`--remote-debugging-port`, `--allow-file-access-from-files`). It uses the real forms and the real clock, opens a second tab to check sync, captures screenshots, and fails on any script error.

Last known results: 112 multi-page checks, 131 transport checks, 95 bank checks, 9 stress checks, and 22, 18 and 18 real-browser checks, all passing. Firefox has not been tried.

## Online multiplayer (Cloudflare)

- `npm run dev` / `npm run deploy` run `scripts/build.js` (copies browser files to `public/`, wraps `game.js` into generated `worker/game-core.js`), then wrangler. `public/` and `worker/game-core.js` are generated; edit the source files.
- `worker/index.js` routes `/api/*` to one `World` Durable Object (`worker/world.js`, SQLite-backed). It holds accounts (PBKDF2 passwords, bearer sessions), every player's save, the shared world fields (`day, inflation, inflationRate, market, events`) and the plot owner map.
- Actions: `POST /api/action {method, args}` runs the same `gameService` method on that player's save; only `LocalGameService` methods other than getters/`runWorldDay`/`checkMilestones` are allowed. Plot ownership is enforced in the server (`buyPlot(s)` refused if another player owns it); company names are unique.
- The clock is a Durable Object alarm every `DAY_MS` (env var, default 3,600,000 = 1 hour). `tick()` works out the shared fields once on a ghost company, then runs each player's `runWorldDay` against the same pre-tick prices and gives everyone the same new ones.
- Browser: `net.js` (loaded after `game.js`, before `shared.js`) wraps the mutating `gameService` methods: run locally for instant feedback, queue to the server, then replace the local save (`SAVE_KEY`) with the server snapshot. It polls `/api/snapshot` every 3 s and disables the local clock. `file://` stays single player. `login.html`/`login.js` sign in or register.
- **Player-to-player trading:** each company's `state.listings` stay its own. The server publishes everyone else's offers (`offersFor`, with `avail` = what the seller really holds) in `snapshot().online.listings`; `hydrateGame` turns them into `state.rivalListings` (and an empty `state.rivalSales`), neither is ever saved. `buyInventory` treats them as offers: the buyer pays and gets a market delivery, and the sale is pushed to `rivalSales`. After the action the server calls `settleRivalSale` on each seller's company (goods leave, money arrives). Market page lists them under "other players".
- Cloudflare serves `login.html` at `/login` and `index.html` at `/`; page checks in `net.js` must accept both.
- Manual checks (not in `npm test`), all against `wrangler dev --var DAY_MS:5000`: `tests/online-smoke.js` (accounts, land, clock), `tests/online-trade-smoke.js` (two players trade), `tests/browser-online-cdp.js` (real Edge/Chrome: login, sync, sign out). If wrangler is killed hard its local state under `.wrangler/state` can corrupt; stop every `workerd`/wrangler process, delete that folder and restart.
- Not shared yet: supplier stock (each company sees its own), AI buyers (each company draws its own daily pool), rivals' buildings are hidden (only "owned by X" shows).

## Known limits

- Offline (file://) play is single player with one save in one browser.
- Old saves get an empty deliveries list and empty bank; existing shops and factories see a one-day restock gap once after the transport update.
- Loan payments are all-or-nothing (no partial payments); rates are quoted per 30 game days, not per year.
- Cash can go negative (wages, late fees); there is no bankruptcy or game over. Recovery options include closure, sales, partial principal payments, and loan restructuring.


## Business management additions
- Company includes business health, customer contracts, and empty-land sales. City inspector and building overview show reviewed sales.
- Customer offers refresh every five days; up to three active orders consume assigned inventory after production, before other sales. Unit payments use sale income and bonuses use rent income. Completion/failure/cancellation affect reputation; finished history is capped at 30.
- Property sales pay 80% land, 70% building value, and wholesale stock liquidation. capitalSale is cash income, excluded from operating profit. Plot ledgers survive disposal and repurchase. Outstanding deliveries and active customer contracts block sale/closure.
- Closed buildings retain staff/inventory, pause wages and operations, and pay 25% maintenance plus full property tax. Listings are removed on closure.
- Partial loan payments reduce principal, preserving daily instalments. Each distressed loan can be restructured once at its existing fixed rate; credit misses remain.
- Cash ledger includes + sum(plot.totals.capitalSale). Tests are stored under tests/; run node --test tests/*.test.js.
