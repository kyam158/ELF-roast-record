(function () {
  "use strict";

  let preview = null;
  let sheet = null;

  function getNumber(value) {
    const number = parseFloat(value);
    return Number.isFinite(number) ? number : 0;
  }

  function fitHandwritingPreview() {
    if (!preview || !sheet) {
      return;
    }

    const styles = window.getComputedStyle(preview);
    const availableWidth = preview.clientWidth - getNumber(styles.paddingLeft) - getNumber(styles.paddingRight);
    const sheetWidth = sheet.scrollWidth;
    const scale = sheetWidth > 0 ? Math.min(1, availableWidth / sheetWidth) : 1;

    sheet.style.transform = "scale(" + scale + ")";
    preview.style.height = Math.ceil(sheet.scrollHeight * scale + getNumber(styles.paddingTop) + getNumber(styles.paddingBottom)) + "px";
  }

  function prepareHandwritingPrint() {
    if (!preview || !sheet) {
      return;
    }

    sheet.style.transform = "none";
    preview.style.height = "auto";
  }

  function initializeHandwritingPreview() {
    preview = document.querySelector(".handwriting-preview");
    sheet = document.querySelector(".handwriting-sheet");
    fitHandwritingPreview();
  }

  window.addEventListener("load", initializeHandwritingPreview);
  window.addEventListener("resize", fitHandwritingPreview);
  window.addEventListener("orientationchange", fitHandwritingPreview);
  window.addEventListener("beforeprint", prepareHandwritingPrint);
  window.addEventListener("afterprint", fitHandwritingPreview);
})();
