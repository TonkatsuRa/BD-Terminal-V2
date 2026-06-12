(() => {
  "use strict";

  const IS_FIREFOX = /firefox/i.test(navigator.userAgent);
  const IS_MOBILE = window.matchMedia("(max-width: 820px), (pointer: coarse)").matches;
  const PREFERS_REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const IS_LOW_POWER = IS_FIREFOX || IS_MOBILE || PREFERS_REDUCED_MOTION;
  if (IS_FIREFOX) document.documentElement.classList.add("is-firefox");
  if (IS_LOW_POWER) document.documentElement.classList.add("is-low-power");

  const DEFAULT_MAP_PROFILE = {
    name: IS_LOW_POWER ? "low" : "full",
    pixelRatioCap: IS_LOW_POWER ? 1 : 1.25,
    frameMs: IS_FIREFOX ? 1000 / 30 : (IS_LOW_POWER ? 1000 / 24 : 1000 / 45),
    autoRotate: !PREFERS_REDUCED_MOTION,
    scan: !PREFERS_REDUCED_MOTION,
    markerPulse: !IS_LOW_POWER,
    routeAnimation: !PREFERS_REDUCED_MOTION,
    staticRender: PREFERS_REDUCED_MOTION
  };

  let mapProfile = { ...DEFAULT_MAP_PROFILE };
  let mapDisposed = false;
  let mapPaused = document.hidden;
  let mapReady = false;
  let animationFrameId = 0;

  function postMapMessage(type, payload = {}) {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ source: "ARES_MAP", type, payload }, "*");
    }
  }

  function updateLoader(stage, progress) {
    const meter = document.getElementById("meter");
    if (meter) meter.textContent = `${stage} // ${Math.round(progress)}%`;
    postMapMessage("ARES_MAP_PROGRESS", { stage, progress: Math.round(progress) });
  }

  function requestMapFrame() {
    if (mapDisposed || mapPaused || animationFrameId) return;
    animationFrameId = requestAnimationFrame(animate);
  }

  function setMapPaused(nextPaused) {
    mapPaused = Boolean(nextPaused);
    if (mapPaused && animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = 0;
      return;
    }
    if (!mapPaused) requestMapFrame();
  }

  function applyMapProfile(profile = {}) {
    mapProfile = { ...mapProfile, ...profile };
    if (renderer) {
      const ratio = Math.min(window.devicePixelRatio || 1, Number(mapProfile.pixelRatioCap) || 1);
      renderer.setPixelRatio(ratio);
      renderer.setSize(W, H);
    }
    if (controls) {
      controls.autoRotate = Boolean(mapProfile.autoRotate);
      btnRotate.classList.toggle("active", controls.autoRotate);
    }
    scanEnabled = Boolean(mapProfile.scan);
    btnScan.classList.toggle("active", scanEnabled);
    if (!scanEnabled) layers.forEach(l => { l.mat.opacity = l.baseOpacity; });
    document.documentElement.classList.toggle("map-profile-low", mapProfile.name !== "full");
    requestMapFrame();
  }

  function disposeMaterial(material) {
    if (!material) return;
    const materials = Array.isArray(material) ? material : [material];
    materials.forEach(mat => {
      Object.keys(mat).forEach(key => {
        const value = mat[key];
        if (value && value.isTexture && typeof value.dispose === "function") value.dispose();
      });
      if (typeof mat.dispose === "function") mat.dispose();
    });
  }

  function disposeObject3D(object) {
    if (!object) return;
    object.traverse(child => {
      if (child.geometry && typeof child.geometry.dispose === "function") child.geometry.dispose();
      disposeMaterial(child.material);
    });
  }

  function disposeMap() {
    if (mapDisposed) return;
    mapDisposed = true;
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = 0;
    }
    window.removeEventListener("resize", handleResize);
    controls?.dispose?.();
    disposeObject3D(scene);
    if (renderer) {
      renderer.dispose();
      renderer.forceContextLoss?.();
      renderer.domElement?.remove();
    }
    postMapMessage("ARES_MAP_DISPOSED", {});
  }

  function handleMapMessage(event) {
    const message = event.data || {};
    if (message.source !== "ARES_TERMINAL_V3") return;
    switch (message.type) {
      case "ARES_MAP_INIT":
      case "ARES_MAP_SET_PROFILE":
        applyMapProfile(message.payload?.profile || message.payload || {});
        if (mapReady) postMapMessage("ARES_MAP_READY", { profile: mapProfile.name });
        break;
      case "ARES_MAP_PAUSE":
        setMapPaused(true);
        break;
      case "ARES_MAP_RESUME":
        setMapPaused(false);
        break;
      case "ARES_MAP_DISPOSE":
        disposeMap();
        break;
      default:
        break;
    }
  }

  window.addEventListener("message", handleMapMessage);
  window.addEventListener("pagehide", disposeMap);
  document.addEventListener("visibilitychange", () => setMapPaused(document.hidden));
  window.addEventListener("keydown", event => {
    if (event.key === "Escape") postMapMessage("ARES_MAP_CLOSE_REQUEST", {});
  });

  /*
    Direct heightmap renderer.
    The PNG below is not re-created by the script. It is read pixel-for-pixel:
    dark = low, bright = high. Marching Squares extracts the contour line geometry.
  */
  const HEIGHTMAP_URL = "assets/maps/black-desert-heightmap.png";

  const SAMPLE_W = IS_LOW_POWER ? 168 : 208;
  const SAMPLE_H = IS_LOW_POWER ? 168 : 208;
  const LEVEL_COUNT = IS_LOW_POWER ? 20 : 28;
  const WORLD_SIZE = 9.6;
  const WORLD_W = WORLD_SIZE;
  const WORLD_D = WORLD_SIZE;
  const GRID_COLS = 10;
  const GRID_ROWS = 10;
  const POINT_GRID_SUBDIV = 4;
  const HEIGHT_SCALE = 0.42;
  const LOW_CUTOFF = 0.04;
  const HIGH_CUTOFF = 0.97;
  const HEIGHT_GAMMA = 1.0;
  const SMOOTH_PASSES = 4;
  const BLUR_MIX = 0.68;
  const ELEVATION_RESPONSE = 1.45;

  const wrap = document.getElementById("wrap");
  const loader = document.getElementById("loader");

  let W = wrap.clientWidth;
  let H = wrap.clientHeight;

  let scene, camera, renderer, controls;
  let contourGroup, surfaceMesh, occluderMesh, pointCloud, grid, frame, tacticalLabels, locationsGroup, zoneGroup, networkGroup, anomalyGroup;
  let locationMarkers = [];
  let siteLinks = [];
  let zoneMeshes = [];
  let anomalyWaves = [];
  let cameraTween = null;
  let layers = [];
  let heightDataRef = null;
  let scanEnabled = true;

  const controlPanel = document.getElementById("control-panel");
  const panelContent = document.getElementById("panel-content");
  const btnMenu = document.getElementById("btn-menu");
  const btnRotate = document.getElementById("btn-rotate");
  const btnScan = document.getElementById("btn-scan");
  const btnSurface = document.getElementById("btn-surface");
  const btnContours = document.getElementById("btn-contours");
  const btnLocations = document.getElementById("btn-locations");
  const btnZones = document.getElementById("btn-zones");
  const btnNetwork = document.getElementById("btn-network");
  const btnAnomaly = document.getElementById("btn-anomaly");
  const btnTop = document.getElementById("btn-top");
  const btnIso = document.getElementById("btn-iso");
  const btnPresent = document.getElementById("btn-present");

  const img = new Image();
  img.onload = () => {
    try {
      if (!window.THREE || !THREE.OrbitControls) {
        throw new Error("Three.js runtime failed to load");
      }
      updateLoader("sampling terrain pixels", 12);
      const heightData = padHeightDataToSquare(sampleHeightmap(img));
      heightDataRef = heightData;
      updateLoader("initializing webgl terrain bus", 24);
      initThree();
      updateLoader("compiling desert surface", 36);
      buildSurface(heightData);
      updateLoader("extracting contour mesh", 48);
      buildContours(heightData);
      contourGroup.visible = false;
      updateLoader("building low-level point cloud", 58);
      buildPointCloud(heightData);
      addGroundDecoration();
      updateLoader("calibrating tactical zones", 68);
      addZoneOverlays(heightData);
      updateLoader("indexing ARES site markers", 76);
      addLocationMarkers(heightData);
      locationsGroup.visible = false;
      updateLoader("routing patrol network", 84);
      addSiteConnections();
      networkGroup.visible = false;
      updateLoader("arming anomaly sensor", 92);
      addAnomalySensor(heightData);
      anomalyGroup.visible = false;
      bindUI();
      applyMapProfile(mapProfile);
      loader.style.display = "none";
      mapReady = true;
      updateLoader("map ready", 100);
      postMapMessage("ARES_MAP_READY", { profile: mapProfile.name });
      setMapPaused(false);
    } catch (error) {
      console.error(error);
      loader.textContent = `ERROR: ${String(error.message || error).toUpperCase()}`;
      postMapMessage("ARES_MAP_ERROR", { message: String(error.message || error) });
    }
  };
  img.onerror = () => {
    loader.textContent = "ERROR: HEIGHTMAP DATA COULD NOT BE READ";
    postMapMessage("ARES_MAP_ERROR", { message: "HEIGHTMAP DATA COULD NOT BE READ" });
  };
  img.src = HEIGHTMAP_URL;

  function smoothHeightfield(values, width, height, passes) {
    let src = new Float32Array(values);
    let dst = new Float32Array(values.length);

    for (let pass = 0; pass < passes; pass++) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let sum = 0;
          let weight = 0;

          for (let oy = -1; oy <= 1; oy++) {
            for (let ox = -1; ox <= 1; ox++) {
              const nx = Math.max(0, Math.min(width - 1, x + ox));
              const ny = Math.max(0, Math.min(height - 1, y + oy));
              const w = (ox === 0 && oy === 0) ? 4 : ((ox === 0 || oy === 0) ? 2 : 1);
              sum += src[idx(nx, ny, width)] * w;
              weight += w;
            }
          }

          const i = idx(x, y, width);
          const blurred = sum / weight;
          dst[i] = src[i] * (1 - BLUR_MIX) + blurred * BLUR_MIX;
        }
      }

      const tmp = src;
      src = dst;
      dst = tmp;
    }

    return src;
  }

  function sampleHeightmap(image) {
    const canvas = document.createElement("canvas");
    canvas.width = SAMPLE_W;
    canvas.height = SAMPLE_H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, 0, 0, SAMPLE_W, SAMPLE_H);

    const px = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
    const raw = new Float32Array(SAMPLE_W * SAMPLE_H);

    let min = Infinity;
    let max = -Infinity;

    for (let i = 0, p = 0; i < raw.length; i++, p += 4) {
      const r = px[p] / 255;
      const g = px[p + 1] / 255;
      const b = px[p + 2] / 255;
      const a = px[p + 3] / 255;
      let luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) * a;
      luma = Math.pow(Math.max(0, Math.min(1, luma)), HEIGHT_GAMMA);
      raw[i] = luma;
      if (luma < min) min = luma;
      if (luma > max) max = luma;
    }

    const range = Math.max(1e-6, max - min);
    for (let i = 0; i < raw.length; i++) {
      raw[i] = Math.max(0, Math.min(1, (raw[i] - min) / range));
    }

    const data = smoothHeightfield(raw, SAMPLE_W, SAMPLE_H, SMOOTH_PASSES);

    for (let i = 0; i < data.length; i++) {
      let h = Math.max(0, Math.min(1, data[i]));
      // Slightly compress extremes so bright spots do not become unnaturally spiky.
      h = Math.pow(h, ELEVATION_RESPONSE);
      data[i] = h;
    }

    return {
      values: data,
      width: SAMPLE_W,
      height: SAMPLE_H,
      min,
      max
    };
  }

  function padHeightDataToSquare(data) {
    if (data.width === data.height) return data;

    const size = Math.max(data.width, data.height);
    const values = new Float32Array(size * size);
    const offsetX = Math.floor((size - data.width) / 2);
    const offsetY = Math.floor((size - data.height) / 2);

    const srcMinX = offsetX;
    const srcMaxX = offsetX + data.width - 1;
    const srcMinY = offsetY;
    const srcMaxY = offsetY + data.height - 1;

    function duneNoise(nx, ny) {
      const a = Math.sin(nx * 0.095 + ny * 0.018 + 1.3);
      const b = Math.sin(nx * 0.041 - ny * 0.061 + 0.7);
      const c = Math.sin(nx * 0.19 + ny * 0.027 + 2.2);
      return (a * 0.55 + b * 0.30 + c * 0.15);
    }

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const inside = x >= srcMinX && x <= srcMaxX && y >= srcMinY && y <= srcMaxY;

        if (inside) {
          const srcI = idx(x - offsetX, y - offsetY, data.width);
          values[idx(x, y, size)] = data.values[srcI];
          continue;
        }

        const clampX = Math.max(srcMinX, Math.min(srcMaxX, x));
        const clampY = Math.max(srcMinY, Math.min(srcMaxY, y));
        const edgeSample = values[idx(clampX, clampY, size)] || data.values[idx(clampX - offsetX, clampY - offsetY, data.width)];

        const dx = x < srcMinX ? (srcMinX - x) : (x > srcMaxX ? (x - srcMaxX) : 0);
        const dy = y < srcMinY ? (srcMinY - y) : (y > srcMaxY ? (y - srcMaxY) : 0);
        const dist = Math.sqrt(dx * dx + dy * dy);

        const maxPadX = Math.max(srcMinX, size - 1 - srcMaxX);
        const maxPadY = Math.max(srcMinY, size - 1 - srcMaxY);
        const maxDist = Math.max(1, Math.sqrt(maxPadX * maxPadX + maxPadY * maxPadY));

        const t = Math.max(0, Math.min(1, dist / maxDist));
        const feather = t * t * (3 - 2 * t);

        // Low, broad dune relief: still mostly flat, but more natural than hard empty padding.
        const duneBase = 0.018;
        const duneAmp = 0.028;
        const dune = Math.max(0, duneBase + duneNoise(x, y) * duneAmp);

        // Gently blend from existing terrain edge into soft surrounding dunes.
        const blended = edgeSample * (1 - feather) + dune * feather;
        values[idx(x, y, size)] = blended;
      }
    }

    return {
      values,
      width: size,
      height: size,
      min: data.min,
      max: data.max,
      sourceWidth: data.width,
      sourceHeight: data.height,
      paddedToSquare: true
    };
  }

  function initThree() {
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x030201, 0.042);

    camera = new THREE.PerspectiveCamera(39, W / H, 0.05, 120);
    camera.position.set(7.6, 5.15, 7.35);

    renderer = new THREE.WebGLRenderer({ antialias: !IS_LOW_POWER, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Number(mapProfile.pixelRatioCap) || 1));
    renderer.setSize(W, H);
    renderer.outputEncoding = THREE.sRGBEncoding;
    wrap.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.rotateSpeed = 0.64;
    controls.zoomSpeed = 0.82;
    controls.panSpeed = 0.75;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.42;
    controls.minDistance = 5;
    controls.maxDistance = 28;
    controls.maxPolarAngle = Math.PI / 2 + 0.18;
    controls.target.set(0.28, 0.34, 0.18);
    controls.addEventListener("change", requestMapFrame);

    contourGroup = new THREE.Group();
    scene.add(contourGroup);
  }

  function idx(x, y, width) {
    return y * width + x;
  }

  function hAt(data, x, y) {
    x = Math.max(0, Math.min(data.width - 1, x));
    y = Math.max(0, Math.min(data.height - 1, y));
    return data.values[idx(x, y, data.width)];
  }

  function toWorldX(gx, w) {
    return (gx / (w - 1) - 0.5) * WORLD_W;
  }

  function toWorldZ(gy, h) {
    return (gy / (h - 1) - 0.5) * WORLD_D;
  }

  function elevY(h) {
    return h * HEIGHT_SCALE;
  }

  function buildSurface(data) {
    const w = data.width;
    const h = data.height;
    const positions = new Float32Array(w * h * 3);
    const colors = new Float32Array(w * h * 3);
    const indices = [];

    const c = new THREE.Color();
    const lightDir = new THREE.Vector3(-0.55, 0.95, 0.35).normalize();

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = idx(x, y, w);
        const v = data.values[i];

        positions[i * 3] = toWorldX(x, w);
        positions[i * 3 + 1] = elevY(v) - 0.018;
        positions[i * 3 + 2] = toWorldZ(y, h);

        // Pseudo-lighting from local slope for subtle terrain shadowing.
        const hL = hAt(data, x - 1, y);
        const hR = hAt(data, x + 1, y);
        const hD = hAt(data, x, y - 1);
        const hU = hAt(data, x, y + 1);

        const nx = hL - hR;
        const ny = 1.9;
        const nz = hD - hU;
        const len = Math.hypot(nx, ny, nz) || 1;
        const shade = Math.max(0, (nx / len) * lightDir.x + (ny / len) * lightDir.y + (nz / len) * lightDir.z);

        // Dark burnt orange at low elevations, pale amber at high elevations.
        const shadeMix = 0.62 + shade * 0.52;
        c.setRGB(
          (0.18 + v * 1.08) * shadeMix,
          (0.065 + v * 0.52) * shadeMix,
          (0.018 + v * 0.10) * shadeMix
        );
        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
      }
    }

    for (let y = 0; y < h - 1; y++) {
      for (let x = 0; x < w - 1; x++) {
        const a = idx(x, y, w);
        const b = idx(x + 1, y, w);
        const c0 = idx(x + 1, y + 1, w);
        const d = idx(x, y + 1, w);
        indices.push(a, b, d, b, c0, d);
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: IS_FIREFOX ? 0.10 : 0.18,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    surfaceMesh = new THREE.Mesh(geom, mat);
    surfaceMesh.renderOrder = 1;
    scene.add(surfaceMesh);

    // Depth-only terrain pre-pass.
    // This writes the terrain into the depth buffer without drawing color.
    // Result: contour lines / points behind hills are hidden instead of glowing through them.
    const occluderMat = new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: true,
      depthTest: true,
      side: THREE.DoubleSide
    });
    occluderMesh = new THREE.Mesh(geom, occluderMat);
    occluderMesh.renderOrder = -10;
    scene.add(occluderMesh);
  }

  function safeInterp(level, a, b) {
    const denom = b - a;
    if (Math.abs(denom) < 1e-7) return 0.5;
    return Math.max(0, Math.min(1, (level - a) / denom));
  }

  function extractContour(data, level) {
    const w = data.width;
    const h = data.height;
    const out = [];

    for (let y = 0; y < h - 1; y++) {
      for (let x = 0; x < w - 1; x++) {
        const a = hAt(data, x, y);
        const b = hAt(data, x + 1, y);
        const c = hAt(data, x + 1, y + 1);
        const d = hAt(data, x, y + 1);

        let m = 0;
        if (a >= level) m |= 1;
        if (b >= level) m |= 2;
        if (c >= level) m |= 4;
        if (d >= level) m |= 8;

        if (m === 0 || m === 15) continue;

        const tT = safeInterp(level, a, b);
        const tR = safeInterp(level, b, c);
        const tB = safeInterp(level, d, c);
        const tL = safeInterp(level, a, d);

        const T = [x + tT, y];
        const R = [x + 1, y + tR];
        const B = [x + tB, y + 1];
        const L = [x, y + tL];

        const s = (p, q) => {
          out.push(p[0], p[1], q[0], q[1]);
        };

        switch (m) {
          case 1: case 14: s(T, L); break;
          case 2: case 13: s(T, R); break;
          case 4: case 11: s(B, R); break;
          case 8: case 7:  s(B, L); break;
          case 3: case 12: s(L, R); break;
          case 6: case 9:  s(T, B); break;
          case 5: s(T, R); s(B, L); break;
          case 10: s(T, L); s(B, R); break;
        }
      }
    }

    return out;
  }

  function contourKey(x, y) {
    return `${Math.round(x * 1000)},${Math.round(y * 1000)}`;
  }

  function stitchContourPaths(segs) {
    const segments = [];
    const endpointMap = new Map();

    function addEndpoint(key, entry) {
      if (!endpointMap.has(key)) endpointMap.set(key, []);
      endpointMap.get(key).push(entry);
    }

    for (let i = 0; i < segs.length; i += 4) {
      const a = [segs[i], segs[i + 1]];
      const b = [segs[i + 2], segs[i + 3]];
      const seg = { a, b, used: false, idx: segments.length };
      segments.push(seg);

      addEndpoint(contourKey(a[0], a[1]), { seg: seg.idx, end: "a" });
      addEndpoint(contourKey(b[0], b[1]), { seg: seg.idx, end: "b" });
    }

    function otherPoint(seg, end) {
      return end === "a" ? seg.b : seg.a;
    }

    function extendPath(path, atStart) {
      while (true) {
        const probe = atStart ? path[0] : path[path.length - 1];
        const key = contourKey(probe[0], probe[1]);
        const entries = endpointMap.get(key) || [];
        let found = null;

        for (const entry of entries) {
          const seg = segments[entry.seg];
          if (!seg.used) {
            found = { seg, end: entry.end };
            break;
          }
        }

        if (!found) break;

        found.seg.used = true;
        const nextPt = otherPoint(found.seg, found.end);

        // Avoid repeating the same point at the join.
        if (atStart) {
          path.unshift(nextPt);
        } else {
          path.push(nextPt);
        }

        // Stop if the path has looped back to the opposite end.
        if (path.length > 3) {
          const first = path[0];
          const last = path[path.length - 1];
          if (contourKey(first[0], first[1]) === contourKey(last[0], last[1])) break;
        }
      }
    }

    const paths = [];

    for (const seg of segments) {
      if (seg.used) continue;
      seg.used = true;

      const path = [seg.a, seg.b];
      extendPath(path, false);
      extendPath(path, true);
      paths.push(path);
    }

    return paths;
  }

  function buildContours(data) {
    layers = [];
    const low = LOW_CUTOFF;
    const high = HIGH_CUTOFF;
    const c = new THREE.Color();

    for (let k = 0; k < LEVEL_COUNT; k++) {
      const t = k / (LEVEL_COUNT - 1);
      const level = low + (high - low) * t;
      const segs = extractContour(data, level);
      if (!segs.length) continue;

      const paths = stitchContourPaths(segs);
      const major = (k % 4 === 0);

      // Major contours are brighter / more opaque for topo readability.
      if (major) {
        c.setRGB(0.62 + t * 1.08, 0.31 + t * 0.78, 0.08 + t * 0.22);
      } else {
        c.setRGB(0.44 + t * 0.88, 0.18 + t * 0.56, 0.035 + t * 0.14);
      }
      const baseOpacity = major
        ? (IS_FIREFOX ? 0.34 : 0.46) + t * (IS_FIREFOX ? 0.50 : 0.68)
        : (IS_FIREFOX ? 0.18 : 0.26) + t * (IS_FIREFOX ? 0.34 : 0.48);

      for (const path of paths) {
        if (!path || path.length < 2) continue;

        const closed = path.length > 4 && contourKey(path[0][0], path[0][1]) === contourKey(path[path.length - 1][0], path[path.length - 1][1]);

        let contourPts = path.slice();
        if (closed) contourPts = contourPts.slice(0, -1);

        const worldPts = contourPts.map(([gx, gy]) =>
          new THREE.Vector3(
            toWorldX(gx, data.width),
            elevY(level) + 0.006,
            toWorldZ(gy, data.height)
          )
        );

        let renderPts = worldPts;
        if (worldPts.length >= 3) {
          const curve = new THREE.CatmullRomCurve3(worldPts, closed, "catmullrom", 0.10);
          const smoothCount = Math.max(worldPts.length * 4, closed ? 32 : 24);
          renderPts = curve.getPoints(smoothCount);
        }

        const geom = new THREE.BufferGeometry().setFromPoints(renderPts);
        const mat = new THREE.LineBasicMaterial({
          color: c.clone(),
          transparent: true,
          opacity: baseOpacity,
          blending: THREE.AdditiveBlending,
          depthTest: true,
          depthWrite: false
        });

        const line = closed ? new THREE.LineLoop(geom, mat) : new THREE.Line(geom, mat);
        line.renderOrder = major ? 3 : 2;
        contourGroup.add(line);
        layers.push({ object: line, mat, level, baseOpacity, major });
      }
    }
  }

  function buildPointCloud(data) {
    const pts = [];
    const cols = [];
    const c = new THREE.Color();

    const subdivisions = POINT_GRID_SUBDIV;
    const sampleCols = GRID_COLS * subdivisions;
    const sampleRows = GRID_ROWS * subdivisions;
    const yPlane = -0.024;

    for (let gy = 0; gy <= sampleRows; gy++) {
      for (let gx = 0; gx <= sampleCols; gx++) {
        const tx = gx / sampleCols;
        const ty = gy / sampleRows;

        const sampleX = Math.round(tx * (data.width - 1));
        const sampleY = Math.round(ty * (data.height - 1));
        const v = hAt(data, sampleX, sampleY);

        // Skip the very darkest near-empty edge padding so the overlay stays cleaner.
        if (v < 0.012) continue;

        const worldX = -WORLD_W / 2 + tx * WORLD_W;
        const worldZ = -WORLD_D / 2 + ty * WORLD_D;

        pts.push(worldX, yPlane, worldZ);

        // Amber point cloud: subtle tactical sensor dots, still carrying height intensity.
        const intensity = 0.28 + v * 0.72;
        c.setRGB(1.00 * intensity, 0.48 * intensity, 0.12 * intensity);
        cols.push(c.r, c.g, c.b);
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    geom.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));

    const mat = new THREE.PointsMaterial({
      size: IS_FIREFOX ? 0.018 : 0.016,
      vertexColors: true,
      transparent: true,
      opacity: IS_FIREFOX ? 0.42 : 0.36,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false
    });

    pointCloud = new THREE.Points(geom, mat);
    pointCloud.visible = true;
    pointCloud.renderOrder = 13;
    scene.add(pointCloud);
  }

  function makeTextSprite(text, options = {}) {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");

    const color = options.color || "rgba(170, 232, 240, 0.96)";
    const glow = options.glow || "rgba(110, 220, 230, 0.34)";

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 48px Monaco, Consolas, monospace";
    ctx.shadowColor = glow;
    ctx.shadowBlur = 10;
    ctx.fillStyle = color;
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      opacity: options.opacity || 0.82
    });

    const sprite = new THREE.Sprite(material);
    const scale = options.scale || 0.34;
    sprite.scale.set(scale, scale, 1);
    sprite.renderOrder = 20;
    return sprite;
  }

  function addTacticalGrid() {
    const cols = GRID_COLS;
    const rows = GRID_ROWS;
    const halfW = WORLD_W / 2;
    const halfD = WORLD_D / 2;
    const y = -0.03;
    const linePoints = [];

    for (let i = 0; i <= cols; i++) {
      const x = -halfW + (WORLD_W * i / cols);
      linePoints.push(new THREE.Vector3(x, y, -halfD), new THREE.Vector3(x, y, halfD));
    }

    for (let j = 0; j <= rows; j++) {
      const z = -halfD + (WORLD_D * j / rows);
      linePoints.push(new THREE.Vector3(-halfW, y, z), new THREE.Vector3(halfW, y, z));
    }

    const gridGeom = new THREE.BufferGeometry().setFromPoints(linePoints);
    const gridMat = new THREE.LineDashedMaterial({
      color: 0x8fc3cf,
      transparent: true,
      opacity: IS_FIREFOX ? 0.14 : 0.12,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      dashSize: 0.065,
      gapSize: 0.13,
      scale: 1
    });
    grid = new THREE.LineSegments(gridGeom, gridMat);
    grid.computeLineDistances();

    // Important:
    // The terrain has a depth-only occluder so hidden contour lines do not shine through hills.
    // A real grid underneath would also be hidden by that occluder.
    // For tactical-map readability, this grid is rendered as a late transparent overlay,
    // so it still reads as an under-map reference grid but remains visible through the terrain.
    grid.renderOrder = 12;
    scene.add(grid);

    tacticalLabels = new THREE.Group();
    scene.add(tacticalLabels);

    const letters = "ABCDEFGHIJ".split("");
    const xStep = WORLD_W / cols;
    const zStep = WORLD_D / rows;
    const labelOffset = 0.42;

    for (let i = 0; i < cols; i++) {
      const x = -halfW + xStep * (i + 0.5);

      const topLabel = makeTextSprite(letters[i], { scale: 0.28, opacity: 0.85 });
      topLabel.position.set(x, 0.03, -halfD - labelOffset);
      tacticalLabels.add(topLabel);

      const bottomLabel = makeTextSprite(letters[i], { scale: 0.28, opacity: 0.62 });
      bottomLabel.position.set(x, 0.03, halfD + labelOffset);
      tacticalLabels.add(bottomLabel);
    }

    for (let j = 0; j < rows; j++) {
      const n = String(j + 1);
      const z = -halfD + zStep * (j + 0.5);

      const leftLabel = makeTextSprite(n, { scale: 0.26, opacity: 0.85 });
      leftLabel.position.set(-halfW - labelOffset, 0.03, z);
      tacticalLabels.add(leftLabel);

      const rightLabel = makeTextSprite(n, { scale: 0.26, opacity: 0.62 });
      rightLabel.position.set(halfW + labelOffset, 0.03, z);
      tacticalLabels.add(rightLabel);
    }
  }

  function addGroundDecoration() {
    addTacticalGrid();

    // Border frame matching the 4:3 heightmap footprint.
    const y = 0.006;
    const x = WORLD_W / 2;
    const z = WORLD_D / 2;
    const geom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-x, y, -z), new THREE.Vector3(x, y, -z),
      new THREE.Vector3(x, y, -z), new THREE.Vector3(x, y, z),
      new THREE.Vector3(x, y, z), new THREE.Vector3(-x, y, z),
      new THREE.Vector3(-x, y, z), new THREE.Vector3(-x, y, -z),
    ]);
    const mat = new THREE.LineBasicMaterial({
      color: 0x8ab7c2,
      transparent: true,
      opacity: 0.62,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    frame = new THREE.LineSegments(geom, mat);
    frame.renderOrder = 5;
    scene.add(frame);

    // Tactical tick marks for elevation scale.
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const tickGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-WORLD_W / 2 - 0.22, elevY(t), -WORLD_D / 2),
        new THREE.Vector3(-WORLD_W / 2 - 0.07, elevY(t), -WORLD_D / 2)
      ]);
      const tick = new THREE.Line(
        tickGeom,
        new THREE.LineBasicMaterial({ color: 0x8ab7c2, transparent: true, opacity: 0.42 })
      );
      tick.renderOrder = 6;
      scene.add(tick);
    }
  }

  function makeLocationTexture(kind) {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (kind === "core") {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 28);
      g.addColorStop(0.0, "rgba(255,255,255,1)");
      g.addColorStop(0.35, "rgba(210,255,255,0.98)");
      g.addColorStop(0.75, "rgba(120,240,255,0.75)");
      g.addColorStop(1.0, "rgba(120,240,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, 28, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(195,255,255,0.95)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, 18, 0, Math.PI * 2);
      ctx.stroke();
    } else if (kind === "pulse") {
      ctx.strokeStyle = "rgba(120,240,255,0.95)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, cy, 26, 0, Math.PI * 2);
      ctx.stroke();

      const g = ctx.createRadialGradient(cx, cy, 20, cx, cy, 42);
      g.addColorStop(0.0, "rgba(110,235,255,0.18)");
      g.addColorStop(1.0, "rgba(110,235,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, 42, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === "glow") {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 52);
      g.addColorStop(0.0, "rgba(120,240,255,0.26)");
      g.addColorStop(0.5, "rgba(120,240,255,0.11)");
      g.addColorStop(1.0, "rgba(120,240,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, 52, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === "alert-core") {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 30);
      g.addColorStop(0.0, "rgba(255,250,240,1)");
      g.addColorStop(0.30, "rgba(255,190,190,0.98)");
      g.addColorStop(0.70, "rgba(255,70,70,0.88)");
      g.addColorStop(1.0, "rgba(255,70,70,0)");
      ctx.fillStyle = g;
      ctx.fillRect(cx - 30, cy - 30, 60, 60);

      ctx.strokeStyle = "rgba(255,160,160,0.98)";
      ctx.lineWidth = 3;
      ctx.strokeRect(cx - 18, cy - 18, 36, 36);
    } else if (kind === "alert-pulse") {
      ctx.strokeStyle = "rgba(255,70,70,0.95)";
      ctx.lineWidth = 4;
      ctx.strokeRect(cx - 26, cy - 26, 52, 52);

      const g = ctx.createRadialGradient(cx, cy, 18, cx, cy, 46);
      g.addColorStop(0.0, "rgba(255,70,70,0.18)");
      g.addColorStop(1.0, "rgba(255,70,70,0)");
      ctx.fillStyle = g;
      ctx.fillRect(cx - 44, cy - 44, 88, 88);
    } else if (kind === "alert-glow") {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 54);
      g.addColorStop(0.0, "rgba(255,70,70,0.24)");
      g.addColorStop(0.55, "rgba(255,70,70,0.10)");
      g.addColorStop(1.0, "rgba(255,70,70,0)");
      ctx.fillStyle = g;
      ctx.fillRect(cx - 54, cy - 54, 108, 108);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    return texture;
  }

  function gridRefToPlacement(ref) {
    const col = ref.charCodeAt(0) - 65;
    const row = parseInt(ref.slice(1), 10) - 1;

    const tx = (col + 0.5) / GRID_COLS;
    const ty = (row + 0.5) / GRID_ROWS;

    return {
      tx,
      ty,
      x: -WORLD_W / 2 + tx * WORLD_W,
      z: -WORLD_D / 2 + ty * WORLD_D
    };
  }

  function lowestPointInGridCell(ref, data) {
    const col = ref.charCodeAt(0) - 65;
    const row = parseInt(ref.slice(1), 10) - 1;

    const tx0 = col / GRID_COLS;
    const tx1 = (col + 1) / GRID_COLS;
    const ty0 = row / GRID_ROWS;
    const ty1 = (row + 1) / GRID_ROWS;

    const x0 = Math.max(0, Math.floor(tx0 * (data.width - 1)));
    const x1 = Math.min(data.width - 1, Math.ceil(tx1 * (data.width - 1)));
    const y0 = Math.max(0, Math.floor(ty0 * (data.height - 1)));
    const y1 = Math.min(data.height - 1, Math.ceil(ty1 * (data.height - 1)));

    let bestX = x0;
    let bestY = y0;
    let bestH = Infinity;

    // Ignore the outermost edge of the cell a little bit, so the marker does not
    // snap exactly onto a grid border if a border pixel happens to be darker.
    const marginX = Math.max(1, Math.floor((x1 - x0) * 0.08));
    const marginY = Math.max(1, Math.floor((y1 - y0) * 0.08));

    for (let y = y0 + marginY; y <= y1 - marginY; y++) {
      for (let x = x0 + marginX; x <= x1 - marginX; x++) {
        const h = hAt(data, x, y);
        if (h < bestH) {
          bestH = h;
          bestX = x;
          bestY = y;
        }
      }
    }

    const tx = bestX / (data.width - 1);
    const ty = bestY / (data.height - 1);

    return {
      tx,
      ty,
      x: -WORLD_W / 2 + tx * WORLD_W,
      z: -WORLD_D / 2 + ty * WORLD_D,
      h: bestH
    };
  }

  function makeMarkerLabelSprite(text, options = {}) {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");

    const color = options.color || "rgba(150, 245, 255, 0.98)";
    const glow = options.glow || "rgba(90, 225, 255, 0.42)";

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = "bold 52px Monaco, Consolas, monospace";
    ctx.shadowColor = glow;
    ctx.shadowBlur = 16;
    ctx.fillStyle = color;
    ctx.fillText(text, 28, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      opacity: options.opacity || 0.94
    });

    const sprite = new THREE.Sprite(material);
    sprite.scale.set(options.scaleX || 1.45, options.scaleY || 0.29, 1);
    sprite.center.set(0, 0.5);
    sprite.renderOrder = 34;
    return sprite;
  }


  function sampleHeightBilinear(data, tx, ty) {
    const fx = Math.max(0, Math.min(data.width - 1, tx * (data.width - 1)));
    const fy = Math.max(0, Math.min(data.height - 1, ty * (data.height - 1)));
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const x1 = Math.min(data.width - 1, x0 + 1), y1 = Math.min(data.height - 1, y0 + 1);
    const dx = fx - x0, dy = fy - y0;

    const h00 = hAt(data, x0, y0);
    const h10 = hAt(data, x1, y0);
    const h01 = hAt(data, x0, y1);
    const h11 = hAt(data, x1, y1);

    const hx0 = h00 * (1 - dx) + h10 * dx;
    const hx1 = h01 * (1 - dx) + h11 * dx;
    return hx0 * (1 - dy) + hx1 * dy;
  }

  function makeHatchTexture(lineColor) {
    const canvas = document.createElement("canvas");
    canvas.width = 112;
    canvas.height = 112;
    const ctx = canvas.getContext("2d");

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.50;

    // Diagonal hatch pattern.
    // Important: 112px tile with 28px spacing creates a seamless repeat,
    // so the diagonal lines connect correctly when the texture tiles.
    ctx.beginPath();
    for (let i = -112; i <= 112; i += 28) {
      ctx.moveTo(i, 112);
      ctx.lineTo(i + 112, 0);
    }
    ctx.stroke();

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3.0, 3.0);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    if (renderer && renderer.capabilities) {
      tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    }
    return tex;
  }

  function makeZoneOverlayLabel(text, options = {}) {
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 140;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = "bold 54px Monaco, Consolas, monospace";
    ctx.shadowColor = options.glow || "rgba(255,255,255,0.35)";
    ctx.shadowBlur = 16;
    ctx.fillStyle = options.color || "rgba(255,255,255,0.95)";
    ctx.fillText(text, 24, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      opacity: 0.98
    });
    const sprite = new THREE.Sprite(material);
    sprite.center.set(0, 0.5);
    sprite.scale.set(options.scaleX || 1.9, options.scaleY || 0.32, 1);
    sprite.renderOrder = 24;
    return sprite;
  }

  function normalizedToWorld(nx, ny) {
    return {
      x: -WORLD_W / 2 + nx * WORLD_W,
      z: -WORLD_D / 2 + ny * WORLD_D
    };
  }

  function pointInPolygon2D(px, py, polygon) {
    // Ray-casting point-in-polygon test.
    // polygon is an array of THREE.Vector2 using x=worldX, y=worldZ.
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;

      const intersects = ((yi > py) !== (yj > py)) &&
        (px < ((xj - xi) * (py - yi)) / ((yj - yi) || 1e-9) + xi);

      if (intersects) inside = !inside;
    }
    return inside;
  }

  function addZoneOverlays(data) {
    const specs = [
      {
        name: "ZONE A",
        desc: "UNEXPLORED TERRITORY",
        color: 0x49d86b,
        labelColor: "rgba(125,255,150,0.98)",
        glow: "rgba(70,255,120,0.42)",
        lineColor: "rgba(85,245,120,0.52)",
        tension: 0.08,
        labelAt: [0.30, 0.085],
        points: [
          [0.00, 0.00], [0.16, 0.00], [0.34, 0.00], [0.56, 0.00], [0.78, 0.00], [1.00, 0.00],
          [1.00, 0.24], [1.00, 0.33], [1.00, 0.42], [1.00, 0.46], [1.00, 0.50], [0.975, 0.50],
          [0.945, 0.485], [0.915, 0.455], [0.885, 0.405], [0.855, 0.355], [0.825, 0.315], [0.79, 0.290],
          [0.74, 0.275], [0.69, 0.270], [0.64, 0.282], [0.59, 0.298], [0.54, 0.314], [0.49, 0.332],
          [0.43, 0.340], [0.37, 0.342], [0.31, 0.318], [0.26, 0.326], [0.21, 0.285], [0.17, 0.235],
          [0.14, 0.205], [0.11, 0.195], [0.08, 0.202], [0.05, 0.19], [0.02, 0.185], [0.00, 0.17]
        ]
      },
      {
        name: "ZONE D",
        desc: "BLACK DESERT",
        color: 0xb20e1a,
        labelColor: "rgba(255,92,102,0.99)",
        glow: "rgba(255,25,40,0.62)",
        lineColor: "rgba(255,40,52,0.82)",
        tension: 0.12,
        opacity: 0.34,
        outlineOpacity: 0.30,
        labelAt: [0.66, 0.62],
        points: [
          [0.43, 0.39], [0.53, 0.315], [0.66, 0.300], [0.77, 0.335], [0.84, 0.42], [0.90, 0.52],
          [0.96, 0.62], [0.95, 0.69], [0.91, 0.73], [0.86, 0.75], [0.81, 0.75], [0.76, 0.74],
          [0.72, 0.79], [0.67, 0.84], [0.61, 0.88], [0.54, 0.89], [0.48, 0.86], [0.44, 0.82],
          [0.42, 0.78], [0.405, 0.75], [0.395, 0.72], [0.39, 0.67], [0.39, 0.60], [0.40, 0.53],
          [0.41, 0.47]
        ]
      },
      {
        name: "ZONE B",
        desc: "AZTECHNOLOGY ACTIVITY",
        color: 0xf08cff,
        labelColor: "rgba(241,160,255,0.98)",
        glow: "rgba(232,120,255,0.42)",
        lineColor: "rgba(237,145,255,0.52)",
        labelAt: [0.84, 0.86],
        points: [
          [0.78, 0.78], [0.90, 0.78], [1.00, 0.82], [1.00, 0.93],
          [1.00, 1.00], [0.90, 1.00], [0.83, 0.98], [0.78, 0.93],
          [0.76, 0.86], [0.76, 0.80]
        ]
      },
      {
        name: "ZONE C",
        desc: "NATIVE INHABITANTS",
        color: 0x4ea0ff,
        labelColor: "rgba(110,180,255,0.98)",
        glow: "rgba(90,150,255,0.42)",
        lineColor: "rgba(90,165,255,0.50)",
        labelAt: [0.13, 0.72],
        points: [
          [0.07, 0.61], [0.24, 0.60], [0.35, 0.63], [0.39, 0.74],
          [0.37, 0.86], [0.28, 0.90], [0.14, 0.88], [0.08, 0.78], [0.06, 0.67]
        ]
      }
    ];

    zoneGroup = new THREE.Group();
    scene.add(zoneGroup);
    zoneMeshes = [];

    specs.forEach((spec, si) => {
      const worldPts3 = spec.points.map(([nx, ny]) => {
        const p = normalizedToWorld(nx, ny);
        return new THREE.Vector3(p.x, 0, p.z);
      });

      const curve = new THREE.CatmullRomCurve3(worldPts3, true, "catmullrom", spec.tension ?? 0.18);
      const smoothPts3 = curve.getPoints(Math.max(96, spec.points.length * 16));
      const smoothPts2 = smoothPts3.map(v => new THREE.Vector2(v.x, v.z));
      // Build the overlay from the terrain grid itself so the zone drapes across
      // every hill and mountain instead of getting cut off by higher terrain.
      const w = data.width;
      const h = data.height;
      const positions = new Float32Array(w * h * 3);
      const uvs = new Float32Array(w * h * 2);
      const indices = [];

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = idx(x, y, w);
          const wx = toWorldX(x, w);
          const wz = toWorldZ(y, h);
          const v = hAt(data, x, y);

          positions[i * 3] = wx;
          positions[i * 3 + 1] = elevY(v) + 0.055 + si * 0.0025;
          positions[i * 3 + 2] = wz;

          const tx = (wx / WORLD_W) + 0.5;
          const ty = (wz / WORLD_D) + 0.5;
          uvs[i * 2] = tx * 8.5;
          uvs[i * 2 + 1] = ty * 8.5;
        }
      }

      for (let y = 0; y < h - 1; y++) {
        for (let x = 0; x < w - 1; x++) {
          const cx = (toWorldX(x, w) + toWorldX(x + 1, w)) * 0.5;
          const cz = (toWorldZ(y, h) + toWorldZ(y + 1, h)) * 0.5;

          if (!pointInPolygon2D(cx, cz, smoothPts2)) continue;

          const a = idx(x, y, w);
          const b = idx(x + 1, y, w);
          const c0 = idx(x + 1, y + 1, w);
          const d = idx(x, y + 1, w);
          indices.push(a, b, d, b, c0, d);
        }
      }

      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geom.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
      geom.setIndex(indices);

      const hatchTex = makeHatchTexture(spec.lineColor);
      const mat = new THREE.MeshBasicMaterial({
        map: hatchTex,
        transparent: true,
        opacity: spec.opacity ?? 0.26,
        depthTest: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -6,
        polygonOffsetUnits: -6
      });

      const mesh = new THREE.Mesh(geom, mat);
      mesh.renderOrder = 8;
      zoneGroup.add(mesh);

      const outlinePoints = smoothPts2.map(v => {
        const tx = (v.x / WORLD_W) + 0.5;
        const ty = (v.y / WORLD_D) + 0.5;
        const hh = sampleHeightBilinear(data, tx, ty);
        return new THREE.Vector3(v.x, elevY(hh) + 0.060 + si * 0.0025, v.y);
      });
      const outlineCurve = new THREE.CatmullRomCurve3(outlinePoints, true, "catmullrom", 0.10);
      const outlineGeom = new THREE.TubeGeometry(outlineCurve, Math.max(64, outlinePoints.length * 2), 0.010, 6, true);
      const outlineMat = new THREE.MeshBasicMaterial({
        color: spec.color,
        transparent: true,
        opacity: spec.outlineOpacity ?? 0.24,
        depthTest: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const outline = new THREE.Mesh(outlineGeom, outlineMat);
      outline.renderOrder = 9;
      zoneGroup.add(outline);

      const lp = normalizedToWorld(spec.labelAt[0], spec.labelAt[1]);
      const lh = sampleHeightBilinear(data, spec.labelAt[0], spec.labelAt[1]);
      const label = makeZoneOverlayLabel(`${spec.name} · ${spec.desc}`, {
        color: spec.labelColor,
        glow: spec.glow,
        scaleX: spec.desc.length > 18 ? 2.35 : 2.0,
        scaleY: 0.31
      });
      label.position.set(lp.x, elevY(lh) + 0.090, lp.z);
      zoneGroup.add(label);

      zoneMeshes.push({ mesh, outline, label, baseOpacity: mat.opacity, baseOutlineOpacity: outlineMat.opacity, baseLabelOpacity: label.material.opacity });
    });
  }

  function addLocationMarkers(data) {
    const specs = [
      { grid: "B3", name: "Site BRE-01", style: "site" },
      { grid: "C5", name: "Site BRE-02", style: "site" },
      { grid: "E6", name: "Site BRE-03", style: "site" },
      { grid: "E8", name: "Site BRE-05", style: "site" },
      { grid: "G9", name: "Site BRE-06", style: "site" },
      { grid: "H6", name: "Site BRE-04", style: "site" },
      { grid: "G4", name: "Void", style: "alert", placeAtLowest: true },
      { grid: "J7", name: "Ruins", style: "alert" }
    ];

    locationsGroup = new THREE.Group();
    scene.add(locationsGroup);
    locationMarkers = [];

    const coreTex = makeLocationTexture("core");
    const pulseTex = makeLocationTexture("pulse");
    const glowTex = makeLocationTexture("glow");
    const alertCoreTex = makeLocationTexture("alert-core");
    const alertPulseTex = makeLocationTexture("alert-pulse");
    const alertGlowTex = makeLocationTexture("alert-glow");

    specs.forEach((spec, i) => {
      const p = spec.placeAtLowest ? lowestPointInGridCell(spec.grid, data) : gridRefToPlacement(spec.grid);
      const sampleX = Math.round(p.tx * (data.width - 1));
      const sampleY = Math.round(p.ty * (data.height - 1));
      const v = hAt(data, sampleX, sampleY);
      const y = elevY(v) + 0.010;

      const marker = new THREE.Group();
      marker.position.set(p.x, y, p.z);

      const isAlert = spec.style === "alert";
      const chosenGlowTex = isAlert ? alertGlowTex : glowTex;
      const chosenPulseTex = isAlert ? alertPulseTex : pulseTex;
      const chosenCoreTex = isAlert ? alertCoreTex : coreTex;

      const stemHeight = isAlert ? 0.24 : 0.20;
      const glowBaseScale = isAlert ? 0.50 : 0.40;
      const pulseBaseScale = isAlert ? 0.29 : 0.22;
      const coreBaseScale = isAlert ? 0.155 : 0.145;

      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: chosenGlowTex,
        transparent: true,
        opacity: isAlert ? 0.28 : 0.24,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      }));
      glow.position.set(0, stemHeight, 0);
      glow.scale.set(glowBaseScale, glowBaseScale, 1);
      glow.renderOrder = 30;
      marker.add(glow);

      const pulse = new THREE.Sprite(new THREE.SpriteMaterial({
        map: chosenPulseTex,
        transparent: true,
        opacity: isAlert ? 0.62 : 0.58,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      }));
      pulse.position.set(0, stemHeight, 0);
      pulse.scale.set(pulseBaseScale, pulseBaseScale, 1);
      pulse.renderOrder = 31;
      marker.add(pulse);

      const core = new THREE.Sprite(new THREE.SpriteMaterial({
        map: chosenCoreTex,
        transparent: true,
        opacity: 1.0,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      }));
      core.position.set(0, stemHeight, 0);
      core.scale.set(coreBaseScale, coreBaseScale, 1);
      core.renderOrder = 32;
      marker.add(core);

      const label = makeMarkerLabelSprite(spec.name, isAlert ? {
        color: "rgba(255, 120, 120, 0.98)",
        glow: "rgba(255, 70, 70, 0.46)",
        opacity: 0.96,
        scaleX: 1.15,
        scaleY: 0.30
      } : {
        color: "rgba(150, 245, 255, 0.98)",
        glow: "rgba(90, 225, 255, 0.48)",
        opacity: 0.96,
        scaleX: 1.55,
        scaleY: 0.30
      });
      label.position.set(0.12, stemHeight + 0.028, 0);
      marker.add(label);

      const stemGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0.0, 0),
        new THREE.Vector3(0, stemHeight - 0.018, 0)
      ]);
      const stemMat = new THREE.LineBasicMaterial({
        color: isAlert ? 0xff5a5a : 0x98f4ff,
        transparent: true,
        opacity: 0.72,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const stem = new THREE.Line(stemGeom, stemMat);
      stem.renderOrder = 29;
      marker.add(stem);

      marker.userData = {
        phase: i * 0.8,
        pulse,
        glow,
        core,
        label,
        stemHeight,
        pulseBaseScale,
        glowBaseScale,
        style: spec.style,
        name: spec.name,
        grid: spec.grid
      };

      locationsGroup.add(marker);
      locationMarkers.push(marker);
    });
  }

  function makeCommDotTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 96;
    const ctx = canvas.getContext("2d");
    const cx = canvas.width * 0.5;
    const cy = canvas.height * 0.5;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 34);
    glow.addColorStop(0.0, "rgba(225,255,255,1)");
    glow.addColorStop(0.28, "rgba(150,245,255,0.98)");
    glow.addColorStop(0.65, "rgba(90,225,255,0.82)");
    glow.addColorStop(1.0, "rgba(90,225,255,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, 34, 0, Math.PI * 2);
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    return tex;
  }

  function addAnomalySensor(data) {
    const voidLow = lowestPointInGridCell("G4", data);
    const centerTx = voidLow.tx;
    const centerTy = voidLow.ty;
    const centerX = voidLow.x;
    const centerZ = voidLow.z;

    anomalyGroup = new THREE.Group();
    scene.add(anomalyGroup);
    anomalyWaves = [];

    for (let i = 0; i < 4; i++) {
      const geom = new THREE.BufferGeometry();
      const mat = new THREE.LineBasicMaterial({
        color: 0xd35cff,
        transparent: true,
        opacity: 0.0,
        depthTest: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const line = new THREE.LineLoop(geom, mat);
      line.renderOrder = 28;
      anomalyGroup.add(line);

      anomalyWaves.push({
        line,
        phase: i / 4,
        centerTx,
        centerTy,
        centerX,
        centerZ
      });
    }
  }

  function updateAnomalySensor(data, elapsed) {
    if (!anomalyGroup || !anomalyGroup.visible) return;

    const segs = 56;

    for (const wave of anomalyWaves) {
      const cycle = (elapsed * 0.17 + wave.phase) % 1;
      const eased = cycle * cycle * (3 - 2 * cycle);
      const radius = 0.10 + eased * 1.10;
      const amp = Math.sin(cycle * Math.PI);
      const opacity = 0.18 + amp * 0.34;

      const pts = [];
      for (let i = 0; i < segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        const wobble = 1.0 + 0.05 * Math.sin(a * 3.0 + elapsed * 0.8);
        const rx = radius * wobble;
        const rz = radius * wobble;

        const tx = Math.max(0, Math.min(1, wave.centerTx + (Math.cos(a) * rx) / WORLD_W));
        const ty = Math.max(0, Math.min(1, wave.centerTy + (Math.sin(a) * rz) / WORLD_D));
        const wx = -WORLD_W / 2 + tx * WORLD_W;
        const wz = -WORLD_D / 2 + ty * WORLD_D;
        const hh = sampleHeightBilinear(data, tx, ty);

        pts.push(new THREE.Vector3(wx, elevY(hh) + 0.024, wz));
      }

      wave.line.geometry.setFromPoints(pts);
      wave.line.material.opacity = opacity;
    }
  }

  function addSiteConnections() {
    const siteByName = Object.create(null);
    for (const marker of locationMarkers) {
      if (marker.userData.style === "site") {
        siteByName[marker.userData.name] = marker;
      }
    }

    const specs = [
      { from: "Site BRE-01", to: "Site BRE-02", bidirectional: true },
      { from: "Site BRE-02", to: "Site BRE-03", bidirectional: true },
      { from: "Site BRE-03", to: "Site BRE-04", bidirectional: true },
      { from: "Site BRE-03", to: "Site BRE-05", bidirectional: true },
      { from: "Site BRE-05", to: "Site BRE-06", bidirectional: true },
      { from: "Site BRE-06", to: "Site BRE-04", bidirectional: false }
    ];

    networkGroup = new THREE.Group();
    locationsGroup.add(networkGroup);
    siteLinks = [];

    function makeEndpoint(marker) {
      return marker.position.clone().add(new THREE.Vector3(0, marker.userData.stemHeight, 0));
    }

    function addPulse(start, end, phase, speed, trail, segmentCount) {
      const segments = [];
      for (let s = 0; s < segmentCount; s++) {
        const segGeom = new THREE.BufferGeometry().setFromPoints([start, start]);
        const segMat = new THREE.LineBasicMaterial({
          color: 0x98f4ff,
          transparent: true,
          opacity: 0.0,
          depthTest: false,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        });
        const segLine = new THREE.Line(segGeom, segMat);
        segLine.renderOrder = 37 + s;
        networkGroup.add(segLine);
        segments.push(segLine);
      }

      siteLinks.push({
        start: start.clone(),
        end: end.clone(),
        phase,
        speed,
        trail,
        segmentCount,
        segments
      });
    }

    specs.forEach((spec, i) => {
      const fromMarker = siteByName[spec.from];
      const toMarker = siteByName[spec.to];
      if (!fromMarker || !toMarker) return;

      const a = makeEndpoint(fromMarker);
      const b = makeEndpoint(toMarker);

      // Static connection line: keep it faint so the animated directional trail reads clearly.
      const baseGeom = new THREE.BufferGeometry().setFromPoints([a, b]);
      const baseMat = new THREE.LineBasicMaterial({
        color: 0x98f4ff,
        transparent: true,
        opacity: 0.10,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const baseLine = new THREE.Line(baseGeom, baseMat);
      baseLine.renderOrder = 35;
      networkGroup.add(baseLine);

      const glowGeom = new THREE.BufferGeometry().setFromPoints([a, b]);
      const glowMat = new THREE.LineBasicMaterial({
        color: 0x98f4ff,
        transparent: true,
        opacity: 0.035,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const glowLine = new THREE.Line(glowGeom, glowMat);
      glowLine.renderOrder = 34;
      networkGroup.add(glowLine);

      addPulse(a, b, i * 0.19, 0.22, 0.18, 7);

      if (spec.bidirectional) {
        addPulse(b, a, 0.50 + i * 0.19, 0.22, 0.18, 7);
      }
    });
  }

  function startPresentationView(targetPos, targetLook) {
    cameraTween = {
      start: performance.now(),
      duration: 950,
      fromPos: camera.position.clone(),
      fromTarget: controls.target.clone(),
      toPos: targetPos.clone(),
      toTarget: targetLook.clone()
    };
    requestMapFrame();
  }

  function handleResize() {
    if (!camera || !renderer || mapDisposed) return;
    W = wrap.clientWidth;
    H = wrap.clientHeight;
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    renderer.setSize(W, H);
    requestMapFrame();
  }

  function bindUI() {
    btnMenu.addEventListener("click", () => {
      const collapsed = controlPanel.classList.toggle("collapsed");
      btnMenu.classList.toggle("active", !collapsed);
      btnMenu.setAttribute("aria-expanded", collapsed ? "false" : "true");
    });

    btnRotate.addEventListener("click", () => {
      controls.autoRotate = !controls.autoRotate;
      btnRotate.classList.toggle("active", controls.autoRotate);
      requestMapFrame();
    });

    btnScan.addEventListener("click", () => {
      scanEnabled = !scanEnabled;
      btnScan.classList.toggle("active", scanEnabled);
      if (!scanEnabled) {
        layers.forEach(l => l.mat.opacity = l.baseOpacity);
      }
      requestMapFrame();
    });

    btnSurface.addEventListener("click", () => {
      surfaceMesh.visible = !surfaceMesh.visible;
      btnSurface.classList.toggle("active", surfaceMesh.visible);
      requestMapFrame();
    });

    btnContours.addEventListener("click", () => {
      contourGroup.visible = !contourGroup.visible;
      btnContours.classList.toggle("active", contourGroup.visible);
      requestMapFrame();
    });

    btnLocations.addEventListener("click", () => {
      locationsGroup.visible = !locationsGroup.visible;
      btnLocations.classList.toggle("active", locationsGroup.visible);
      if (networkGroup) networkGroup.visible = btnNetwork.classList.contains("active") && locationsGroup.visible;
      requestMapFrame();
    });

    btnZones.addEventListener("click", () => {
      zoneGroup.visible = !zoneGroup.visible;
      btnZones.classList.toggle("active", zoneGroup.visible);
      requestMapFrame();
    });

    btnNetwork.addEventListener("click", () => {
      const nextVisible = !networkGroup.visible;
      networkGroup.visible = nextVisible;
      btnNetwork.classList.toggle("active", nextVisible);
      if (nextVisible && !locationsGroup.visible) {
        locationsGroup.visible = true;
        btnLocations.classList.add("active");
      }
      requestMapFrame();
    });

    btnAnomaly.addEventListener("click", () => {
      anomalyGroup.visible = !anomalyGroup.visible;
      btnAnomaly.classList.toggle("active", anomalyGroup.visible);
      requestMapFrame();
    });

    btnTop.addEventListener("click", () => {
      controls.autoRotate = false;
      btnRotate.classList.remove("active");
      camera.position.set(0, 7.0, 0.001);
      controls.target.set(0, 0.20, 0);
      controls.update();
      requestMapFrame();
    });

    btnIso.addEventListener("click", () => {
      camera.position.set(8.7, 3.3, 8.0);
      controls.target.set(0, 0.26, 0);
      controls.update();
      requestMapFrame();
    });

    btnPresent.addEventListener("click", () => {
      controls.autoRotate = false;
      btnRotate.classList.remove("active");
      startPresentationView(
        new THREE.Vector3(7.6, 5.15, 7.35),
        new THREE.Vector3(0.28, 0.34, 0.18)
      );
    });

    window.addEventListener("resize", handleResize);
  }

  const clock = new THREE.Clock();
  let lastRenderTime = 0;

  function animate(now) {
    animationFrameId = 0;
    if (mapDisposed || mapPaused || document.hidden || !renderer) return;

    if (now - lastRenderTime < mapProfile.frameMs) {
      requestMapFrame();
      return;
    }
    lastRenderTime = now;

    if (cameraTween) {
      const tt = Math.min(1, (performance.now() - cameraTween.start) / cameraTween.duration);
      const eased = 1 - Math.pow(1 - tt, 3);
      camera.position.lerpVectors(cameraTween.fromPos, cameraTween.toPos, eased);
      controls.target.lerpVectors(cameraTween.fromTarget, cameraTween.toTarget, eased);
      if (tt >= 1) cameraTween = null;
    }

    controls.update();

    const elapsed = clock.getElapsedTime();

    let zoneAfterglow = 0;

    if (scanEnabled && mapProfile.scan) {
      const cycle = (elapsed * 0.33) % 1.28;
      const scan = cycle - 0.12;

      layers.forEach(l => {
        const dy = Math.abs(l.level - scan);
        const boost = Math.max(0, 1 - dy * 10.0);
        l.mat.opacity = Math.min(1, l.baseOpacity + boost * (IS_FIREFOX ? 0.55 : 0.9));
      });

      // After the contour sweep finishes, trigger a brief zone glow-up
      // lasting well under a second.
      const glowStart = 1.02;
      const glowEnd = 1.24;
      if (cycle >= glowStart && cycle <= glowEnd) {
        const t = (cycle - glowStart) / (glowEnd - glowStart);
        zoneAfterglow = Math.sin(t * Math.PI);
      }
    }

    if (zoneGroup && zoneGroup.visible) {
      for (const z of zoneMeshes) {
        z.mesh.material.opacity = Math.min(1, z.baseOpacity + zoneAfterglow * 0.12);
        z.outline.material.opacity = Math.min(1, z.baseOutlineOpacity + zoneAfterglow * 0.10);
        z.label.material.opacity = Math.min(1, z.baseLabelOpacity + zoneAfterglow * 0.05);
      }
    }

    // Tiny CRT instability. Disabled in Firefox because Firefox is more sensitive to per-frame transparency work here.
    const flicker = IS_FIREFOX ? 1 : 0.98 + Math.sin(elapsed * 17.0) * 0.015;
    if (surfaceMesh) surfaceMesh.material.opacity = surfaceMesh.visible ? (IS_FIREFOX ? 0.10 : 0.18) * flicker : 0;

    if (anomalyGroup && anomalyGroup.visible) {
      updateAnomalySensor(heightDataRef, elapsed);
    }

    if (locationsGroup && locationsGroup.visible) {
      if (mapProfile.markerPulse) for (const marker of locationMarkers) {
        const phase = elapsed * 2.1 + marker.userData.phase;
        const wave = 0.5 + 0.5 * Math.sin(phase);
        marker.userData.pulse.scale.setScalar(marker.userData.pulseBaseScale + wave * 0.11);
        marker.userData.pulse.material.opacity = 0.24 + wave * 0.34;
        marker.userData.glow.scale.setScalar(marker.userData.glowBaseScale + wave * 0.08);
        marker.userData.glow.material.opacity = 0.10 + wave * 0.10;
      }

      if (networkGroup && networkGroup.visible && mapProfile.routeAnimation) for (const link of siteLinks) {
        const progress = (elapsed * link.speed + link.phase) % 1;
        const overall = 0.98 + 0.22 * Math.sin(progress * Math.PI);

        for (let s = 0; s < link.segmentCount; s++) {
          const segHeadT = progress - (s / link.segmentCount) * link.trail;
          const segTailT = progress - ((s + 1) / link.segmentCount) * link.trail;
          const line = link.segments[s];

          if (segHeadT <= 0) {
            line.material.opacity = 0.0;
            line.geometry.setFromPoints([link.start, link.start]);
            continue;
          }

          const clampedHead = Math.max(0, Math.min(1, segHeadT));
          const clampedTail = Math.max(0, Math.min(1, segTailT));

          const headPos = new THREE.Vector3().lerpVectors(link.start, link.end, clampedHead);
          const tailPos = new THREE.Vector3().lerpVectors(link.start, link.end, clampedTail);

          line.geometry.setFromPoints([tailPos, headPos]);

          // Brightest at the front, fading away toward the back.
          const frontBias = 1 - (s / link.segmentCount);
          line.material.opacity = Math.min(1, (0.14 + frontBias * 0.42) * overall);
        }
      }
    }

    renderer.render(scene, camera);
    if (!mapProfile.staticRender) requestMapFrame();
  }
})();
