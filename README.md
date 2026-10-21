# gAIn hospital deployment explorer

A buildless, GitHub Pages compatible website with three views: combined explorer,
iPad controller, and presentation screen. Open [the live website](https://mdatres.github.io/gain-hospital-explorer/).

## What is included

- Official gAIn logo, responsive layouts and touch controls.
- Hospital-count slider and numeric input from 0 to 1,841.
- Quantized versus RTX 3050 setup cost curves, intersection labels, and projections to the axes.
- Hardware-only and hardware-plus-electricity modes.
- All 16 German states, with a separate sum marker and an explicit “Use this total” action.
- Editable hardware, average power, usage hours, energy price, years and setups per hospital.
- SVG chart download including a methodology note and current inputs.
- Local same-browser synchronization and cross-device PeerJS/WebRTC pairing.
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

Defaults: quantized setup €250 and 15 W; RTX setup €750 and 130 W; one setup per
hospital; 8 h/day, 3 years, €0.30/kWh; 400 hospitals. These yield €115,768 and
€436,656 respectively. Hardware-only costs are €100,000 and €300,000.

Change permanent defaults in `model.mjs`. In-page edits are stored per room in
the browser and sent to connected screens. A fresh unpaired page starts a new
scenario. Room codes are temporary and stop working when the host closes.

## Hosting

Upload the folder contents to the root of a repository and choose **Settings →
Pages → Deploy from a branch → main → /(root)**. No build is required. Relative
asset paths support project sites such as `https://USERNAME.github.io/REPOSITORY/`.
Include `.nojekyll` if your upload method supports hidden files. These ordinary
static filenames also work through GitHub's default branch publishing.

[GitHub's publishing instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## Pairing and availability

- On the display: choose Presentation → Connect screens. Scan the QR on the iPad.
- The URL fragment carries only an ephemeral room code, not cost inputs.
- [PeerJS](https://peerjs.com/client/getting-started) 1.5.5 uses the public
  PeerServer Cloud for signalling. Scenario data is exchanged over WebRTC.
- A connection status indicates whether screens are actually connected. Keep
  both tabs awake. “Retry connection” restarts failed pairing. Rejoining gets the
  host's current scenario.
- Restrictive NAT/firewalls can prevent WebRTC connections. No managed TURN
  service, availability SLA or guaranteed institutional-network connectivity is
  included. Configure your own PeerServer and TURN server in `connectRoom()` for
  an installation requiring guaranteed connectivity; do not publish permanent
  private TURN credentials in a public repository.
- Same-browser tabs synchronize using BroadcastChannel, with storage events as
  fallback. This also works while remote signalling is unavailable.
- Anyone who has the room code can join the scenario. Do not use it for sensitive
  data. There is no patient-data field, backend database or analytics.
- Fonts are requested from Google Fonts; system sans-serif fonts are the fallback.
  The logo and JavaScript libraries are bundled locally.

## Development and verification

Serve with `python3 -m http.server 8765`; open `http://localhost:8765/`.
Use `?view=controller` or `?view=display` for a dedicated view.
Module syntax checks and `node --test model.test.mjs` require Node.js.

The model tests cover state-count reconciliation, energy conversion, hardware-only
mode, zero deployment, zero energy, setup/year scaling, cost reversals, and input
validation. See `VERIFICATION.txt` for the browser checks completed for delivery.

## Third-party components

PeerJS 1.5.5 and qrcode-generator 1.4.4 are bundled with their licenses at the repository root.
The gAIn mark is not licensed as part of those libraries.

## Using the live site

Open [Presentation](https://mdatres.github.io/gain-hospital-explorer/?view=display) on the large screen. Click **Connect screens**, wait for **Room ready**, and scan the QR code with the iPad. The iPad opens the controller and joins that room. Keep both pages open.

The static files are kept at the repository root for browser-based uploads. The logo, favicon and bundled libraries are adjacent to `index.html`; no build or installation is needed.
