document.querySelectorAll("[data-save]").forEach((element) => {
  const key = `animal-map-presentation:${element.dataset.save}`;
  try {
    const saved = localStorage.getItem(key);
    if (saved !== null) element.textContent = saved;
  } catch {}
  element.addEventListener("input", () => {
    try {
      localStorage.setItem(key, element.textContent);
    } catch {}
  });
  element.addEventListener("paste", (event) => {
    event.preventDefault();
    const text = event.clipboardData.getData("text/plain");
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    element.dispatchEvent(new Event("input"));
  });
});
document.querySelectorAll("[data-photo]").forEach((label) => {
  const key = `animal-map-presentation:photo-${label.dataset.photo}`;
  const input = label.querySelector("input");
  function preview(src) {
    let image = label.querySelector("img");
    if (!image) {
      image = document.createElement("img");
      image.alt = `Фото участника ${label.dataset.photo}`;
      label.prepend(image);
    }
    image.src = src;
    label.querySelector("svg").style.display = "none";
    label.querySelector("span").style.display = "none";
  }
  try {
    const saved = localStorage.getItem(key);
    if (saved) preview(saved);
  } catch {}
  input.addEventListener("change", () => {
    const file = input.files[0];
    if (!file || !file.type.startsWith("image/")) return;
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      const canvas = document.createElement("canvas");
      const ratio = Math.min(1, 900 / Math.max(image.width, image.height));
      canvas.width = Math.round(image.width * ratio);
      canvas.height = Math.round(image.height * ratio);
      canvas
        .getContext("2d")
        .drawImage(image, 0, 0, canvas.width, canvas.height);
      const src = canvas.toDataURL("image/jpeg", 0.85);
      preview(src);
      try {
        localStorage.setItem(key, src);
      } catch {}
      URL.revokeObjectURL(url);
    };
    image.onerror = () => URL.revokeObjectURL(url);
    image.src = url;
  });
});
