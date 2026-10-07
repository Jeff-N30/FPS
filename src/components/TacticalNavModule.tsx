import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

let workerConfigured = false;

const ensureWorkerUrl = () => {
  if (workerConfigured) return;
  maplibregl.setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString());
  workerConfigured = true;
};

type NavMode = "compass" | "map";
type MapSize = "mini" | "large";
type LocStatus = "idle" | "requesting" | "granted" | "denied" | "unavailable";
type CompassAccess = "unknown" | "granted" | "denied" | "unsupported";

type Objective = {
  id: string;
  label: string;
  kind: string;
  lat: number;
  lng: number;
};

type LiveFix = {
  lat: number;
  lng: number;
  accuracy: number;
  speed: number | null;
  heading: number | null;
  timestamp: number;
};

type PrecisionState = "searching" | "locked" | "poor";

const MAX_ACCEPTABLE_ACCURACY_M = 15;
const GEO_AUTH_KEY = "fps.geo.authorized";

const clampHeading = (h: number) => {
  const x = h % 360;
  return x < 0 ? x + 360 : x;
};

const bearingBetween = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dLon);
  return clampHeading((Math.atan2(y, x) * 180) / Math.PI);
};

const distanceMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const r = 6371000;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dP = ((lat2 - lat1) * Math.PI) / 180;
  const dL = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dP / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dL / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return r * c;
};

const projectPoint = (lat: number, lon: number, meters: number, bearingDeg: number) => {
  const r = 6378137;
  const brng = (bearingDeg * Math.PI) / 180;
  const d = meters / r;
  const p1 = (lat * Math.PI) / 180;
  const l1 = (lon * Math.PI) / 180;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(brng));
  const l2 = l1 + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return {
    lat: (p2 * 180) / Math.PI,
    lng: (((l2 * 180) / Math.PI + 540) % 360) - 180,
  };
};

const toCardinal = (deg: number | null) => {
  if (deg == null) return "---";
  const pts = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return pts[Math.round(deg / 45) % 8];
};

const tileStyle: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    topo: {
      type: "raster",
      tiles: [
        "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
        "https://b.tile.opentopomap.org/{z}/{x}/{y}.png",
        "https://c.tile.opentopomap.org/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution:
        "Map data: OpenStreetMap contributors, SRTM | Cartography: OpenTopoMap (CC-BY-SA)",
    },
  },
  layers: [
    {
      id: "topo",
      type: "raster",
      source: "topo",
      paint: {
        "raster-saturation": -0.72,
        "raster-contrast": 0.2,
        "raster-brightness-min": 0.06,
        "raster-brightness-max": 0.67,
      },
    },
  ],
};

const applyMapInteractionLevel = (map: maplibregl.Map, size: MapSize) => {
  if (size === "large") {
    map.dragPan.enable();
    map.scrollZoom.enable();
    map.doubleClickZoom.enable();
    map.touchZoomRotate.enable();
    map.keyboard.enable();
    return;
  }

  map.dragPan.disable();
  map.scrollZoom.disable();
  map.doubleClickZoom.disable();
  map.touchZoomRotate.disable();
  map.keyboard.disable();
};

export default function TacticalNavModule() {
  ensureWorkerUrl();

  const [navMode, setNavMode] = useState<NavMode>("map");
  const [mapSize, setMapSize] = useState<MapSize>("mini");
  const [locStatus, setLocStatus] = useState<LocStatus>("idle");
  const [compassAccess, setCompassAccess] = useState<CompassAccess>("unknown");
  const [heading, setHeading] = useState<number | null>(null);
  const [position, setPosition] = useState<LiveFix | null>(null);
  const [followPlayer, setFollowPlayer] = useState(true);
  const [mapDataError, setMapDataError] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [objective, setObjective] = useState<Objective | null>(null);
  const [precisionState, setPrecisionState] = useState<PrecisionState>("searching");
  const [bestAccuracy, setBestAccuracy] = useState<number | null>(null);

  const mapRootRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const playerMarkerRef = useRef<maplibregl.Marker | null>(null);
  const playerElRef = useRef<HTMLDivElement | null>(null);
  const objectiveMarkerRef = useRef<maplibregl.Marker | null>(null);
  const objectiveElRef = useRef<HTMLDivElement | null>(null);
  const objectiveSeededRef = useRef(false);
  const requestTimerRef = useRef<number | null>(null);

  const objectiveData = useMemo(() => {
    if (!position || !objective) return null;
    const lat = position.lat;
    const lng = position.lng;
    const dist = distanceMeters(lat, lng, objective.lat, objective.lng);
    const bearing = bearingBetween(lat, lng, objective.lat, objective.lng);
    return {
      distance: dist,
      bearing,
      cardinal: toCardinal(bearing),
    };
  }, [position, objective]);

  const ensureCompassTracking = useCallback(async () => {
    if (typeof window === "undefined" || typeof DeviceOrientationEvent === "undefined") {
      setCompassAccess("unsupported");
      return;
    }

    const d = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<"granted" | "denied">;
    };

    if (typeof d.requestPermission === "function") {
      const p = await d.requestPermission();
      if (p !== "granted") {
        setCompassAccess("denied");
        return;
      }
    }

    setCompassAccess("granted");
  }, []);

  useEffect(() => {
    const onOrientation = (evt: DeviceOrientationEvent) => {
      const iosHeading = (evt as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading;
      let next: number | null = null;

      if (typeof iosHeading === "number") {
        next = clampHeading(iosHeading);
      } else if (typeof evt.alpha === "number") {
        next = clampHeading(360 - evt.alpha);
      }

      if (next != null) setHeading(next);
    };

    window.addEventListener("deviceorientationabsolute", onOrientation as EventListener, true);
    window.addEventListener("deviceorientation", onOrientation as EventListener, true);

    return () => {
      window.removeEventListener("deviceorientationabsolute", onOrientation as EventListener, true);
      window.removeEventListener("deviceorientation", onOrientation as EventListener, true);
    };
  }, []);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const handleLivePosition = useCallback((pos: GeolocationPosition) => {
    const next: LiveFix = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      speed: Number.isFinite(pos.coords.speed ?? NaN) ? pos.coords.speed ?? null : null,
      heading: Number.isFinite(pos.coords.heading ?? NaN) ? clampHeading(pos.coords.heading ?? 0) : null,
      timestamp: pos.timestamp,
    };

    if (!Number.isFinite(next.accuracy)) {
      return;
    }

    const resolvedLat = next.lat;
    const resolvedLng = next.lng;
    const resolvedAccuracy = next.accuracy;

    setPrecisionState(
      resolvedAccuracy <= MAX_ACCEPTABLE_ACCURACY_M
        ? "locked"
        : resolvedAccuracy <= MAX_ACCEPTABLE_ACCURACY_M * 2
          ? "searching"
          : "poor",
    );
    setBestAccuracy((x) => (x == null ? resolvedAccuracy : Math.min(x, resolvedAccuracy)));

    setPosition({
      lat: resolvedLat,
      lng: resolvedLng,
      accuracy: resolvedAccuracy,
      speed: next.speed,
      heading: next.heading,
      timestamp: next.timestamp,
    });
    setLocStatus("granted");
    localStorage.setItem(GEO_AUTH_KEY, "1");

    if (requestTimerRef.current != null) {
      clearTimeout(requestTimerRef.current);
      requestTimerRef.current = null;
    }

    if (next.heading != null && (next.speed ?? 0) > 0.4) {
      setHeading(next.heading);
    }

    if (!objectiveSeededRef.current) {
      const p = projectPoint(resolvedLat, resolvedLng, 427, 31);
      setObjective({ id: "obj-a", label: "OBJECTIVE", kind: "BOMB SITE", lat: p.lat, lng: p.lng });
      objectiveSeededRef.current = true;
    }
  }, []);

  const handleLocationError = useCallback((err: GeolocationPositionError) => {
    if (err.code === err.PERMISSION_DENIED) {
      if (requestTimerRef.current != null) {
        clearTimeout(requestTimerRef.current);
        requestTimerRef.current = null;
      }
      setLocStatus("denied");
      localStorage.removeItem(GEO_AUTH_KEY);
      return;
    }

    // Keep searching on transient TIMEOUT/POSITION_UNAVAILABLE so GPS can still lock.
    setLocStatus((s) => (s === "granted" ? s : "requesting"));
  }, []);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocStatus("unavailable");
      return;
    }

    setLocStatus("requesting");
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    if (requestTimerRef.current != null) clearTimeout(requestTimerRef.current);
    requestTimerRef.current = window.setTimeout(() => {
      setLocStatus((s) => (s === "requesting" ? "unavailable" : s));
      requestTimerRef.current = null;
    }, 60000);

    // Use watchPosition directly (previously working behavior) to keep receiving fixes.
    watchIdRef.current = navigator.geolocation.watchPosition(handleLivePosition, handleLocationError, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 30000,
    });
  }, [handleLivePosition, handleLocationError]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocStatus("unavailable");
      return;
    }

    let cancelled = false;
    let permissionStatus: PermissionStatus | null = null;

    const onPermissionChange = () => {
      if (cancelled || !permissionStatus) return;
      if (permissionStatus.state === "granted") {
        requestLocation();
      } else if (permissionStatus.state === "denied") {
        setLocStatus("denied");
        localStorage.removeItem(GEO_AUTH_KEY);
      } else {
        setLocStatus("idle");
      }
    };

    const init = async () => {
      const rememberedAuth = localStorage.getItem(GEO_AUTH_KEY) === "1";

      if (!navigator.permissions || !navigator.permissions.query) {
        if (rememberedAuth) requestLocation();
        else setLocStatus("idle");
        return;
      }

      try {
        permissionStatus = await navigator.permissions.query({ name: "geolocation" });
        if (cancelled || !permissionStatus) return;

        if (permissionStatus.state === "granted") {
          requestLocation();
        } else if (permissionStatus.state === "denied") {
          setLocStatus("denied");
          localStorage.removeItem(GEO_AUTH_KEY);
        } else {
          setLocStatus("idle");
        }

        permissionStatus.addEventListener("change", onPermissionChange);
      } catch {
        if (rememberedAuth) requestLocation();
        else setLocStatus("idle");
      }
    };

    void init();

    return () => {
      cancelled = true;
      permissionStatus?.removeEventListener("change", onPermissionChange);
    };
  }, [requestLocation]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
      if (requestTimerRef.current != null) clearTimeout(requestTimerRef.current);
      mapRef.current?.remove();
    };
  }, []);

  useEffect(() => {
    if (navMode !== "map") return;
    if (locStatus !== "granted" || !position || !mapRootRef.current) return;

    if (!mapRef.current) {
      const map = new maplibregl.Map({
        container: mapRootRef.current,
        style: tileStyle,
        center: [position.lng, position.lat],
        zoom: mapSize === "large" ? 16 : 15,
        bearing: heading != null ? heading : 0,
        attributionControl: false,
      });

      map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
      map.on("dragstart", () => setFollowPlayer(false));
      map.on("error", () => setMapDataError(true));

      const playerEl = document.createElement("div");
      playerEl.className = "nav-player-marker";
      playerEl.innerHTML = '<span class="nav-player-heading"></span><span class="nav-player-core"></span>';
      playerElRef.current = playerEl;

      const objectiveEl = document.createElement("div");
      objectiveEl.className = "nav-objective-marker";
      objectiveEl.innerHTML = '<span class="nav-objective-core"></span>';
      objectiveElRef.current = objectiveEl;

      playerMarkerRef.current = new maplibregl.Marker({ element: playerEl, anchor: "center" })
        .setLngLat([position.lng, position.lat])
        .addTo(map);

      mapRef.current = map;
      applyMapInteractionLevel(map, mapSize);
    }
  }, [heading, locStatus, mapSize, navMode, position]);

  useEffect(() => {
    if (!mapRef.current || !position) return;

    const map = mapRef.current;
    const lngLat: [number, number] = [position.lng, position.lat];

    playerMarkerRef.current?.setLngLat(lngLat);

    if (playerElRef.current && heading != null) {
      playerElRef.current.style.setProperty("--heading", `${heading}deg`);
    }

    if (objective && map) {
      if (!objectiveMarkerRef.current && objectiveElRef.current) {
        objectiveMarkerRef.current = new maplibregl.Marker({ element: objectiveElRef.current, anchor: "bottom" })
          .setLngLat([objective.lng, objective.lat])
          .addTo(map);
      } else {
        objectiveMarkerRef.current?.setLngLat([objective.lng, objective.lat]);
      }
    }

    if (heading != null) {
      map.easeTo({ bearing: heading, duration: 200 });
    }

    if (followPlayer) {
      map.easeTo({
        center: lngLat,
        duration: 300,
        zoom: mapSize === "large" ? 16 : 15,
      });
    }
  }, [followPlayer, heading, mapSize, objective, position]);

  useEffect(() => {
    if (!mapRef.current) return;
    applyMapInteractionLevel(mapRef.current, mapSize);
    mapRef.current.resize();
  }, [mapSize]);

  const cycleMapSize = () => {
    setMapSize((s) => (s === "mini" ? "large" : "mini"));
  };

  const centerOnPlayer = () => {
    if (!position || !mapRef.current) return;
    setFollowPlayer(true);
    mapRef.current.easeTo({
      center: [position.lng, position.lat],
      zoom: mapSize === "large" ? 16 : 15,
      bearing: heading != null ? heading : 0,
      duration: 220,
    });
  };

  const headingText = heading == null ? "---" : `${String(Math.round(heading)).padStart(3, "0")}° ${toCardinal(heading)}`;

  return (
    <section className={`panel panel-map nav-panel ${mapSize === "large" ? "nav-large" : "nav-mini"}`}>
      <div className="panel-hd">
        <div className="lbl">Tactical Map</div>
        <div className="nav-controls mono">
          <button className="nav-btn" aria-label="center on player" onClick={centerOnPlayer}>◎</button>
          <button className={navMode === "compass" ? "nav-btn on" : "nav-btn"} onClick={() => setNavMode("compass")}>COMPASS</button>
          <button className={navMode === "map" ? "nav-btn on" : "nav-btn"} onClick={() => setNavMode("map")}>MAP</button>
          <button className="nav-btn" aria-label="expand map" onClick={cycleMapSize}>{mapSize === "mini" ? "↗" : "↙"}</button>
        </div>
      </div>

      {navMode === "compass" ? (
        <div className="nav-compass-wrap">
          <div className="nav-compass-grid mono">
            <span>N</span><span>NE</span><span>E</span><span>SE</span><span>S</span><span>SW</span><span>W</span><span>NW</span>
          </div>
          <div className="nav-compass-ring">
            <div className="nav-compass-arrow" style={{ transform: `translate(-50%, -50%) rotate(${heading ?? 0}deg)` }} />
            <div className="nav-compass-center">▲</div>
          </div>
          <div className="nav-headline mono">{headingText}</div>
          {objectiveData ? (
            <div className="nav-obj-readout mono">BRG {String(Math.round(objectiveData.bearing)).padStart(3, "0")}° {objectiveData.cardinal}</div>
          ) : (
            <div className="nav-obj-readout mono">BRG ---</div>
          )}
          {compassAccess !== "granted" ? (
            <button className="nav-action" onClick={() => void ensureCompassTracking()}>
              {compassAccess === "denied" ? "COMPASS BLOCKED" : "ENABLE COMPASS"}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="nav-map-wrap">
          {locStatus !== "granted" ? (
            <div className="nav-permission">
              <div className="nav-warn-title mono">LOCATION ACCESS REQUIRED</div>
              <p>Enable location access to display your real-time tactical position.</p>
              <button className="nav-action" onClick={requestLocation}>
                {locStatus === "requesting" ? "REQUESTING..." : locStatus === "idle" ? "ENABLE LOCATION" : "RETRY LOCATION"}
              </button>
              {locStatus === "denied" ? <div className="nav-status off mono">LOCATION OFF</div> : null}
              {locStatus === "unavailable" ? <div className="nav-status off mono">LOCATION UNAVAILABLE</div> : null}
            </div>
          ) : (
            <>
              <div ref={mapRootRef} className="nav-map-canvas" />
              {!isOnline || mapDataError ? (
                <div className="nav-map-error mono">MAP DATA UNAVAILABLE</div>
              ) : null}
              <div className="nav-overlay mono">
                <div className="nav-compassline">
                  <span>N</span><span>E</span><span>S</span><span>W</span>
                </div>
                <div className="nav-headingline">
                  {heading == null ? "---°" : `${String(Math.round(heading)).padStart(3, "0")}°`}
                  <span>{heading == null ? "--" : toCardinal(heading)}</span>
                </div>
                <div className="nav-coord">
                  {position ? `${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}` : "--"}
                </div>
                <div className="nav-acc">ACC {position ? `${Math.round(position.accuracy)}m` : "--"}</div>
                <div className={`nav-lock ${precisionState === "locked" ? "ok" : precisionState === "poor" ? "off" : ""}`}>
                  {precisionState === "locked" ? "GPS LOCKED" : precisionState === "poor" ? "GPS POOR" : "CALIBRATING"}
                </div>
                <div className="nav-best">BEST {bestAccuracy != null ? `${Math.round(bestAccuracy)}m` : "--"}</div>
                <button className="nav-mini-btn" onClick={centerOnPlayer}>CENTER ON PLAYER</button>
              </div>
              <div className="nav-objective-box mono">
                <div>OBJECTIVE</div>
                <strong>BOMB SITE</strong>
                <div>{objectiveData ? `${Math.round(objectiveData.distance)} m` : "--- m"}</div>
                <div>{objectiveData ? `${String(Math.round(objectiveData.bearing)).padStart(3, "0")}°` : "---°"}</div>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
