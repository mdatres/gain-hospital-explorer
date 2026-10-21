# gAIn hospital deployment explorer

A buildless, GitHub Pages compatible website with two screens: an iPad controller
and a presentation screen. The home page and legacy Explore links open the controller. Open [the live website](https://mdatres.github.io/gain-hospital-explorer/).

## What is included

- Official gAIn logo, responsive layouts and touch controls.
- Hospital-count slider and numeric input from 0 to 1,841.
- gAIn versus RTX 3050 setup cost curves, intersection labels, and projections to the axes.
- Hardware-only and hardware-plus-electricity modes.
- All 16 German states, with a separate sum marker and an explicit “Use this total” action.
- Editable hardware, average power, usage hours, energy price, years and setups per hospital.
- A single Presentation mode button and a large, uncluttered chart.
- Time-horizon slider (1–20 years), with Bayern / Sachsen / All Germany shortcuts
  and the other 14 states under More states.
- Cross-device HTTPS synchronization through a Cloudflare Worker and D1 database.
- Source and methodology panel; no analytics and no patient data.

## Data provenance

Hospital counts are transcribed from [Destatis: Krankenhäuser 2024 nach Trägern und Bundesländern](https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Gesundheit/Krankenhauser/Tabellen/eckzahlen-krankenhaeuser.html),
table dated 27 November 2025, accessed 21 October 2026. They sum to 1,841.
The unit is the statistical hospital entity, not necessarily a physical location.

The official logo is from [gAIn](https://www.futurecomputing.ai/),
asset `https://www-static.futurecomputing.ai/wp-content/uploads/2025/02/250219_gAIn_Logo_sRGB.svg?media=1749211490`.
Logo ownership remains with its rights holders.

**No measured cost or performance dataset was provided.** All initial cost and
energy inputs are explicitly illustrative and editable. In particular, the
130 W example is not claimed to be the RTX 3050 board specification or measured
whole-system draw. Quantization alone does not identify a hardware device.
Enter two consistently scoped, workload-matched setup measurements before
using the model to discuss a real deployment.

## Model

For N hospitals and U setups per hospital:

`hardware cost = N × U × hardware price per setup`

`electricity cost = N × U × average power in W / 1000 × hours/day × 365 × years × €/kWh`

Total mode adds both; hardware mode excludes electricity. Hardware is bought
once. Each curve is linear in N. Costs exclude cooling, energy outside the entered
operating hours, deployment/integration, staffing, maintenance, replacements,
financing and price changes. Tax treatment follows the input prices. Equal useful
workloads and equivalent capability are assumptions, not verified findings.

Defaults: gAIn setup €250 and 15 W; RTX setup €750 and 130 W; one setup per
hospital; 8 h/day, 3 years, €0.30/kWh; 400 hospitals. These yield €115,768 and
€436,656 respectively. Hardware-only costs are €100,000 and €300,000.

Change permanent defaults in `model.mjs`. In-page edits are stored per room in
the browser and sent to connected screens. A fresh unpaired page starts a new
scenario. Room codes expire after six hours without activity. Keep both screens online during a presentation.

## Hosting

Upload the folder contents to the root of a repository and choose **Settings →
Pages → Deploy from a branch → main → /(root)**. No build is required. Relative
asset paths support project sites such as `https://USERNAME.github.io/REPOSITORY/`.
Include `.nojekyll` if your upload method supports hidden files. These ordinary
static filenames also work through GitHub's default branch publishing.

[GitHub's publishing instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## Pairing and availability

1. Open the [presentation setup](https://mdatres.github.io/gain-hospital-explorer/?view=display&setup=1&release=6.1) on the computer.
2. Scan its fresh QR code with the iPad and leave the resulting Safari page open.
3. The iPad opens the controller in the same 16-character room. Pick 100 hospitals; the computer should update within a few seconds.
4. Close the setup dialog on the computer to show the chart.

Existing 8-character PeerJS rooms are retired. Start once with a fresh QR code
after this release. Saved new room links reconnect automatically.

Both screens use HTTPS requests to the public Cloudflare service configured in
`connection-config.mjs`. No direct WebRTC connection, TURN server, or local-only
messaging is used. Rooms store only the scenario settings and temporary device
presence. The random room link grants access to its scenario; do not use it for
sensitive data. Only a hash of the room code is stored in D1. Inactive rooms expire
after six hours and are removed on subsequent service requests.

The service confirms an update only after the other screen has read that
revision. Network failures retain the latest choices for retry, including across
reloads. Concurrent changes are applied by field, and repeated requests cannot
apply the same change twice. Keep both tabs awake and online. Cloudflare free-tier
daily usage limits apply; no paid upgrade is required for this deployment.

The deployed Worker is `gain-hospital-sync`; its D1 binding must be named `DB`.
`cloudflare-worker.mjs` is the self-contained deployment artifact and
`cloudflare-schema.sql` creates its two tables. The service URL is
https://gain-hospital-sync.datresmassimiliano.workers.dev/api/sync.
The endpoint permits this GitHub origin, its own origin, and local development.
Never add Cloudflare account credentials to the static website or repository.

Fonts are requested from Google Fonts; system fonts are the fallback.
The logo and QR-code generator are bundled locally.

## Development and verification

Serve with `python3 -m http.server 8765`; open `http://localhost:8765/`.
Use `?view=controller` or `?view=display` for a dedicated view.
Module syntax checks and `node --test model.test.mjs` require Node.js.

The model tests cover state-count reconciliation, energy conversion, hardware-only
mode, zero deployment, zero energy, setup/year scaling, cost reversals, and input
validation. See `VERIFICATION.txt` for the browser checks completed for delivery.

## Third-party components

qrcode-generator 1.4.4 is bundled with its license at the repository root. Legacy PeerJS files may remain in the repository but are no longer loaded.
The gAIn mark is not licensed as part of those libraries.

## Using the live site

Open the [presentation setup](https://mdatres.github.io/gain-hospital-explorer/?view=display&setup=1&release=6.1) on the large screen. Scan the fresh QR code with the iPad. The iPad opens the controller and joins that room. Close the setup dialog and keep both pages open. Saved paired URLs also reconnect automatically; no Connect screens button is needed.

The iPad shows four separate control cards in order: How many hospitals?, Time
horizon, Where?, and Include in the comparison. Charts, cost cards, and the source
link appear only in presentation mode. The time slider remains visible but is
disabled in hardware-only mode, where time does not affect the cost. State selections add a separate
vertical marker; **Use this total** also sets the chosen deployment count.
**Saving** is RTX 3050 cost minus gAIn cost, so a negative number means the gAIn
scenario costs more. All cost inputs remain illustrative and editable.

The static files are kept at the repository root for browser-based uploads. The logo, favicon and bundled libraries are adjacent to `index.html`; no build or installation is needed.

## Delivery checks

The model has eight unit checks. The separate backend test suite covers room
isolation, confirmed delivery, duplicate and reordered writes, simultaneous
field changes, lost responses, rapid slider changes, reload recovery, expiry,
and invalid requests. Browser checks use independent origins so local browser
storage cannot disguise a broken device connection.

The public Cloudflare service is tested for real HTTP delivery, acknowledgement,
GitHub CORS, and duplicate update handling. Physical iPad verification is recorded
separately in `VERIFICATION.txt`; automated browser success is not a claim that a
particular iPad/network has been tested.
