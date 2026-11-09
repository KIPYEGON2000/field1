/**
 * Field Inspection GIS - Google Apps Script backend
 *
 * Setup:
 * 1. Open the Google Sheet that contains your X/Y coordinates.
 * 2. Extensions > Apps Script. Paste this file into Code.gs.
 * 3. Set SHEET_NAME below to the exact tab name.
 * 4. Deploy as a Web app. Execute as: Me.
 *
 * Coordinate convention: X = longitude, Y = latitude (WGS84).
 */
const CONFIG = {
  SHEET_NAME: "Form Responses 1",
  HEADER_ROW: 1,
  MAX_DISTANCE_METRES: 50,
  MAX_GPS_ACCURACY_METRES: 25,
  // Change these if your column headings differ.
  HEADERS: {
    x: "X",
    y: "Y",
    taskId: "Task_ID",
    name: "Name",
    status: "Status",
    comments: "Officer_Comments",
    officer: "Attended_By",
    attendedAt: "Attended_At",
    gpsLat: "Attendance_GPS_Lat",
    gpsLng: "Attendance_GPS_Lng",
    gpsAccuracy: "GPS_Accuracy_m"
  }
};

function doGet(e) {
  const params = (e && e.parameter) || {};
  const callback = String(params.callback || "");
  try {
    let result;
    if (params.action === "list") {
      result = { ok: true, points: listPoints_() };
    } else if (params.action === "attend") {
      result = attendPoint_(params);
    } else {
      throw new Error("Unknown action.");
    }
    return respond_(result, callback);
  } catch (err) {
    return respond_({ ok: false, error: err.message || String(err) }, callback);
  }
}

function respond_(data, callback) {
  const json = JSON.stringify(data);
  if (callback && /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) {
    return ContentService.createTextOutput(callback + "(" + json + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) throw new Error('Sheet tab "' + CONFIG.SHEET_NAME + '" was not found.');
  return sheet;
}

function headerMap_(sheet) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(CONFIG.HEADER_ROW, 1, 1, lastCol).getDisplayValues()[0];
  const map = {};
  headers.forEach((h, i) => { if (h) map[String(h).trim().toLowerCase()] = i + 1; });

  // Add operational columns when missing. X and Y must already exist.
  const required = [
    CONFIG.HEADERS.taskId, CONFIG.HEADERS.status, CONFIG.HEADERS.comments,
    CONFIG.HEADERS.officer, CONFIG.HEADERS.attendedAt, CONFIG.HEADERS.gpsLat,
    CONFIG.HEADERS.gpsLng, CONFIG.HEADERS.gpsAccuracy
  ];
  required.forEach(name => {
    if (!map[name.toLowerCase()]) {
      const col = sheet.getLastColumn() + 1;
      sheet.getRange(CONFIG.HEADER_ROW, col).setValue(name);
      map[name.toLowerCase()] = col;
    }
  });

  const xCol = map[CONFIG.HEADERS.x.toLowerCase()];
  const yCol = map[CONFIG.HEADERS.y.toLowerCase()];
  if (!xCol || !yCol) throw new Error('Could not find X and Y headers. Check CONFIG.HEADERS.');
  return map;
}

function listPoints_() {
  const sheet = getSheet_();
  const map = headerMap_(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow <= CONFIG.HEADER_ROW) return [];
  const values = sheet.getRange(CONFIG.HEADER_ROW + 1, 1, lastRow - CONFIG.HEADER_ROW, sheet.getLastColumn()).getValues();

  const xCol = map[CONFIG.HEADERS.x.toLowerCase()] - 1;
  const yCol = map[CONFIG.HEADERS.y.toLowerCase()] - 1;
  const idCol = map[CONFIG.HEADERS.taskId.toLowerCase()] - 1;
  const statusCol = map[CONFIG.HEADERS.status.toLowerCase()] - 1;
  const nameCol = map[CONFIG.HEADERS.name.toLowerCase()] ? map[CONFIG.HEADERS.name.toLowerCase()] - 1 : -1;

  const output = [];
  values.forEach((row, i) => {
    const x = Number(row[xCol]); // longitude
    const y = Number(row[yCol]); // latitude
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 180 || Math.abs(y) > 90) return;

    let taskId = row[idCol];
    if (!taskId) {
      taskId = "TASK-" + String(i + 1).padStart(6, "0");
      sheet.getRange(CONFIG.HEADER_ROW + 1 + i, idCol + 1).setValue(taskId);
    }
    const status = String(row[statusCol] || "Pending").trim();
    output.push({
      taskId: String(taskId),
      x, y,
      status,
      name: nameCol >= 0 ? String(row[nameCol] || "") : ""
    });
  });
  return output;
}

function attendPoint_(p) {
  const taskId = String(p.taskId || "").trim();
  const officer = String(p.officer || "").trim();
  const comments = String(p.comments || "").trim();
  const gpsLat = Number(p.gpsLat);
  const gpsLng = Number(p.gpsLng);
  const accuracy = Number(p.gpsAccuracy);

  if (!taskId) throw new Error("Missing task ID.");
  if (!officer) throw new Error("Enter the officer name or ID.");
  if (!Number.isFinite(gpsLat) || !Number.isFinite(gpsLng) ||
      Math.abs(gpsLat) > 90 || Math.abs(gpsLng) > 180) {
    throw new Error("Invalid GPS coordinates received.");
  }
  if (!Number.isFinite(accuracy) || accuracy > CONFIG.MAX_GPS_ACCURACY_METRES) {
    throw new Error("GPS accuracy must be " + CONFIG.MAX_GPS_ACCURACY_METRES + " metres or better.");
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheet_();
    const map = headerMap_(sheet);
    const idCol = map[CONFIG.HEADERS.taskId.toLowerCase()];
    const statusCol = map[CONFIG.HEADERS.status.toLowerCase()];
    const xCol = map[CONFIG.HEADERS.x.toLowerCase()];
    const yCol = map[CONFIG.HEADERS.y.toLowerCase()];
    const lastRow = sheet.getLastRow();
    if (lastRow <= CONFIG.HEADER_ROW) throw new Error("No task rows found.");

    const ids = sheet.getRange(CONFIG.HEADER_ROW + 1, idCol, lastRow - CONFIG.HEADER_ROW, 1).getDisplayValues();
    let targetRow = -1;
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]).trim() === taskId) {
        targetRow = CONFIG.HEADER_ROW + 1 + i;
        break;
      }
    }
    if (targetRow < 0) throw new Error("Task not found. Refresh the map.");
    const currentStatus = String(sheet.getRange(targetRow, statusCol).getValue() || "Pending").trim().toLowerCase();
    if (currentStatus === "attended") throw new Error("This task has already been attended.");

    const pointX = Number(sheet.getRange(targetRow, xCol).getValue());
    const pointY = Number(sheet.getRange(targetRow, yCol).getValue());
    const distance = haversine_(gpsLat, gpsLng, pointY, pointX);
    if (distance > CONFIG.MAX_DISTANCE_METRES) {
      throw new Error("Attendance denied. You are " + Math.round(distance) + " metres away; the limit is 50 metres.");
    }

    const now = new Date();
    sheet.getRange(targetRow, statusCol).setValue("Attended");
    sheet.getRange(targetRow, map[CONFIG.HEADERS.comments.toLowerCase()]).setValue(comments);
    sheet.getRange(targetRow, map[CONFIG.HEADERS.officer.toLowerCase()]).setValue(officer);
    sheet.getRange(targetRow, map[CONFIG.HEADERS.attendedAt.toLowerCase()]).setValue(now);
    sheet.getRange(targetRow, map[CONFIG.HEADERS.gpsLat.toLowerCase()]).setValue(gpsLat);
    sheet.getRange(targetRow, map[CONFIG.HEADERS.gpsLng.toLowerCase()]).setValue(gpsLng);
    sheet.getRange(targetRow, map[CONFIG.HEADERS.gpsAccuracy.toLowerCase()]).setValue(accuracy);

    return { ok: true, taskId, status: "Attended", distanceMetres: Math.round(distance) };
  } finally {
    lock.releaseLock();
  }
}

function haversine_(lat1, lon1, lat2, lon2) {
  const toRad = d => d * Math.PI / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Run this once from the Apps Script editor to authorize and check the sheet setup.
function testSetup() {
  const sheet = getSheet_();
  const map = headerMap_(sheet);
  Logger.log("Connected to " + sheet.getName() + ". Header columns: " + JSON.stringify(map));
}