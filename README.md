# Market Pulse

Live NIFTY 50, BANK NIFTY and SENSEX cards, plus the top 10 gainers in Nifty 50, Midcap 150 and Smallcap 250, each with the latest news headline as the "why".

No dependencies. Needs Node 18 or newer.

## Run it

```bash
npm start              # Yahoo Finance prices (delayed ~15 min) + Google News headlines
npm run dev            # offline sample data, no network needed
```

Open http://localhost:3000

## How it works

- `server.js` serves the page and three JSON endpoints: `/api/indices`, `/api/movers/{nifty|midcap|smallcap}`, `/api/health`.
- `providers/` holds the data sources. Pick one with `DATA_PROVIDER=yahoo|zerodha|mock`.
- `constituents.js` downloads the official index member lists from niftyindices.com and caches them in `data/`. If the download is blocked, save the CSVs there by hand as `nifty.csv`, `midcap.csv`, `smallcap.csv`.
- `news.js` finds the newest headline from the last 2 days per stock and tags it (Results, Order / deal, Analyst call...). It is a hint, not proof of the cause, and the page says so.

## Using Fyers (real-time, recommended on a cloud host)

1. Create an app at https://myapi.fyers.in. Set its redirect URL to `https://YOUR-APP.onrender.com/fyers/callback` (use `http://localhost:3000/fyers/callback` when testing locally).
2. Set environment variables (never commit them):
   ```
   DATA_PROVIDER=fyers
   FYERS_APP_ID=ABCD1234EF-100        # your app ID, including the -100
   FYERS_SECRET=your-secret
   FYERS_REDIRECT_URI=https://YOUR-APP.onrender.com/fyers/callback
   DASH_PASSWORD=choose-a-password    # optional, protects the whole site
   ```
3. Each trading day, open `/fyers/login` once and sign in to Fyers. The token lasts about a day. If the dashboard shows "Fyers login expired", repeat this.
4. Free Render instances lose saved files on restart, so you may need to log in again after a restart.

If niftyindices.com blocks the server from downloading the index member lists, download the three CSVs (links in `constituents.js`) and commit them to the `data` folder as `nifty.csv`, `midcap.csv`, `smallcap.csv`.

Keep the dashboard private (use `DASH_PASSWORD`): broker and exchange data terms generally don't allow redistributing real-time data to the public.

## Switching to Zerodha later

1. Get a Kite Connect app (Connect plan for market data) at https://developers.kite.trade
2. Set environment variables, never commit them:
   ```bash
   DATA_PROVIDER=zerodha KITE_API_KEY=xxxx KITE_ACCESS_TOKEN=yyyy npm start
   ```
3. The access token expires every day. Generate a new one each morning through Kite's login flow (request token, then session). A small `/login` helper can be added once you have the API key.
4. Planned upgrade: replace polling with the KiteTicker WebSocket for tick-by-tick data, and fill the index sparklines from the historical API.

## Deploy

Any Node host works (Render, Railway, Fly). Start command: `npm start`. Set `DATA_PROVIDER` and, for Zerodha, the two `KITE_*` variables in the host's environment settings.

## Notes

- The Yahoo provider uses an unofficial endpoint. It can break or rate-limit without notice, which is a good reason to move to Zerodha.
- Market open/closed is based on 9:15 to 15:30 IST on weekdays and does not know exchange holidays.
