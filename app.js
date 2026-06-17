const $ = (id) => document.getElementById(id);

const dropZone = $("dropZone");
const fileInput = $("fileInput");
const folderInput = $("folderInput");
const bgSelect = $("bgSelect");
const contentSelect = $("contentSelect");
const scanAreaButton = $("scanAreaButton");
const scanButton = $("scanButton");
const nextCandidateButton = $("nextCandidateButton");
const clearScanAreasButton = $("clearScanAreasButton");
const addPointButton = $("addPointButton");
const deletePointButton = $("deletePointButton");
const resetButton = $("resetButton");
const guideToggle = $("guideToggle");
const zoomSlider = $("zoomSlider");
const opacitySlider = $("opacitySlider");
const brightnessSlider = $("brightnessSlider");
const blendModeSelect = $("blendModeSelect");

const stage = $("stage");
const bgImg = $("bgImg");
const mapped = $("mapped");
const mapImg = $("mapImg");
const mapVideo = $("mapVideo");
const overlay = $("overlay");
const poly = $("poly");
const clipPathData = $("clipPathData");
const scanRect = $("scanRect");
const scanCanvas = $("scanCanvas");

const fileList = $("fileList");
const bgInfo = $("bgInfo");
const contentInfo = $("contentInfo");
const modeInfo = $("modeInfo");

const files = [];
let bgUrl = "";
let contentUrl = "";
let zoom = 1;
let mode = "move";
let selectedPoint = -1;
let dragPoint = -1;
let scanStart = null;
let currentScanBox = null;
let scanBoxes = [];
let scanCandidates = [];
let candidateIndex = 0;

// 🟢 [2D 전환] 순수 2D 눈속임 워프 엔진용 전역 변수
let canvas2d, ctx2d, currentFacadeSource;

// ✅ 4채널 이머시브 독립 미디어 레이어 구조 정의
let mappingLayers = [
  { id: "Wall A", source: null, warpPoints: [], maskPoints: [], warpOrigPoints: [] },
  { id: "Wall B", source: null, warpPoints: [], maskPoints: [], warpOrigPoints: [] },
  { id: "Wall C", source: null, warpPoints: [], maskPoints: [], warpOrigPoints: [] },
  { id: "Wall D", source: null, warpPoints: [], maskPoints: [], warpOrigPoints: [] }
];
let activeLayerIndex = 0;

// 마스크 전용 데이터와 워프 전용 데이터 격리 연동 핸들러 변수
let maskPoints = [];
let warpPoints = [];
let warpOrigPoints = [];
let points = warpPoints;

window.addEventListener('DOMContentLoaded', () => {
  init();
});

function init() {
  fitDefaultPoints();
  bindFileEvents();
  bindUiEvents();
  bindStageEvents();
  refreshLists();

  initThree(); // 2D 도화지 레이어 초기화

  setTimeout(() => {
    if (typeof cv !== 'undefined') {
      modeInfo.textContent = "대기 (AI 엔진 로드 완료)";
    }
  }, 2000);
  
  render();
}

function bindFileEvents() {
  fileInput.onchange = (e) => {
    addFiles([...e.target.files]);
    fileInput.value = "";
  };
  folderInput.onchange = (e) => {
    addFiles([...e.target.files]);
    folderInput.value = "";
  };
  ["dragenter", "dragover"].forEach((name) => {
    window.addEventListener(name, (e) => {
      e.preventDefault();
      dropZone.classList.add("over");
    });
  });
  ["dragleave", "drop"].forEach((name) => {
    window.addEventListener(name, (e) => {
      e.preventDefault();
      if (name === "drop") handleDrop(e);
      dropZone.classList.remove("over");
    });
  });
}

async function handleDrop(e) {
  const dropped = [];
  const items = [...(e.dataTransfer.items || [])];
  if (items.length && items[0].webkitGetAsEntry) {
    for (const item of items) {
      const entry = item.webkitGetAsEntry();
      if (entry) dropped.push(...await readEntry(entry));
    }
  } else {
    dropped.push(...(e.dataTransfer.files || []));
  }
  addFiles(dropped);
}

function bindUiEvents() {
  bgSelect.onchange = () => files[+bgSelect.value] && setBackground(files[+bgSelect.value]);
  contentSelect.onchange = () => files[+contentSelect.value] && setContent(files[+contentSelect.value]);

  // 라디오 버튼 모드 체인지 연동
  const modeWarp = document.getElementById("modeWarp");
  const modeMask = document.getElementById("modeMask");
  const switchEditMode = () => {
    if (modeMask && modeMask.checked) {
      points = maskPoints;
      modeInfo.textContent = "영역 마스크 편집 모드 (자르기)";
    } else {
      points = warpPoints;
      modeInfo.textContent = "파사드 워프 편집 모드 (에펙 매쉬)";
    }
    selectedPoint = -1;
    render();
  };
  if (modeWarp) modeWarp.onchange = switchEditMode;
  if (modeMask) modeMask.onchange = switchEditMode;

  scanAreaButton.onclick = () => {
    mode = mode === "scanArea" ? "move" : "scanArea";
    modeInfo.textContent = mode === "scanArea" ? "스캔 영역 드래그" : "이동";
  };

  scanButton.onclick = () => { scanCurrentArea(); };

  nextCandidateButton.onclick = () => {
    if (!scanCandidates.length) return;
    candidateIndex = (candidateIndex + 1) % scanCandidates.length;
    applyCandidate(candidateIndex);
  };

  clearScanAreasButton.onclick = () => {
    scanBoxes = []; currentScanBox = null; scanCandidates = []; candidateIndex = 0;
    modeInfo.textContent = "스캔 영역 초기화";
    render();
  };

  addPointButton.onclick = () => {
    mode = mode === "add" ? "move" : "add";
    modeInfo.textContent = mode === "add" ? "포인트 추가" : "이동";
    render();
  };

  deletePointButton.onclick = () => {
    if (selectedPoint >= 0 && points.length > 4) {
      points.splice(selectedPoint, 1);
      selectedPoint = -1;
      if (points.length <= 4) points = sortClockwise(points);
      render();
      updateMappedArea();
    }
  };

  resetButton.onclick = () => {
    fitDefaultPoints();
    selectedPoint = -1; currentScanBox = null; scanBoxes = []; scanCandidates = []; candidateIndex = 0;
    modeInfo.textContent = "초기화";
    render();
    updateMappedArea();
  };

  guideToggle.onchange = () => { stage.classList.toggle("hide-guides", !guideToggle.checked); };
  zoomSlider.oninput = () => { zoom = +zoomSlider.value / 100; stage.style.transform = `scale(${zoom})`; };

  // 🌟 실시간 색감/블렌딩 스타일 연동
  const updateMediaStyle = () => {
    const target = mapVideo.style.display === "block" ? mapVideo : mapImg;
    target.style.opacity = "0.001"; 
    target.style.mixBlendMode = blendModeSelect.value;
    
    if (canvas2d) {
      canvas2d.style.mixBlendMode = blendModeSelect.value;
    }
  };

  opacitySlider.oninput = updateMediaStyle;
  brightnessSlider.oninput = updateMediaStyle;
  blendModeSelect.onchange = updateMediaStyle;

  window.updateMediaStyle = updateMediaStyle;
  window.addEventListener("keydown", handleKeyMove);
}

function bindStageEvents() {
  stage.addEventListener("pointerdown", (e) => {
    const pos = getStagePos(e);
    if (mode === "scanArea") {
      scanStart = pos;
      currentScanBox = { x: pos.x, y: pos.y, w: 1, h: 1 };
      render();
      return;
    }

    if (mode === "add" && e.target === overlay) {
      points.push(pos);
      const modeMask = $("modeMask");
      const isMaskMode = modeMask && modeMask.checked;

      if (isMaskMode) {
        points = sortClockwise(points);
        maskPoints = points;
      } else {
        if (points.length <= 4) {
          points = sortClockwise(points);
        } else {
          warpOrigPoints[points.length - 1] = { x: pos.x, y: pos.y };
        }
        warpPoints = points;
      }

      selectedPoint = points.length - 1;
      render();
      updateMappedArea();
    }
  });

  stage.addEventListener("pointermove", (e) => {
    if (scanStart) {
      const pos = getStagePos(e);
      currentScanBox = normalizeBox(scanStart, pos);
      render();
    }

    if (dragPoint >= 0) {
      const currentPos = getStagePos(e);
      points[dragPoint] = currentPos;
      selectedPoint = dragPoint;

      const pathString = "M " + points.map(p => `${p.x},${p.y}`).join(" L ") + " Z";
      poly.setAttribute("d", pathString);

      const visualHandles = stage.querySelectorAll(".pt");
      if (visualHandles[dragPoint]) {
        visualHandles[dragPoint].style.left = `${currentPos.x}px`;
        visualHandles[dragPoint].style.top = `${currentPos.y}px`;
      }

      updateMappedArea();
    }
  });

  stage.addEventListener("pointerup", () => {
    if (scanStart) {
      if (currentScanBox && currentScanBox.w > 12 && currentScanBox.h > 12) {
        scanBoxes.push(currentScanBox);
      }
      modeInfo.textContent = `스캔 영역 ${scanBoxes.length}개 지정됨`;
      scanStart = null;
      currentScanBox = null;
    }
    if (dragPoint >= 0) {
      render();
    }
    dragPoint = -1;
  });
}

function addFiles(newFiles) {
  const valid = newFiles.filter((file) => file && (file.type.startsWith("image/") || file.type.startsWith("video/")));
  valid.forEach((file) => {
    const exists = files.some((item) => item.name === file.name && item.size === file.size);
    if (!exists) files.push(file);
  });
  refreshLists();
  autoApplyFiles();
}

function refreshLists() {
  bgSelect.innerHTML = '<option value="">배경 선택</option>';
  contentSelect.innerHTML = '<option value="">콘텐츠 선택</option>';
  fileList.innerHTML = "";
  files.forEach((file, index) => {
    const type = file.type.startsWith("video/") ? "VIDEO" : "IMAGE";
    const name = file.webkitRelativePath || file.name;
    const label = `${type} - ${name}`;
    if (file.type.startsWith("image/")) bgSelect.add(new Option(label, index));
    contentSelect.add(new Option(label, index));
    const row = document.createElement("div");
    row.textContent = label;
    fileList.appendChild(row);
  });
}

function autoApplyFiles() {
  const firstImage = files.findIndex((f) => f.type.startsWith("image/"));
  const firstContent = files.findIndex((f, i) => i !== firstImage);
  if (!bgImg.getAttribute("src") && firstImage >= 0) {
    bgSelect.value = firstImage;
    setBackground(files[firstImage]);
  }
  if (!contentUrl) {
    const index = firstContent >= 0 ? firstContent : firstImage;
    if (index >= 0) {
      contentSelect.value = index;
      setContent(files[index]);
    }
  }
}

function setBackground(file) {
  if (bgUrl) URL.revokeObjectURL(bgUrl);
  bgUrl = URL.createObjectURL(file);
  
  bgImg.onload = () => {
    const w = bgImg.naturalWidth; 
    const h = bgImg.naturalHeight;

    stage.style.width = `${w}px`;
    stage.style.height = `${h}px`;
    
    requestAnimationFrame(() => {
      const parentContainer = stage.parentElement; 
      const padding = 80; 
      const availableWidth = parentContainer.clientWidth - padding;
      const scale = Math.min(availableWidth / w, 1);
      
      zoom = scale;
      zoomSlider.value = zoom * 100;
      
      stage.style.transform = `scale(${zoom})`;
      stage.style.transformOrigin = "0 0"; 

      overlay.setAttribute("width", w);
      overlay.setAttribute("height", h);
      overlay.setAttribute("viewBox", `0 0 ${w} ${h}`);
      
      bgInfo.textContent = file.name;
      fitDefaultPoints();
      enableButtons();
      render();
      updateMappedArea();

      const webglBox = $("webgl-container");
      if (webglBox) {
        webglBox.style.width = `${w}px`;
        webglBox.style.height = `${h}px`;
      }
      if (canvas2d) {
        canvas2d.width = w;
        canvas2d.height = h;
      }
    });
  };
  
  bgImg.src = bgUrl;
}

function setContent(file) {
  let url = URL.createObjectURL(file);
  let mediaEl;

  if (file.type.startsWith("video/")) {
    mediaEl = document.createElement("video");
    mediaEl.src = url;
    mediaEl.muted = true;
    mediaEl.loop = true;
    mediaEl.playsInline = true;
    mediaEl.style.visibility = "hidden";
    mediaEl.style.position = "absolute";
    mediaEl.onloadedmetadata = () => {
      initOrUpdateFacadeMesh(mediaEl, true);
    };
    mediaEl.play().catch(() => {});
  } else {
    mediaEl = document.createElement("img");
    mediaEl.src = url;
    mediaEl.onload = () => {
      initOrUpdateFacadeMesh(mediaEl, false);
    };
  }
  
  mappingLayers[activeLayerIndex].source = mediaEl;
  contentInfo.textContent = `${mappingLayers[activeLayerIndex].id}: ${file.name}`;
}

function enableButtons() {
  [
    scanAreaButton,
    scanButton,
    nextCandidateButton,
    clearScanAreasButton,
    addPointButton,
    deletePointButton,
    resetButton
  ].forEach((b) => b.disabled = false);
}

function fitDefaultPoints() {
  const w = bgImg.naturalWidth || 800;
  const h = bgImg.naturalHeight || 600;
  
  // ✅ 4개 독립 채널 메모리 공간 초기화 및 독립 마스크 범위 부여
  mappingLayers.forEach((layer) => {
    layer.maskPoints = [
      { x: 0, y: 0 }, { x: w, y: 0 },
      { x: w, y: h }, { x: 0, y: h }
    ];
    layer.warpPoints = [
      { x: w * 0.2, y: h * 0.22 }, { x: w * 0.8, y: h * 0.22 },
      { x: w * 0.8, y: h * 0.78 }, { x: w * 0.2, y: h * 0.78 }
    ];
    layer.warpOrigPoints = [];
  });

  syncActiveLayerData();
}

function syncActiveLayerData() {
  const layer = mappingLayers[activeLayerIndex];
  warpPoints = layer.warpPoints;
  maskPoints = layer.maskPoints;
  warpOrigPoints = layer.warpOrigPoints;
  
  const modeMask = document.getElementById("modeMask");
  points = (modeMask && modeMask.checked) ? maskPoints : warpPoints;
}

// ✅ 글로벌 스위칭 인터페이스 제어 장치 추가
window.switchLayer = function(index) {
  mappingLayers[activeLayerIndex].warpPoints = warpPoints;
  mappingLayers[activeLayerIndex].maskPoints = maskPoints;
  mappingLayers[activeLayerIndex].warpOrigPoints = warpOrigPoints;
  
  activeLayerIndex = index;
  syncActiveLayerData();
  
  document.querySelectorAll('.layer-btn').forEach((btn, i) => {
    btn.style.background = (i === index) ? "#3b82f6" : "";
  });
  
  selectedPoint = -1;
  render();
  updateMappedArea();
};

function render() {
  stage.querySelectorAll(".pt").forEach((el) => el.remove());

  if (points.length > 0) {
    const pathString = "M " + points.map(p => `${p.x},${p.y}`).join(" L ") + " Z";
    poly.setAttribute("d", pathString);
  }

  overlay.querySelectorAll(".scan-hint").forEach(el => el.remove());

  scanBoxes.forEach((box) => {
    const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    r.setAttribute("class", "scan-hint");
    r.setAttribute("x", box.x); r.setAttribute("y", box.y);
    r.setAttribute("width", box.w); r.setAttribute("height", box.h);
    overlay.appendChild(r);
  });

  if (currentScanBox) {
    scanRect.style.display = "block";
    scanRect.setAttribute("x", currentScanBox.x); scanRect.setAttribute("y", currentScanBox.y);
    scanRect.setAttribute("width", currentScanBox.w); scanRect.setAttribute("height", currentScanBox.h);
  } else {
    scanRect.style.display = "none";
  }

  points.forEach((point, index) => {
    const handle = document.createElement("button");
    handle.className = "pt";
    if (index === selectedPoint) handle.classList.add("selected");
    handle.style.left = `${point.x}px`;
    handle.style.top = `${point.y}px`;
    handle.onpointerdown = (e) => {
      e.stopPropagation();
      selectedPoint = index;
      dragPoint = index;
      render();
    };
    stage.appendChild(handle);
  });
}

function updateMappedArea() {
  if (!bgImg.src || !ctx2d || !canvas2d) return;

  // 1. 도화지 리셋 (멀티패스 렌더링 시작 전 단 한 번만 수행)
  ctx2d.clearRect(0, 0, canvas2d.width, canvas2d.height);

  if (mappingLayers[activeLayerIndex]) {
    mappingLayers[activeLayerIndex].warpPoints = warpPoints;
    mappingLayers[activeLayerIndex].maskPoints = maskPoints;
    mappingLayers[activeLayerIndex].warpOrigPoints = warpOrigPoints;
  }

  // 2. 4채널 레이어 배열을 순회하며 다중 컴포지션 연산 실행
  mappingLayers.forEach((layer) => {
    const target = layer.source;
    if (!target) return;
    if (target.tagName === "VIDEO" && target.readyState < 2) return;

    const w = target.videoWidth || target.naturalWidth || 800;
    const h = target.videoHeight || target.naturalHeight || 600;

    ctx2d.save();

    // ✅ 독립 마스크 오려내기 기능 원상 복구 및 가동
    if (layer.maskPoints && layer.maskPoints.length > 2) {
      ctx2d.beginPath();
      ctx2d.moveTo(layer.maskPoints[0].x, layer.maskPoints[0].y);
      for (let i = 1; i < layer.maskPoints.length; i++) {
        ctx2d.lineTo(layer.maskPoints[i].x, layer.maskPoints[i].y);
      }
      ctx2d.closePath();
      ctx2d.clip();
    }

    ctx2d.globalAlpha = opacitySlider.value / 100;
    ctx2d.filter = `brightness(${brightnessSlider.value / 100})`;

    const COLS = 32;
    const ROWS = 32;
    const grid = [];

    const ordered = orderQuad(layer.warpPoints.slice(0, 4));
    const tl = ordered[0]; const tr = ordered[1];
    const br = ordered[2]; const bl = ordered[3];

    for (let r = 0; r <= ROWS; r++) {
      grid[r] = [];
      const v = r / ROWS;
      for (let c = 0; c <= COLS; c++) {
        const u = c / COLS;

        const topX = tl.x * (1 - u) + tr.x * u;
        const topY = tl.y * (1 - u) + tr.y * u;
        const botX = bl.x * (1 - u) + br.x * u;
        const botY = bl.y * (1 - u) + br.y * u;

        let sx = topX * (1 - v) + botX * v;
        let sy = topY * (1 - v) + botY * v;

        if (layer.warpPoints.length > 4) {
          let totalWeight = 0; let deltaX = 0; let deltaY = 0;
          for (let j = 4; j < layer.warpPoints.length; j++) {
            const origPin = layer.warpOrigPoints[j];
            const curPin = layer.warpPoints[j];
            if (!origPin || !curPin) continue;

            const dx = sx - origPin.x;
            const dy = sy - origPin.y;
            const distSq = dx * dx + dy * dy + 0.5;
            const weight = 1.0 / Math.pow(distSq, 1.3);

            deltaX += (curPin.x - origPin.x) * weight;
            deltaY += (curPin.y - origPin.y) * weight;
            totalWeight += weight;
          }
          if (totalWeight > 0) {
            sx += deltaX / totalWeight;
            sy += deltaY / totalWeight;
          }
        }
        grid[r][c] = { x: sx, y: sy };
      }
    }

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const pTL = grid[r][c];         const pTR = grid[r][c + 1];
        const pBR = grid[r + 1][c + 1]; const pBL = grid[r + 1][c];

        const u0 = (c / COLS) * w;       const v0 = (r / ROWS) * h;
        const u1 = ((c + 1) / COLS) * w; const v1 = (r / ROWS) * h;
        const u2 = ((c + 1) / COLS) * w; const v2 = ((r + 1) / ROWS) * h;
        const u3 = (c / COLS) * w;       const v3 = ((r + 1) / ROWS) * h;

        drawTriangle(ctx2d, target, pTL.x, pTL.y, pTR.x, pTR.y, pBL.x, pBL.y, u0, v0, u1, v1, u3, v3);
        drawTriangle(ctx2d, target, pTR.x, pTR.y, pBR.x, pBR.y, pBL.x, pBL.y, u1, v1, u2, v2, u3, v3);
      }
    }

    ctx2d.restore();
  });
}

function drawTriangle(ctx, img, x0, y0, x1, y1, x2, y2, u0, v0, u1, v1, u2, v2) {
  const cx = (x0 + x1 + x2) / 3;
  const cy = (y0 + y1 + y2) / 3;
  
  const scale = 1.006; 
  const nx0 = cx + (x0 - cx) * scale;
  const ny0 = cy + (y0 - cy) * scale;
  const nx1 = cx + (x1 - cx) * scale;
  const ny1 = cy + (y1 - cy) * scale;
  const nx2 = cx + (x2 - cx) * scale;
  const ny2 = cy + (y2 - cy) * scale;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(nx0, ny0); ctx.lineTo(nx1, ny1); ctx.lineTo(nx2, ny2);
  ctx.closePath();
  ctx.clip();

  const denom = u0 * (v1 - v2) + u1 * (v2 - v0) + u2 * (v0 - v1);
  if (Math.abs(denom) < 0.0001) { ctx.restore(); return; }

  const a = (x0 * (v1 - v2) + x1 * (v2 - v0) + x2 * (v0 - v1)) / denom;
  const b = (y0 * (v1 - v2) + y1 * (v2 - v0) + y2 * (v0 - v1)) / denom;
  const c = (u0 * (x1 - x2) + u1 * (x2 - x0) + u2 * (x0 - x1)) / denom;
  const d = (u0 * (y1 - y2) + u1 * (y2 - y0) + u2 * (y0 - y1)) / denom;
  
  // ✅ 정석 아핀 텍스처 평행이동 변환 행렬 공식 적용
  const e = (u0 * (v1 * x2 - v2 * x1) + v0 * (u2 * x1 - u1 * x2) + x0 * (u1 * v2 - u2 * v1)) / denom;
  const f = (u0 * (v1 * y2 - v2 * y1) + v0 * (u2 * y1 - u1 * y2) + y0 * (u1 * v2 - u2 * v1)) / denom;

  ctx.transform(a, b, c, d, e, f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

function getHomography(src, dst) {
  if (typeof numeric === 'undefined') return null;
  let A = [], b = [];
  for (let i = 0; i < 4; i++) {
    A.push([src[i].x, src[i].y, 1, 0, 0, 0, -src[i].x * dst[i].x, -src[i].y * dst[i].x]);
    A.push([0, 0, 0, src[i].x, src[i].y, 1, -src[i].x * dst[i].y, -src[i].y * dst[i].y]);
    b.push(dst[i].x); b.push(dst[i].y);
  }
  let h = numeric.solve(A, b);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7]];
}

function scanCurrentArea() {
  if (!bgImg.src) return;
  if (typeof cv === 'undefined') {
    alert("AI (OpenCV) 엔진이 아직 로드되지 않았습니다.");
    return;
  }

  modeInfo.textContent = "AI 분석 중 (건물 형태 추출)...";
  
  const canvas = scanCanvas;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  canvas.width = bgImg.naturalWidth;
  canvas.height = bgImg.naturalHeight;
  ctx.drawImage(bgImg, 0, 0);

  let src = cv.imread(canvas);
  let gray = new cv.Mat();
  let blurred = new cv.Mat();
  let edges = new cv.Mat(); 
  let contours = new cv.MatVector();
  let hierarchy = new cv.Mat();

  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
  cv.GaussianBlur(gray, blurred, new cv.Size(7, 7), 0, 0, cv.BORDER_DEFAULT);
  
  cv.Canny(blurred, edges, 20, 100);
  cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  scanCandidates = [];
  candidateIndex = 0;

  let maxArea = 0;
  let maxCnt = null;
  for (let i = 0; i < contours.size(); ++i) {
    let cnt = contours.get(i);
    let area = cv.contourArea(cnt);
    if (area > maxArea && area > 5000) { 
      maxArea = area;
      maxCnt = cnt;
    }
  }

  if (maxCnt) {
    let rect = cv.minAreaRect(maxCnt);
    let vertices = cv.RotatedRect.points(rect);
    
    let pts = [
        {x: vertices[0].x, y: vertices[0].y},
        {x: vertices[1].x, y: vertices[1].y},
        {x: vertices[2].x, y: vertices[2].y},
        {x: vertices[3].x, y: vertices[3].y}
    ];

    scanCandidates.push({ points: pts, score: 100 });
  }

  if (scanCandidates.length > 0) {
    applyCandidate(0);
    modeInfo.textContent = `건물 외곽선 스캔 완료`;
  } else {
    modeInfo.textContent = "스캔 실패: 건물 형태를 찾을 수 없습니다.";
  }

  src.delete(); gray.delete(); blurred.delete(); edges.delete(); contours.delete(); hierarchy.delete();
  render();
  updateMappedArea();
}

function contourToPoints(cnt, offsetX = 0, offsetY = 0) {
  const pts = [];
  for (let i = 0; i < cnt.rows; i++) {
    pts.push({
      x: cnt.data32S[i * 2] + offsetX,
      y: cnt.data32S[i * 2 + 1] + offsetY
    });
  }
  return pts;
}

function getIntersectionArea(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  if (x2 <= x1 || y2 <= y1) return 0;
  return (x2 - x1) * (y2 - y1);
}

function scoreCandidate(pts, box) {
  const b = getBounds(pts);
  const or = getIntersectionArea(b,box) / Math.max(1, box.w * box.h);
  const fr = (b.w*b.h) / Math.max(1, box.w * box.h);
  const sides = [
    dist(pts[0],pts[1]),
    dist(pts[1],pts[2]),
    dist(pts[2],pts[3]),
    dist(pts[3],pts[0])];
  const avg = sides.reduce((a,v)=> a+v,0)/4;
  const vr = sides.reduce((s,v)=> s+Math.abs(v-avg),0)/avg;
  const shape = Math.max(0,1-vr*.5)*200;
  return or*1000 + fr*100 + shape;
}

function dist(a,b){
  return Math.sqrt((a.x-b.x)**2+(a.y-b.y)**2);
}

function applyCandidate(index) {
  if (!scanCandidates.length) return;
  candidateIndex = index;
  points = sortClockwise(scanCandidates[index].points);
  selectedPoint = -1;
  render();
  updateMappedArea();
  modeInfo.textContent = `후보 ${index + 1}/${scanCandidates.length} 적용`;
}

function handleKeyMove(e) {
  if (selectedPoint < 0) return;
  const step = e.shiftKey ? 10 : 1;
  const p = points[selectedPoint];
  if (e.key === "ArrowLeft") p.x -= step;
  else if (e.key === "ArrowRight") p.x += step;
  else if (e.key === "ArrowUp") p.y -= step;
  else if (e.key === "ArrowDown") p.y += step;
  else if (e.key === "Delete" && points.length > 4) {
    points.splice(selectedPoint, 1);
    selectedPoint = -1;
  } else return;
  e.preventDefault();
  render();
  updateMappedArea();
}

function getStagePos(e) {
  const rect = stage.getBoundingClientRect();
  return {
    x: clamp((e.clientX - rect.left) / zoom, 0, bgImg.naturalWidth || 99999),
    y: clamp((e.clientY - rect.top) / zoom, 0, bgImg.naturalHeight || 99999),
  };
}

function normalizeBox(a, b) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  };
}

function getBounds(arr) {
  const xs = arr.map((p) => p.x);
  const ys = arr.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

function sortClockwise(arr) {
  const c = arr.reduce((a, p) => ({ x: a.x + p.x / arr.length, y: a.y + p.y / arr.length }), { x: 0, y: 0 });
  return arr.slice().sort((a, b) => Math.atan2(a.y - c.y, a.x - c.x) - Math.atan2(b.y - c.y, b.x - c.x));
}

function orderQuad(pts) {
  const byY = pts.slice().sort((a, b) => a.y - b.y);
  const top = byY.slice(0, 2).sort((a, b) => a.x - b.x);
  const bottom = byY.slice(2, 4).sort((a, b) => a.x - b.x);
  return [top[0], top[1], bottom[1], bottom[0]];
}

function nearestPoint(arr, target, used) {
  let best = null;
  let bestIdx = -1;
  let bestDist = Infinity;

  arr.forEach((p, i) => {
    if (used.has(i)) return;
    const d = (p.x - target.x) ** 2 + (p.y - target.y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = p;
      bestIdx = i;
    }
  });

  used.add(bestIdx);
  return best;
}

function getWarpQuadFromPoints(pts) {
  if (pts.length === 4) return orderQuad(pts);

  const box = getBounds(pts);
  const targets = [
    { x: box.x, y: box.y },
    { x: box.x + box.w, y: box.y },
    { x: box.x + box.w, y: box.y + box.h },
    { x: box.x, y: box.y + box.h }
  ];

  const used = new Set();
  return targets.map(t => nearestPoint(pts, t, used));
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function readEntry(entry) {
  return new Promise((resolve) => {
    if (entry.isFile) {
      entry.file((file) => resolve([file]), () => resolve([]));
      return;
    }
    if (entry.isDirectory) {
      const reader = entry.createReader();
      const all = [];
      function readBatch() {
        reader.readEntries(async (entries) => {
          if (!entries.length) { resolve(all); return; }
          for (const child of entries) { all.push(...await readEntry(child)); }
          readBatch();
        }, () => resolve(all));
      }
      readBatch();
      return;
    }
    resolve([]);
  });
}

function initThree() {
  const container = $("webgl-container");
  if (!container) return;
  
  container.innerHTML = ""; 
  const canvas = document.createElement("canvas");
  canvas.id = "facadeCanvas";
  canvas.style.position = "absolute";
  canvas.style.top = "0"; canvas.style.left = "0";
  canvas.style.width = "100%"; canvas.style.height = "100%";
  
  canvas.style.zIndex = "999"; 
  container.style.position = "absolute";
  container.style.zIndex = "999";
  
  canvas.style.pointerEvents = "none"; 
  container.style.pointerEvents = "none";
  container.appendChild(canvas);
  
  canvas2d = canvas;
  ctx2d = canvas.getContext("2d");

  stage.insertBefore(container, overlay);

  let lastTime = 0;
  function animate(time) {
    requestAnimationFrame(animate);
    if (time - lastTime > 33.3) {
      updateMappedArea();
      lastTime = time;
    }
  }
  requestAnimationFrame(animate);

  console.log("2D 눈속임 매쉬 워프 엔진 설치 완료 (30fps 고정)");
}

function initOrUpdateFacadeMesh(targetElement, isVideo) {
  currentFacadeSource = targetElement;
  console.log(`[2D 워프 엔진] 콘텐츠 소스 탑재 완료 (비디오여부: ${isVideo})`);
  updateMappedArea();
}
