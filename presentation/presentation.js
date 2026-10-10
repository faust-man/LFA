const stage = document.querySelector("#stage");
const frame = document.querySelector("#slide");
const prev = document.querySelector("#prev");
const next = document.querySelector("#next");
const dots = document.querySelector("#dots");
const presentationVersion = "20261010-2";
const names = [
  "Знакомство",
  "Команда",
  "История идеи",
  "Анализ решений",
  "Инфраструктура",
  "Живой сайт",
  "Backend",
  "Перспективы",
  "Заключение",
];
let current = 1;
function resize() {
  const w = window.innerWidth,
    h = window.innerHeight,
    portrait = h > w;
  const scale = Math.min((portrait ? h : w) / 1600, (portrait ? w : h) / 960);
  stage.style.transform = `translate(-50%, -50%) rotate(${portrait ? 90 : 0}deg) scale(${scale})`;
}
function show(number) {
  current = Math.max(1, Math.min(names.length, Number.isInteger(number) ? number : 1));
  frame.src = `${current}/?v=${presentationVersion}`;
  frame.title = `${current}. ${names[current - 1]}`;
  document.querySelector("#counter").textContent = `${current} / ${names.length}`;
  prev.disabled = current === 1;
  next.disabled = current === names.length;
  [...dots.children].forEach((dot, i) =>
    dot.setAttribute("aria-current", String(i + 1 === current)),
  );
  if (location.hash !== `#${current}`)
    history.replaceState(null, "", `#${current}`);
}
function key(event) {
  if (
    event.defaultPrevented ||
    event.repeat ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey
  )
    return;
  // The live site's form fields keep normal text input.
  if (
    event.target.closest?.('input, textarea, select, [contenteditable="true"]')
  )
    return;
  if (
    [
      "Space",
      "ArrowRight",
      "PageDown",
      "ArrowLeft",
      "PageUp",
      "Home",
      "End",
    ].includes(event.code)
  ) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.code === "Home") show(1);
    else if (event.code === "End") show(names.length);
    else
      show(
        current +
          (["ArrowLeft", "PageUp"].includes(event.code) ||
          (event.code === "Space" && event.shiftKey)
            ? -1
            : 1),
      );
  }
}
const connected = new WeakSet();
const watchedFrames = new WeakSet();
function connect(child) {
  try {
    const doc = child.contentDocument;
    if (!doc) return;
    if (!connected.has(doc)) {
      connected.add(doc);
      doc.addEventListener("keydown", key, true);
    }
    doc.querySelectorAll("iframe").forEach((nested) => {
      if (!watchedFrames.has(nested)) {
        watchedFrames.add(nested);
        nested.addEventListener("load", () => connect(nested));
      }
      connect(nested);
    });
  } catch {
    /* Only same-origin documents receive keyboard controls. */
  }
}
names.forEach((name, i) => {
  const dot = document.createElement("button");
  dot.setAttribute("aria-label", `${i + 1}. ${name}`);
  dot.addEventListener("click", () => show(i + 1));
  dots.append(dot);
});
frame.addEventListener("load", () => connect(frame));
// Connect as soon as the DOM appears, even while remote map assets are loading.
setInterval(() => connect(frame), 250);
window.addEventListener("keydown", key, true);
window.addEventListener("resize", resize);
window.addEventListener("hashchange", () =>
  show(Number(location.hash.slice(1)) || 1),
);
prev.addEventListener("click", () => show(current - 1));
next.addEventListener("click", () => show(current + 1));
document.querySelector("#touch-prev").addEventListener("click", () => show(current - 1));
document.querySelector("#touch-next").addEventListener("click", () => show(current + 1));
document.querySelector("#fullscreen").addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    /* Presentation remains usable without fullscreen permission. */
  }
});
resize();
show(Number(location.hash.slice(1)) || 1);
