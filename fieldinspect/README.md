# Field Inspection GIS

A React + Leaflet field inspection map backed by Google Sheets and Google Apps Script.

## Behaviour

- Reads existing WGS84 coordinates from Google Sheets: **X = longitude**, **Y = latitude**.
- Displays all valid points whose status is not `Attended`.
- Uses the phone/browser GPS location.
- Lets an officer submit attendance only when the reported GPS accuracy is 25 m or better and the officer is within 50 m of the selected point.
- Rechecks the 50 m distance on the Apps Script server before updating the sheet.
- Saves status, comments, officer, timestamp and GPS evidence.
- Removes attended points from the active map.
- Refreshes the map every 30 seconds.

## 1. Prepare your Google Sheet

The first row must contain headers. Required coordinate headers are:

- `X` = longitude (for example `35.2830`)
- `Y` = latitude (for example `-0.3670`)

A unique `Task_ID` is recommended. If it is absent, the script creates a Task_ID column and fills blank IDs. It also creates these operational columns if absent:

- `Status`
- `Officer_Comments`
- `Attended_By`
- `Attended_At`
- `Attendance_GPS_Lat`
- `Attendance_GPS_Lng`
- `GPS_Accuracy_m`

Optional display-name column: `Name`.

**Important:** Change `SHEET_NAME` in `apps-script/Code.gs` to the exact tab name in your spreadsheet. If your coordinate headings are not exactly `X` and `Y`, change `CONFIG.HEADERS.x` and `CONFIG.HEADERS.y`.

## 2. Install the Apps Script backend

1. Open the Google Sheet.
2. Select **Extensions → Apps Script**.
3. Replace the contents of `Code.gs` with `apps-script/Code.gs`.
4. Change `SHEET_NAME` to your actual sheet tab.
5. Save.
6. Select `testSetup` in the function selector and click **Run**. Approve the requested Google Sheets permissions.
7. Select **Deploy → New deployment**.
8. Select type **Web app**.
9. Set **Execute as** to **Me**.
10. Choose the narrowest access option that works for your team. If using a Google Workspace account, prefer users in your organisation. Avoid public access for sensitive customer or infrastructure coordinates.
11. Deploy and copy the Web App URL ending in `/exec`.

The Apps Script runs with the deployer's spreadsheet permissions. Restrict deployment access to the intended officers. The app's JSONP endpoint is not a substitute for a full per-user identity/role system; for a production deployment, add verified Google identity and per-officer authorization before using it with sensitive operational data.

## 3. Configure and run the React app

Install Node.js (Node 20 or later recommended), then in this project folder:

```bash
npm install
```

Open `src/config.js` and paste the deployed `/exec` URL into `API_URL`.

Start locally:

```bash
npm run dev
```

Open the local URL shown by Vite. GPS requires a secure context: `localhost` is allowed for development, but deployed sites must use HTTPS. On a phone, grant location permission and enable high-accuracy location.

Build for deployment:

```bash
npm run build
```

The production files are created in `dist/`. Deploy that folder to an HTTPS static host such as your existing Vercel project.

## 4. Coordinate and GPS rules

- The code assumes X is longitude and Y is latitude in WGS84 decimal degrees.
- Example: X `35.2830`, Y `-0.3670`.
- Do not use UTM/easting/northing values in these columns without converting them to WGS84 first.
- The browser must report GPS accuracy of 25 m or better before enabling the attendance button.
- Apps Script independently checks the reported location against the point and rejects a distance greater than 50 m.

GPS is not tamper-proof. Browser GPS values can be spoofed on some devices, so this is a practical proximity check rather than high-assurance proof of physical presence. For stronger verification, use managed devices, authenticated users and server-side identity controls.

## 5. Notes and customisation

- The app currently removes attended points from the map. The records remain in Google Sheets.
- To restore a task to the map, change its `Status` in Google Sheets to `Pending`.
- The map refreshes every 30 seconds; the Refresh button forces an immediate reload.
- The current app uses a single officer name/ID field. It is not secure identity verification.
- The `Name` field is optional; the `Task_ID` is used to update the correct record.

## Troubleshooting

**No points appear**
- Check the sheet tab name.
- Confirm `X` and `Y` are the exact header names.
- Confirm X values are longitude and Y values are latitude, in decimal degrees.
- Check that the rows contain numeric coordinates and that their status is not `Attended`.

**Apps Script request fails**
- Confirm the URL in `src/config.js` is the deployed `/exec` URL, not the editor URL.
- Redeploy after changing Apps Script code.
- Confirm deployment access permits the intended users.

**GPS does not work**
- Use HTTPS (or localhost during development).
- Allow location permission in the browser.
- Enable device location services and wait for a better GPS fix.
