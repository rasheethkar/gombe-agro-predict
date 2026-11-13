# Gombe Agro Predict

Gombe Agro Predict is a React prototype that presents NASA POWER daily gridded weather and soil-moisture estimates for Gombe State. It pairs those estimates with a simple crop-and-soil readiness indicator. It is an informational MVP, not a farm-level measurement system or a substitute for local agricultural advice.

## What it does

- Shows NASA POWER data for the 11 Gombe LGAs, with an option to use the device's GPS coordinates.
- Displays topsoil moisture, root-zone moisture, air temperature, a seven-calendar-day rainfall total, and a soil-moisture trend.
- Provides an experimental readiness score for sorghum, millet, maize, and cotton, with loam, clay, and sandy soil adjustments.
- Offers English and Hausa interface text.
- Saves successful NASA POWER API responses in browser local storage. If a request fails, the app uses the last saved report for the selected LGA or GPS coordinates and identifies it as offline data.
- Displays a formatted SMS alert preview. The preview does not send an SMS. The separate WhatsApp link opens a message draft in WhatsApp.

## Data source and limitations

The app requests daily data from the [NASA POWER API](https://power.larc.nasa.gov/docs/services/api/temporal/daily/). These are **NASA POWER Daily Gridded Estimates**, not direct observations from a user's farm. Recent data may have an approximately four-day processing lag. Rainfall totals cover the available valid days in the requested seven-day window; the card reports how many valid days contributed.

The crop readiness calculation is an experimental moisture-based heuristic. It has not been validated for local field conditions and is awaiting calibration with Gombe agricultural extension officers. Do not rely on it alone to make planting decisions.

Cached reports are stored in the browser's local storage on the current device and browser. They may be outdated, and clearing browser storage removes them.

## Run locally

Requirements: Node.js and npm.

```bash
npm install
npm run dev
```

Vite prints a local URL after the development server starts. NASA POWER data requires an internet connection unless a report for the selected location is already cached.

## Available scripts

```bash
npm run dev      # Start the Vite development server
npm run lint     # Run ESLint
npm run build    # Create a production build in dist/
npm run preview  # Preview the production build locally
```
