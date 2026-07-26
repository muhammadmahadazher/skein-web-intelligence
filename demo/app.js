const views = {
  overview: ["Workspace / Overview", "Good afternoon, analyst."],
  runs: ["Workspace / Runs", "Every run leaves a trail."],
  explorer: ["Workspace / Data explorer", "Inspect the evidence."],
  architecture: ["Workspace / Architecture", "See every boundary."]
};

const sampleEvidence = [
  {
    url: "https://example.com/",
    title: "Example Domain",
    status: 200,
    description: "A stable example page used for documentation.",
    headings: ["Example Domain"],
    word_count: 28,
    json_ld_count: 0
  },
  {
    url: "https://example.com/domains",
    title: "Domain Names",
    status: 200,
    description: "Reserved domain guidance and references.",
    headings: ["Domain names", "Reserved names"],
    word_count: 642,
    json_ld_count: 1
  }
];

const navItems = [...document.querySelectorAll(".nav-item")];
const panels = [...document.querySelectorAll("[data-panel]")];
const demoNav = document.querySelector("#demoNav");
const menuToggle = document.querySelector("#menuToggle");
const toast = document.querySelector("#toast");
const shortcutDialog = document.querySelector("#shortcutDialog");
let pendingG = false;
let pendingGTimer;
let runTimer;
let paused = false;
let running = false;
let progress = 0;
let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 2800);
}

function openView(name) {
  navItems.forEach((item) => item.classList.toggle("active", item.dataset.view === name));
  panels.forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === name));
  const [kicker, title] = views[name];
  document.querySelector("#viewKicker").textContent = kicker;
  document.querySelector("#viewTitle").textContent = title;
  demoNav.classList.remove("open");
  menuToggle?.setAttribute("aria-expanded", "false");
}

navItems.forEach((item) => {
  item.addEventListener("click", () => openView(item.dataset.view));
});

menuToggle?.addEventListener("click", () => {
  const open = demoNav.classList.toggle("open");
  menuToggle.setAttribute("aria-expanded", String(open));
});

document.querySelector("#themeToggle").addEventListener("click", () => {
  const html = document.documentElement;
  const next = html.dataset.theme === "dark" ? "light" : "dark";
  html.dataset.theme = next;
  localStorage.setItem("skein-demo-theme", next);
  showToast(`${next === "dark" ? "Dark" : "Light"} theme enabled`);
});

const savedTheme = localStorage.getItem("skein-demo-theme");
if (savedTheme === "light" || savedTheme === "dark") {
  document.documentElement.dataset.theme = savedTheme;
}

const phases = [
  ["Validate", "URL syntax and crawl scope accepted", "policy"],
  ["Policy", "DNS and destination policy passed", "safety"],
  ["Discover", "Robots policy parsed; links bounded to host", "crawler"],
  ["Fetch", "Public HTML fetched within time and body limits", "fetcher"],
  ["Extract", "Titles, headings, links, and metadata normalized", "extractor"],
  ["Finalize", "Evidence lineage committed and export prepared", "system"]
];

function elapsedLabel(step) {
  return `00:0${Math.min(step, 9)}`;
}

function appendEvent(message, kind, step) {
  const item = document.createElement("li");
  item.innerHTML = `<time>${elapsedLabel(step)}</time><span></span><b></b>`;
  item.querySelector("span").textContent = message;
  item.querySelector("b").textContent = kind;
  document.querySelector("#eventLog").prepend(item);
}

function renderRun(step) {
  const phaseIndex = Math.min(Math.floor((step - 1) / 2), phases.length - 1);
  progress = Math.min(step * 9, 100);
  document.querySelector("#progressBar").style.width = `${progress}%`;
  document.querySelector("#runStatus").textContent = phases[phaseIndex][1];
  document.querySelector("#metricDiscovered").textContent = Math.min(12, step + 1);
  document.querySelector("#metricFetched").textContent = Math.max(0, Math.min(12, step - 2));
  document.querySelector("#metricRecords").textContent = Math.max(0, Math.min(24, (step - 4) * 3));
  document.querySelector("#metricSafety").textContent = Math.min(18, step * 2);
  document.querySelector("#fetchTrend").textContent = `${Math.max(0, Math.min(12, step - 2))} successful`;
  document.querySelectorAll(".phase").forEach((phase, index) => {
    phase.classList.toggle("active", index === phaseIndex);
    phase.classList.toggle("done", index < phaseIndex);
  });
  if (step % 2 === 1) {
    appendEvent(phases[phaseIndex][1], phases[phaseIndex][2], step);
  }
}

function finishRun() {
  running = false;
  paused = false;
  progress = 100;
  window.clearInterval(runTimer);
  document.querySelector("#progressBar").style.width = "100%";
  document.querySelector("#runStatus").textContent = "12 pages converted into 24 evidence records";
  document.querySelector("#runState").textContent = "Complete";
  document.querySelector("#runState").className = "state-pill complete";
  document.querySelector("#runButton").disabled = false;
  document.querySelector("#runButton").textContent = "Run demo scan";
  document.querySelector("#pauseButton").disabled = true;
  document.querySelector("#cancelButton").disabled = true;
  document.querySelector("#metricDiscovered").textContent = "12";
  document.querySelector("#metricFetched").textContent = "12";
  document.querySelector("#metricRecords").textContent = "24";
  document.querySelector("#metricSafety").textContent = "18";
  document.querySelectorAll(".phase").forEach((phase) => {
    phase.classList.remove("active");
    phase.classList.add("done");
  });
  appendEvent("Run completed with evidence export ready", "system", 9);
  document.querySelector("#runCountBadge").textContent = "3";
  showToast("Demo crawl complete — 24 evidence records ready");
}

function startRun(event) {
  event.preventDefault();
  if (running) return;
  const input = document.querySelector("#demoUrl");
  let target;
  try {
    target = new URL(input.value);
  } catch {
    showToast("Enter a valid public HTTP(S) URL");
    input.focus();
    return;
  }
  if (!["http:", "https:"].includes(target.protocol)) {
    showToast("Skein accepts only public HTTP(S) websites");
    input.focus();
    return;
  }

  running = true;
  paused = false;
  progress = 0;
  let step = 0;
  document.querySelector("#runState").textContent = "Running";
  document.querySelector("#runState").className = "state-pill running";
  document.querySelector("#runButton").disabled = true;
  document.querySelector("#runButton").textContent = "Scanning…";
  document.querySelector("#pauseButton").disabled = false;
  document.querySelector("#cancelButton").disabled = false;
  appendEvent(`Demo crawl created for ${target.hostname}`, "run", 0);
  renderRun(1);

  runTimer = window.setInterval(() => {
    if (paused) return;
    step += 1;
    if (step >= 11) {
      finishRun();
      return;
    }
    renderRun(step);
  }, 520);
}

document.querySelector("#demoRunForm").addEventListener("submit", startRun);

document.querySelector("#pauseButton").addEventListener("click", () => {
  if (!running) return;
  paused = !paused;
  const button = document.querySelector("#pauseButton");
  button.textContent = paused ? "Resume" : "Pause";
  document.querySelector("#runState").textContent = paused ? "Paused" : "Running";
  appendEvent(paused ? "Run paused without losing evidence" : "Run resumed from saved frontier", "lifecycle", 5);
  showToast(paused ? "Demo crawl paused" : "Demo crawl resumed");
});

document.querySelector("#cancelButton").addEventListener("click", () => {
  if (!running) return;
  window.clearInterval(runTimer);
  running = false;
  paused = false;
  document.querySelector("#runState").textContent = "Cancelled";
  document.querySelector("#runState").className = "state-pill";
  document.querySelector("#runStatus").textContent = "Cancelled; collected evidence remains available";
  document.querySelector("#runButton").disabled = false;
  document.querySelector("#runButton").textContent = "Run demo scan";
  document.querySelector("#pauseButton").disabled = true;
  document.querySelector("#pauseButton").textContent = "Pause";
  document.querySelector("#cancelButton").disabled = true;
  appendEvent("Run cancelled by operator", "lifecycle", 5);
  showToast("Demo crawl cancelled safely");
});

function downloadEvidence(records = sampleEvidence) {
  const payload = {
    schema_version: "skein.evidence.v1",
    generated_at: new Date().toISOString(),
    demo: true,
    notice: "Browser tour sample. Run Skein locally for real crawl evidence.",
    records
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "skein-demo-evidence.json";
  link.click();
  URL.revokeObjectURL(url);
  showToast("Sample evidence JSON exported");
}

document.querySelector("#exportButton").addEventListener("click", () => downloadEvidence());
document.querySelector("#explorerExport").addEventListener("click", () => downloadEvidence());

document.querySelector("#runSearch").addEventListener("input", (event) => {
  const query = event.target.value.toLowerCase();
  document.querySelectorAll("#runsTable tr").forEach((row) => {
    row.hidden = !row.textContent.toLowerCase().includes(query);
  });
});

function filterEvidence() {
  const query = document.querySelector("#evidenceSearch").value.toLowerCase();
  const status = document.querySelector("#statusFilter").value;
  let visible = 0;
  document.querySelectorAll("#evidenceTable tr").forEach((row) => {
    const matchQuery = row.textContent.toLowerCase().includes(query);
    const matchStatus = status === "all" || row.dataset.status === status;
    row.hidden = !(matchQuery && matchStatus);
    if (!row.hidden) visible += 1;
  });
  document.querySelector("#evidenceCount").textContent = `${visible} evidence ${visible === 1 ? "record" : "records"}`;
}

document.querySelector("#evidenceSearch").addEventListener("input", filterEvidence);
document.querySelector("#statusFilter").addEventListener("change", filterEvidence);

document.addEventListener("keydown", (event) => {
  const tag = event.target.tagName;
  const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  if (event.key === "?" && !typing) {
    event.preventDefault();
    shortcutDialog.showModal();
    return;
  }
  if (event.key === "/" && !typing) {
    event.preventDefault();
    const active = document.querySelector(".view.active");
    const field = active.querySelector("input");
    field?.focus();
    return;
  }
  if (!typing && event.key.toLowerCase() === "g") {
    pendingG = true;
    window.clearTimeout(pendingGTimer);
    pendingGTimer = window.setTimeout(() => {
      pendingG = false;
    }, 1200);
    return;
  }
  if (!typing && pendingG) {
    const destination = { o: "overview", r: "runs", e: "explorer", a: "architecture" }[
      event.key.toLowerCase()
    ];
    if (destination) {
      event.preventDefault();
      openView(destination);
    }
    pendingG = false;
  }
  if (event.key === "Escape") {
    demoNav.classList.remove("open");
    menuToggle?.setAttribute("aria-expanded", "false");
  }
});
