const $ = (id) => document.getElementById(id);

const dropZone = $("dropZone");
const fileInput = $("fileInput");
const folderInput = $("folderInput");
const bgSelect = $("bgSelect");
const contentSelect = $("contentSelect");
const scanAreaButton = $("scanAreaButton");
const scanButton = $("scanButton");
const addPointButton = $("addPointButton");
const deletePointButton = $("deletePointButton");
const resetButton = $("resetButton");
const guideToggle = $("guideToggle");
const zoomSlider = $("zoomSlider");

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
let scanBox = null;

// 초기 코너 핀
let points = [
  { x: 200, y: 180 },
  { x: 760, y: 180 },
  { x: 760, y: 560 },
  { x: 200, y: 560 },
];

init();

function init() {
  mapped.classList.add("empty");
  bindFileEvents();
  bindUiEvents();
  bindStageEvents();
  refreshLists();
  
  // OpenCV 로드 대기 알림
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

  scanAreaButton.onclick = () => {
    mode = mode === "scanArea" ? "move" : "scanArea";
    modeInfo.textContent = mode === "scanArea" ? "스캔 영역 드래그" : "이동";
  };

  scanButton.onclick = () => {
    scanCurrentArea();
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
      points = sortClockwise(points);
      render();
      updateMappedArea();
    }
  };

  resetButton.onclick = () => {
    fitDefaultPoints();
    selectedPoint = -1;
    scanBox = null;
    modeInfo.textContent = "초기화";
    render();
    updateMappedArea();
  };

  guideToggle.onchange = () => {
    stage.classList.toggle("hide-guides", !guideToggle.checked);
  };

  zoomSlider.oninput = () => {
    zoom = +zoomSlider.value / 100;
    stage.style.transform = `scale(${zoom})`;
  };

  window.addEventListener("keydown", handleKeyMove);
}

function bindStageEvents() {
  stage.addEventListener("pointerdown", (e) => {
    const pos = getStagePos(e);
    if (mode === "scanArea") {
      scanStart = pos;
      scanBox = { x: pos.x, y: pos.y, w: 1, h: 1 };
      render();
      return;
    }
    if (mode === "add" && e.target === overlay) {
      points.push(pos);
      points = sortClockwise(points);
      selectedPoint = points.length - 1;
      render();
      updateMappedArea();
    }
  });

  stage.addEventListener("pointermove", (e) => {
    if (scanStart) {
      const pos = getStagePos(e);
      scanBox = normalizeBox(scanStart, pos);
      render();
    }
    if (dragPoint >= 0) {
      points[dragPoint] = getStagePos(e);
      selectedPoint = dragPoint;
      render();
      updateMappedArea();
    }
  });

  stage.addEventListener("pointerup", () => {
    if (scanStart) {
      modeInfo.textContent = "스캔 영역 지정됨 (AI 스캔 대기)";
      scanStart = null;
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
    stage.style.width = `${bgImg.naturalWidth}px`;
    stage.style.height = `${bgImg.naturalHeight}px`;
    overlay.setAttribute("width", bgImg.naturalWidth);
    overlay.setAttribute("height", bgImg.naturalHeight);
    overlay.setAttribute("viewBox", `0 0 ${bgImg.naturalWidth} ${bgImg.naturalHeight}`);
    bgInfo.textContent = file.name;
    fitDefaultPoints();
    enableButtons();
    render();
    updateMappedArea();
  };
  bgImg.src = bgUrl;
}

function setContent(file) {
  if (contentUrl) URL.revokeObjectURL(contentUrl);
  contentUrl = URL.createObjectURL(file);
  mapped.classList.remove("empty");
  mapImg.style.display = "none";
  mapVideo.style.display = "none";
  mapImg.removeAttribute("src");
  mapVideo.pause();
  mapVideo.removeAttribute("src");
  mapVideo.load();

  if (file.type.startsWith("video/")) {
    mapVideo.src = contentUrl;
    mapVideo.style.display = "block";
    mapVideo.play().catch(() => {});
    modeInfo.textContent = "영상 적용됨";
  } else {
    mapImg.src = contentUrl;
    mapImg.style.display = "block";
    modeInfo.textContent = "이미지 적용됨";
  }
  contentInfo.textContent = file.name;
  updateMappedArea();
}

function enableButtons() {
  [scanAreaButton, scanButton, addPointButton, deletePointButton, resetButton].forEach((b) => b.disabled = false);
}

function fitDefaultPoints() {
  const w = bgImg.naturalWidth;
  const h = bgImg.naturalHeight;
  points = [
    { x: w * 0.2, y: h * 0.22 },
    { x: w * 0.8, y: h * 0.22 },
    { x: w * 0.8, y: h * 0.78 },
    { x: w * 0.2, y: h * 0.78 },
  ];
}

// -----------------------------------------------------
// 1. 렌더링 업데이트 (SVG Path 곡선/마스크 연결)
// -----------------------------------------------------
function render() {
  stage.querySelectorAll(".pt").forEach((el) => el.remove());

  // 폴리곤 대신 SVG Path 문자열 생성 (M = 이동, L = 선 긋기, Z = 닫기)
  if (points.length > 0) {
    const pathString = "M " + points.map(p => `${p.x},${p.y}`).join(" L ") + " Z";
    poly.setAttribute("d", pathString);
    clipPathData.setAttribute("d", pathString); // 실제 영상을 자르는 마스크
  }

  if (scanBox) {
    scanRect.style.display = "block";
    scanRect.setAttribute("x", scanBox.x);
    scanRect.setAttribute("y", scanBox.y);
    scanRect.setAttribute("width", scanBox.w);
    scanRect.setAttribute("height", scanBox.h);
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

// -----------------------------------------------------
// 2. 3D 투시 왜곡 (Homography & CSS matrix3d)
// -----------------------------------------------------
function updateMappedArea() {
  if (!bgImg.src || points.length < 3) return;

  const box = getBounds(points);
  const target = mapVideo.style.display === "block" ? mapVideo : mapImg;
  const w = target.videoWidth || target.naturalWidth || box.w;
  const h = target.videoHeight || target.naturalHeight || box.h;

  // 마스크(clipPath) 적용
  mapped.style.clipPath = "url(#maskClip)";
  mapped.style.left = "0px";
  mapped.style.top = "0px";
  mapped.style.width = "100%";
  mapped.style.height = "100%";

  target.style.position = "absolute";
  target.style.transformOrigin = "0 0";
  target.style.width = `${w}px`;
  target.style.height = `${h}px`;

  // 원본 영상의 4개 모서리를 Bounding Box의 4개 모서리에 강제 맵핑(Warping)
  const srcPts = [{x:0, y:0}, {x:w, y:0}, {x:w, y:h}, {x:0, y:h}];
  const dstPts = [
    {x: box.x, y: box.y},
    {x: box.x + box.w, y: box.y},
    {x: box.x + box.w, y: box.y + box.h},
    {x: box.x, y: box.y + box.h}
  ];

  // 투시 행렬 계산
  const H = getHomography(srcPts, dstPts);
  if (H) {
    // CSS matrix3d 포맷으로 삽입 (3D 픽셀 왜곡)
    target.style.transform = `matrix3d(${H[0]}, ${H[3]}, 0, ${H[6]}, ${H[1]}, ${H[4]}, 0, ${H[7]}, 0, 0, 1, 0, ${H[2]}, ${H[5]}, 0, 1)`;
  }
}

// 행렬 방정식 풀이 (Numeric.js 활용)
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

// -----------------------------------------------------
// 3. AI 공간 자동 스캔 (OpenCV.js 연동)
// -----------------------------------------------------
function scanCurrentArea() {
  if (!bgImg.src) return;
  if (typeof cv === 'undefined') {
    alert("AI (OpenCV) 엔진이 아직 로드되지 않았습니다. 몇 초 뒤 다시 시도해주세요.");
    return;
  }

  modeInfo.textContent = "AI 분석 중...";
  
  // 캔버스에 이미지 복사
  const canvas = scanCanvas;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  canvas.width = bgImg.naturalWidth;
  canvas.height = bgImg.naturalHeight;
  ctx.drawImage(bgImg, 0, 0);

  // OpenCV 연산: 그레이스케일 -> 블러 -> 엣지 추출(Canny) -> 윤곽선 찾기
  let src = cv.imread(canvas);
  let gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
  
  let blurred = new cv.Mat();
  cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
  
  let edges = new cv.Mat();
  cv.Canny(blurred, edges, 50, 150);
  
  let contours = new cv.MatVector();
  let hierarchy = new cv.Mat();
  cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  // 지정한 스캔 박스 주변에서 가장 큰 윤곽선(건물) 찾기
  let maxArea = 0;
  let maxContour = null;
  for (let i = 0; i < contours.size(); ++i) {
    let cnt = contours.get(i);
    let area = cv.contourArea(cnt);
    if (area > maxArea) {
      maxArea = area;
      maxContour = cnt;
    }
  }

  if (maxContour) {
    // 찾은 외곽선을 부드러운 다각형/곡선 포인트 배열로 변환
    let approx = new cv.Mat();
    let epsilon = 0.01 * cv.arcLength(maxContour, true); // epsilon이 낮을수록 곡선(포인트)이 많아짐
    cv.approxPolyDP(maxContour, approx, epsilon, true);

    points = [];
    for (let i = 0; i < approx.rows; i++) {
      points.push({ x: approx.data32S[i * 2], y: approx.data32S[i * 2 + 1] });
    }
    
    // UI 업데이트
    points = sortClockwise(points);
    modeInfo.textContent = "AI 윤곽선 스캔 완료";
    approx.delete();
  } else {
    modeInfo.textContent = "스캔 실패 - 대상을 찾지 못함";
  }

  // 메모리 해제
  src.delete(); gray.delete(); blurred.delete(); edges.delete(); contours.delete(); hierarchy.delete();
  
  selectedPoint = -1;
  render();
  updateMappedArea();
}

// -----------------------------------------------------
// 이하 유틸 함수들 유지
// -----------------------------------------------------
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
