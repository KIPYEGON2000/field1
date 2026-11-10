import React, {
  useEffect,
  useState,
  useRef
} from "react";

import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap
} from "react-leaflet";

import L from "leaflet";

import {
  API_URL,
  DEFAULT_MAP_CENTER,
  MAX_GPS_ACCURACY_METRES
} from "./config";

import { getPoints } from "./api";


// --------------------------------------------------
// MAP MARKERS
// --------------------------------------------------

function markerIcon(color) {
  return L.divIcon({
    className: "custom-marker",
    html: `<span style="background:${color}"></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  });
}

const pendingIcon =
  markerIcon("#dc3545");

const userIcon =
  L.divIcon({
    className: "user-marker",
    html: "<span></span>",
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  });


// --------------------------------------------------
// INSPECTION OPTIONS
// --------------------------------------------------

const NATURE_OPTIONS = [
  "Revenue",
  "Meter replacement",
  "Smart meter reading",
  "inspection"
];


// Dynamic Recommended Actions

const ACTION_OPTIONS_BY_NATURE = {

  Revenue: [
    "meter not on site",
    "collected",
    "disconnected",
    "locked"
  ],

  "Meter replacement": [
    "found okay",
    "locked",
    "meter not on site",
    "bypassed"
  ],

  inspection: [
    "found okay",
    "locked",
    "meter not on site",
    "bypassed"
  ],

  "Smart meter reading": [
    "found okay",
    "no network bars",
    "bypassed",
    "meter not on site",
    "locked"
  ]
};


// --------------------------------------------------
// JSONP CONNECTION TO GOOGLE APPS SCRIPT
// --------------------------------------------------

function callAppsScript(params) {

  return new Promise(
    (resolve, reject) => {

      if (
        !API_URL ||
        API_URL.includes("PASTE_")
      ) {

        reject(
          new Error(
            "Configure your Apps Script URL in src/config.js."
          )
        );

        return;
      }


      const callbackName =
        "fieldInspectionCallback_" +
        Date.now() +
        "_" +
        Math.random()
          .toString(36)
          .substring(2);


      const script =
        document.createElement(
          "script"
        );


      const url =
        new URL(API_URL);


      url.search =
        new URLSearchParams({
          ...params,
          callback:
            callbackName
        }).toString();


      let timeout;


      const cleanup = () => {

        delete window[
          callbackName
        ];

        script.remove();

        clearTimeout(
          timeout
        );
      };


      window[callbackName] =
        (response) => {

          cleanup();

          if (!response) {

            reject(
              new Error(
                "No response received from Google Apps Script."
              )
            );

            return;
          }


          if (
            response.success === false ||
            response.ok === false ||
            response.error
          ) {

            reject(
              new Error(
                response.error ||
                response.message ||
                "Request failed."
              )
            );

            return;
          }


          resolve(
            response
          );
        };


      script.onerror = () => {

        cleanup();

        reject(
          new Error(
            "Could not connect to Google Apps Script. " +
            "Check the URL and deployment access."
          )
        );
      };


      timeout =
        setTimeout(
          () => {

            cleanup();

            reject(
              new Error(
                "Request timed out. Check your internet connection."
              )
            );

          },
          20000
        );


      script.src =
        url.toString();


      document.body.appendChild(
        script
      );
    }
  );
}


// --------------------------------------------------
// RECENTER MAP ON FIRST GPS LOCATION
// --------------------------------------------------

function Recenter({ position }) {

  const map =
    useMap();

  const hasCentered =
    useRef(false);


  useEffect(() => {

    if (
      position &&
      !hasCentered.current
    ) {

      map.setView(
        position,
        16
      );

      hasCentered.current =
        true;
    }

  }, [
    position,
    map
  ]);


  return null;
}


// --------------------------------------------------
// LOCATE OFFICER BUTTON
// --------------------------------------------------

function LocateOfficer({
  position
}) {

  const map =
    useMap();


  function locate() {

    if (!position) {

      alert(
        "Waiting for GPS location. Please enable location access."
      );

      return;
    }


    map.flyTo(
      position,
      17,
      {
        animate: true,
        duration: 1.5
      }
    );
  }


  return (

    <button
      type="button"
      className="locate-button"
      onClick={locate}
      disabled={!position}
      title="Zoom to my current location"
    >
      📍 My Location
    </button>
  );
}


// --------------------------------------------------
// MAIN APP
// --------------------------------------------------

export default function App() {


  // ----------------------------------------------
  // MAP DATA
  // ----------------------------------------------

  const [
    points,
    setPoints
  ] =
    useState([]);


  const [
    position,
    setPosition
  ] =
    useState(null);


  const [
    accuracy,
    setAccuracy
  ] =
    useState(null);


  const [
    selected,
    setSelected
  ] =
    useState(null);


  // ----------------------------------------------
  // OFFICERS
  // ----------------------------------------------

  const [
    officers,
    setOfficers
  ] =
    useState([]);


  const [
    officer,
    setOfficer
  ] =
    useState(
      localStorage.getItem(
        "fieldOfficer"
      ) || ""
    );


  // ----------------------------------------------
  // INSPECTION FORM
  // ----------------------------------------------

  const [
    natureOfWork,
    setNatureOfWork
  ] =
    useState("");


  const [
    inspection1,
    setInspection1
  ] =
    useState("");


  const [
    inspection2,
    setInspection2
  ] =
    useState("");


  const [
    inspection3,
    setInspection3
  ] =
    useState("");


  const [
    inspection4,
    setInspection4
  ] =
    useState("");


  const [
    inspection5,
    setInspection5
  ] =
    useState("");


  const [
    actions,
    setActions
  ] =
    useState([]);


  const [
    comments,
    setComments
  ] =
    useState("");


  // ----------------------------------------------
  // APP STATUS
  // ----------------------------------------------

  const [
    loading,
    setLoading
  ] =
    useState(true);


  const [
    saving,
    setSaving
  ] =
    useState(false);


  const [
    loadingOfficers,
    setLoadingOfficers
  ] =
    useState(true);


  const [
    error,
    setError
  ] =
    useState("");


  const [
    notice,
    setNotice
  ] =
    useState("");


  const [
    lastRefresh,
    setLastRefresh
  ] =
    useState(null);


  // ----------------------------------------------
  // DYNAMIC OPTIONS
  // ----------------------------------------------

  const availableActions =
    ACTION_OPTIONS_BY_NATURE[
      natureOfWork
    ] || [];


  const isSmartMeterReading =
    natureOfWork ===
    "Smart meter reading";


  // ----------------------------------------------
  // LOAD INSPECTION POINTS
  // ----------------------------------------------

  async function refresh() {

    try {

      const rows =
        await getPoints();


      // Only show pending points

      setPoints(
        rows.filter(
          (point) =>
            String(
              point.status || ""
            )
              .trim()
              .toLowerCase() !==
            "attended"
        )
      );


      setLastRefresh(
        new Date()
      );


      setError("");

    } catch (e) {

      setError(
        e.message
      );

    } finally {

      setLoading(
        false
      );
    }
  }


  useEffect(() => {

    refresh();


    const id =
      window.setInterval(
        refresh,
        30000
      );


    return () =>
      window.clearInterval(
        id
      );

  }, []);


  // ----------------------------------------------
  // LOAD OFFICERS
  // ----------------------------------------------

  async function loadOfficers() {

    try {

      setLoadingOfficers(
        true
      );


      const response =
        await callAppsScript({
          action:
            "officers"
        });


      const names =
        response.officers ||
        response.data ||
        [];


      setOfficers(
        names
          .map(
            (item) =>
              typeof item ===
              "string"
                ? item
                : (
                    item.name ||
                    item.officerName ||
                    item.officer_name
                  )
          )
          .filter(Boolean)
      );

    } catch (e) {

      setError(
        `Could not load officers: ${e.message}`
      );

    } finally {

      setLoadingOfficers(
        false
      );
    }
  }


  useEffect(() => {

    loadOfficers();

  }, []);


  // ----------------------------------------------
  // TRACK GPS LOCATION
  // ----------------------------------------------

  useEffect(() => {

    if (
      !navigator.geolocation
    ) {

      setError(
        "This browser does not support GPS location."
      );

      return;
    }


    const watchId =
      navigator.geolocation.watchPosition(

        (p) => {

          setPosition([
            p.coords.latitude,
            p.coords.longitude
          ]);


          setAccuracy(
            p.coords.accuracy
          );
        },


        (e) =>
          setError(
            `GPS error: ${e.message}. ` +
            "Allow location access and use HTTPS."
          ),


        {
          enableHighAccuracy:
            true,

          maximumAge:
            5000,

          timeout:
            20000
        }
      );


    return () =>
      navigator.geolocation.clearWatch(
        watchId
      );

  }, []);


  // ----------------------------------------------
  // GPS ACCURACY
  // ----------------------------------------------

  const gpsAccurate =
    accuracy !== null &&
    accuracy <=
      MAX_GPS_ACCURACY_METRES;


  const mapCenter =
    position ||
    DEFAULT_MAP_CENTER;


  // ----------------------------------------------
  // RESET INSPECTION FORM
  // ----------------------------------------------

  function resetInspectionForm() {

    setNatureOfWork("");

    setInspection1("");
    setInspection2("");
    setInspection3("");
    setInspection4("");
    setInspection5("");

    setActions([]);

    setComments("");
  }


  // ----------------------------------------------
  // OPEN POINT
  // ----------------------------------------------

  function openPoint(point) {

    setSelected(
      point
    );

    resetInspectionForm();

    setNotice("");

    setError("");
  }


  // ----------------------------------------------
  // HANDLE NATURE OF WORK CHANGE
  // ----------------------------------------------

  function handleNatureChange(value) {

    setNatureOfWork(
      value
    );


    // Clear selected actions when
    // Nature of Work changes

    setActions([]);


    // Clear smart meter readings
    // if user changes to another type

    if (
      value !==
      "Smart meter reading"
    ) {

      setInspection1("");
      setInspection2("");
      setInspection3("");
      setInspection4("");
      setInspection5("");
    }
  }


  // ----------------------------------------------
  // ACTION CHECKBOX HANDLER
  // ----------------------------------------------

  function handleActionChange(action) {

    setActions(
      (current) =>

        current.includes(action)

          ? current.filter(
              (item) =>
                item !== action
            )

          : [
              ...current,
              action
            ]
    );
  }


  // ----------------------------------------------
  // SAVE INSPECTION
  // ----------------------------------------------

  async function saveAttendance() {

    if (
      !selected ||
      !position ||
      !gpsAccurate ||
      !officer.trim()
    ) {
      return;
    }


    if (!natureOfWork) {

      setError(
        "Please select the Nature of Work."
      );

      return;
    }


    if (
      actions.length === 0
    ) {

      setError(
        "Please select at least one recommended action."
      );

      return;
    }


    setSaving(
      true
    );

    setError("");

    setNotice("");


    try {

      localStorage.setItem(
        "fieldOfficer",
        officer.trim()
      );


      await callAppsScript({

        action:
          "attend",


        taskId:
          selected.taskId,


        officer:
          officer.trim(),


        natureOfWork,


        inspection1:
          inspection1.trim(),


        inspection2:
          inspection2.trim(),


        inspection3:
          inspection3.trim(),


        inspection4:
          inspection4.trim(),


        inspection5:
          inspection5.trim(),


        actions:
          actions.join(","),


        comments:
          comments.trim(),


        gpsLat:
          String(
            position[0]
          ),


        gpsLng:
          String(
            position[1]
          ),


        gpsAccuracy:
          String(
            accuracy
          )
      });


      const completedTask =
        selected.taskId;


      // Immediately remove point from map

      setPoints(
        (current) =>
          current.filter(
            (point) =>
              point.taskId !==
              completedTask
          )
      );


      setSelected(
        null
      );


      resetInspectionForm();


      setNotice(
        `Task ${completedTask} successfully marked as attended.`
      );


      // Refresh from Google Sheets

      await refresh();

    } catch (e) {

      setError(
        e.message
      );

    } finally {

      setSaving(
        false
      );
    }
  }


  // ----------------------------------------------
  // GOOGLE MAPS DIRECTIONS
  // ----------------------------------------------

  const directionsUrl =
    selected
      ? `https://www.google.com/maps/dir/?api=1&destination=${selected.y},${selected.x}&travelmode=walking`
      : null;


  // ----------------------------------------------
  // USER INTERFACE
  // ----------------------------------------------

  return (

    <main className="app-shell">


      {/* HEADER */}

      <header className="topbar">

        <div>

          <div className="eyebrow">
            FIELD OPERATIONS
          </div>


          <h1>
            Inspection Map
          </h1>


          <p>
            Select an assigned point and record inspection details.
          </p>

        </div>


        <button
          className="refresh"
          onClick={refresh}
        >
          ↻ Refresh
        </button>

      </header>


      {/* SUMMARY */}

      <section className="summary">

        <div className="metric">

          <strong>
            {points.length}
          </strong>

          <span>
            Active points
          </span>

        </div>


        <div className="metric">

          <strong>
            {position
              ? "GPS on"
              : "Waiting"}
          </strong>

          <span>
            Officer location
          </span>

        </div>


        <div className="metric">

          <strong>
            {accuracy == null
              ? "—"
              : `${Math.round(
                  accuracy
                )} m`}
          </strong>

          <span>
            GPS accuracy
          </span>

        </div>

      </section>


      {/* ALERTS */}

      {error && (

        <div className="alert error">
          {error}
        </div>

      )}


      {notice && (

        <div className="alert success">
          {notice}
        </div>

      )}


      {API_URL.includes(
        "PASTE_"
      ) && (

        <div className="alert warning">

          Configure the Apps Script URL in{" "}

          <code>
            src/config.js
          </code>

          {" "}before using the map.

        </div>

      )}


      {/* MAP */}

      <section className="map-wrap">

        <MapContainer
          center={mapCenter}
          zoom={13}
          scrollWheelZoom={true}
        >

          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />


          <Recenter
            position={position}
          />


          <LocateOfficer
            position={position}
          />


          {/* USER LOCATION */}

          {position && (

            <Marker
              position={position}
              icon={userIcon}
            >

              <Popup>

                <b>
                  Your current location
                </b>

                <br />

                GPS accuracy:{" "}

                {Math.round(
                  accuracy || 0
                )}{" "}
                m

              </Popup>

            </Marker>

          )}


          {/* INSPECTION POINTS */}

          {points.map(
            (point) => (

              <Marker
                key={point.taskId}
                position={[
                  point.y,
                  point.x
                ]}
                icon={pendingIcon}
                eventHandlers={{
                  click: () =>
                    openPoint(point)
                }}
              >

                <Popup>

                  <b>
                    {point.taskId}
                  </b>

                  <br />

                  {point.name ||
                    "Inspection point"}

                  <br />

                  <button
                    className="popup-button"
                    onClick={() =>
                      openPoint(point)
                    }
                  >
                    View task
                  </button>

                </Popup>

              </Marker>

            )
          )}

        </MapContainer>


        {/* MAP LEGEND */}

        <div className="legend">

          <span>

            <i className="dot red"></i>

            {" "}Pending

          </span>


          <span>

            <i className="dot blue"></i>

            {" "}Your location

          </span>

        </div>

      </section>


      {/* INSPECTION FORM */}

      <section className="bottom-panel">


        <div className="panel-heading">

          <div>

            <h2>

              {selected
                ? `Task ${selected.taskId}`
                : "Selected inspection"}

            </h2>


            <p>

              {selected
                ? (
                    selected.name ||
                    "Inspection location"
                  )
                : (
                    "Select a red marker on the map to view its details."
                  )}

            </p>

          </div>


          {selected && (

            <button
              className="close"
              onClick={() => {

                setSelected(null);

                resetInspectionForm();

              }}
            >
              ×
            </button>

          )}

        </div>


        {selected ? (

          <>


            {/* LOCATION DETAILS */}

            <div className="details-grid">

              <div>

                <small>
                  Longitude (X)
                </small>

                <b>
                  {selected.x}
                </b>

              </div>


              <div>

                <small>
                  Latitude (Y)
                </small>

                <b>
                  {selected.y}
                </b>

              </div>


              <div>

                <small>
                  GPS accuracy
                </small>

                <b>

                  {accuracy == null
                    ? "—"
                    : `${Math.round(
                        accuracy
                      )} m`}

                </b>

              </div>

            </div>


            {/* DIRECTIONS */}

            <a
              className="directions"
              href={directionsUrl}
              target="_blank"
              rel="noreferrer"
            >
              ↗ Navigate with Google Maps
            </a>


            {/* OFFICER */}

            <label
              className="field-label"
              htmlFor="officer"
            >
              Officer name
            </label>


            <select
              id="officer"
              value={officer}
              onChange={(e) =>
                setOfficer(
                  e.target.value
                )
              }
              disabled={
                loadingOfficers
              }
            >

              <option value="">

                {loadingOfficers
                  ? "Loading officers..."
                  : "Select your name"}

              </option>


              {officers.map(
                (name, index) => (

                  <option
                    key={`${name}-${index}`}
                    value={name}
                  >
                    {name}
                  </option>

                )
              )}

            </select>


            {/* NATURE OF WORK */}

            <label
              className="field-label"
              htmlFor="natureOfWork"
            >
              Nature of Work
            </label>


            <select
              id="natureOfWork"
              value={natureOfWork}
              onChange={(e) =>
                handleNatureChange(
                  e.target.value
                )
              }
            >

              <option value="">
                Select nature of work
              </option>


              {NATURE_OPTIONS.map(
                (option) => (

                  <option
                    key={option}
                    value={option}
                  >
                    {option}
                  </option>

                )
              )}

            </select>


            {/* SMART METER READING FIELDS */}

            {isSmartMeterReading && (

              <>

                <div className="smart-meter-section">

                  <h3>
                    Smart Meter Readings
                  </h3>

                  <p>
                    Enter the readings observed during inspection.
                  </p>

                </div>


                <label
                  className="field-label"
                  htmlFor="inspection1"
                >
                  1.8.0
                </label>

                <textarea
                  id="inspection1"
                  rows="2"
                  value={inspection1}
                  onChange={(e) =>
                    setInspection1(
                      e.target.value
                    )
                  }
                  placeholder="Enter 1.8.0 reading..."
                />


                <label
                  className="field-label"
                  htmlFor="inspection2"
                >
                  1.8.1
                </label>

                <textarea
                  id="inspection2"
                  rows="2"
                  value={inspection2}
                  onChange={(e) =>
                    setInspection2(
                      e.target.value
                    )
                  }
                  placeholder="Enter 1.8.1 reading..."
                />


                <label
                  className="field-label"
                  htmlFor="inspection3"
                >
                  1.8.2
                </label>

                <textarea
                  id="inspection3"
                  rows="2"
                  value={inspection3}
                  onChange={(e) =>
                    setInspection3(
                      e.target.value
                    )
                  }
                  placeholder="Enter 1.8.2 reading..."
                />


                <label
                  className="field-label"
                  htmlFor="inspection4"
                >
                  1.6.0
                </label>

                <textarea
                  id="inspection4"
                  rows="2"
                  value={inspection4}
                  onChange={(e) =>
                    setInspection4(
                      e.target.value
                    )
                  }
                  placeholder="Enter 1.6.0 reading..."
                />


                <label
                  className="field-label"
                  htmlFor="inspection5"
                >
                  9.6.0
                </label>

                <textarea
                  id="inspection5"
                  rows="2"
                  value={inspection5}
                  onChange={(e) =>
                    setInspection5(
                      e.target.value
                    )
                  }
                  placeholder="Enter 9.6.0 reading..."
                />

              </>

            )}


            {/* RECOMMENDED ACTION */}

            <label className="field-label">
              Recommended Action
            </label>


            {!natureOfWork ? (

              <div className="alert warning">

                Please select the Nature of Work first.

              </div>

            ) : (

              <div className="action-options">

                {availableActions.map(
                  (action) => (

                    <label
                      key={action}
                      className="action-option"
                    >

                      <input
                        type="checkbox"
                        checked={
                          actions.includes(
                            action
                          )
                        }
                        onChange={() =>
                          handleActionChange(
                            action
                          )
                        }
                      />

                      <span>
                        {action}
                      </span>

                    </label>

                  )
                )}

              </div>

            )}


            {/* ADDITIONAL COMMENTS */}

            <label
              className="field-label"
              htmlFor="comments"
            >
              Amount collected / Additional comments
            </label>


            <textarea
              id="comments"
              rows="3"
              value={comments}
              onChange={(e) =>
                setComments(
                  e.target.value
                )
              }
              placeholder="Enter amount collected or any other findings..."
            />


            {/* GPS STATUS */}

            {!position && (

              <div className="alert warning">

                Waiting for GPS. Allow location permission on your device.

              </div>

            )}


            {position &&
              !gpsAccurate && (

                <div className="alert warning">

                  GPS accuracy must be{" "}

                  {MAX_GPS_ACCURACY_METRES}
                  {" "}m or better.

                  Current accuracy:{" "}

                  {Math.round(
                    accuracy
                  )}
                  {" "}m.

                </div>

              )}


            {position &&
              gpsAccurate && (

                <div className="alert success">

                  GPS location is available.
                  You can submit this inspection from any location.

                </div>

              )}


            {/* SUBMIT */}

            <button
              className="attend"
              disabled={
                !position ||
                !gpsAccurate ||
                !officer.trim() ||
                !natureOfWork ||
                actions.length === 0 ||
                saving
              }
              onClick={
                saveAttendance
              }
            >

              {saving
                ? "Saving..."
                : "✓ Submit Inspection"}

            </button>


            <p className="fine-print">

              Your current GPS location is recorded when the inspection is submitted.
              You can submit an inspection from any location.

            </p>

          </>

        ) : (

          <div className="empty-state">

            {loading
              ? "Loading locations from Google Sheets…"
              : `${points.length} pending locations are currently displayed.`}

          </div>

        )}

      </section>


      {/* FOOTER */}

      <footer>

        Last refreshed:{" "}

        {lastRefresh
          ? lastRefresh.toLocaleTimeString()
          : "Not yet refreshed"}

        {" "}· Map refreshes every 30 seconds

      </footer>

    </main>
  );
}