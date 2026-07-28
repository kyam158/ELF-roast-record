(function () {
  "use strict";

  const SCREEN_SHEET_WIDTH = 1122;
  const SCREEN_SHEET_HEIGHT = 794;

  let preview = null;
  let stage = null;
  let sheet = null;

  function getNumber(value) {
    const number = parseFloat(value);
    return Number.isFinite(number) ? number : 0;
  }

  function fitHandwritingPreview() {
    if (!preview || !stage || !sheet) {
      return;
    }

    const styles = window.getComputedStyle(preview);
    const horizontalPadding = getNumber(styles.paddingLeft) + getNumber(styles.paddingRight);
    const availableWidth = Math.max(0, preview.clientWidth - horizontalPadding);
    const scale = Math.min(1, availableWidth / SCREEN_SHEET_WIDTH);

    sheet.style.width = SCREEN_SHEET_WIDTH + "px";
    sheet.style.height = SCREEN_SHEET_HEIGHT + "px";
    sheet.style.transform = "scale(" + scale + ")";
    sheet.style.transformOrigin = "top left";
    stage.style.width = Math.ceil(SCREEN_SHEET_WIDTH * scale) + "px";
    stage.style.height = Math.ceil(SCREEN_SHEET_HEIGHT * scale) + "px";
  }

  function prepareHandwritingPrint() {
    if (!stage || !sheet) {
      return;
    }

    stage.style.width = "";
    stage.style.height = "";
    sheet.style.width = "";
    sheet.style.height = "";
    sheet.style.transform = "none";
    sheet.style.transformOrigin = "";
  }

  function initializeHandwritingPreview() {
    preview = document.querySelector(".handwriting-preview");
    stage = document.querySelector(".handwriting-stage");
    sheet = document.querySelector(".handwriting-sheet");
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(fitHandwritingPreview);
    });
  }

  window.addEventListener("load", initializeHandwritingPreview);
  window.addEventListener("resize", fitHandwritingPreview);
  window.addEventListener("orientationchange", function () {
    window.setTimeout(fitHandwritingPreview, 250);
  });
  window.addEventListener("beforeprint", prepareHandwritingPrint);
  window.addEventListener("afterprint", fitHandwritingPreview);

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(fitHandwritingPreview);
  }
})();
