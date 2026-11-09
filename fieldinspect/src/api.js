import { API_URL } from "./config";

// JSONP avoids browser CORS restrictions with Apps Script ContentService.
// Keep comments reasonably short because this sends the update as a GET request.
function jsonp(params) {
  return new Promise((resolve, reject) => {
    if (!API_URL.startsWith("https://script.google.com/")) {
      reject(new Error("Set API_URL in src/config.js to your deployed Apps Script URL."));
      return;
    }
    const callbackName = `gisCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => finish(new Error("Request timed out. Check the Apps Script deployment.")), 20000);

    function cleanup() {
      window.clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
    }
    function finish(error, data) {
      cleanup();
      error ? reject(error) : resolve(data);
    }

    window[callbackName] = (data) => {
      if (!data || data.ok !== true) {
        finish(new Error(data?.error || "The server could not complete the request."));
      } else {
        finish(null, data);
      }
    };
    const query = new URLSearchParams({ ...params, callback: callbackName });
    script.src = `${API_URL}?${query.toString()}`;
    script.onerror = () => finish(new Error("Could not reach Apps Script. Check the URL and deployment access."));
    document.body.appendChild(script);
  });
}

export async function getPoints() {
  const result = await jsonp({ action: "list" });
  return result.points || [];
}

export async function markAttended({ taskId, latitude, longitude, accuracy, officer, comments }) {
  return jsonp({
    action: "attend",
    taskId,
    gpsLat: latitude,
    gpsLng: longitude,
    gpsAccuracy: accuracy,
    officer,
    comments
  });
}