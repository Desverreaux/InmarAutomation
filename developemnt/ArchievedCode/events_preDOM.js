function initEarlyEvents() {
    initManuallyReconcileEvent();
}


function initManuallyReconcileEvent() {
  const target = "ManuallyReconcile"; // 🔴 change this if needed

  // --- XHR HOOK ---
  const originalOpen = XMLHttpRequest.prototype.open;

  XMLHttpRequest.prototype.open = function (method, url) {
    this._url = url;

    this.addEventListener("load", function () {
      if (this._url && this._url.includes(target)) {
        console.log("✅ XHR matched:", this._url);
        console.log("Status:", this.status);
        clickBackButton();
      }
    });

    return originalOpen.apply(this, arguments);
  };
}

initEarlyEvents();