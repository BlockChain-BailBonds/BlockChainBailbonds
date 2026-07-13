/* Explicit, local-first diagnostics. No hidden mining or nearby-device scanning. */
(function () {
  const consent = document.getElementById("diagnostics-consent");
  const measure = document.getElementById("measure-bandwidth-btn");
  const nearby = document.getElementById("choose-nearby-device-btn");
  const clear = document.getElementById("clear-diagnostics-btn");
  const output = document.getElementById("diagnostics-output");
  if (!consent || !measure || !nearby || !clear || !output) return;
  const stateKey = "bailbonds_diagnostics_consent";
  const savedKey = "bailbonds_diagnostics";
  const safe = (value) => String(value ?? "unknown").replace(/[<>]/g, "");
  const render = (value) => { output.textContent = JSON.stringify(value, null, 2); };
  consent.checked = localStorage.getItem(stateKey) === "yes";
  function update() {
    measure.disabled = !consent.checked;
    nearby.disabled = !consent.checked || !navigator.bluetooth;
  }
  consent.addEventListener("change", () => {
    if (consent.checked) localStorage.setItem(stateKey, "yes");
    else { localStorage.removeItem(stateKey); localStorage.removeItem(savedKey); render({ status: "consent_withdrawn" }); }
    update();
  });
  measure.addEventListener("click", () => {
    if (!consent.checked) return;
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const data = {
      collected_at: new Date().toISOString(),
      source: "browser_connection_api",
      effective_type: connection?.effectiveType || "unknown",
      downlink_mbps: connection?.downlink ?? null,
      rtt_ms: connection?.rtt ?? null,
      save_data: connection?.saveData ?? null,
      online: navigator.onLine,
      device_memory_gb: navigator.deviceMemory ?? null,
      hardware_concurrency: navigator.hardwareConcurrency ?? null
    };
    localStorage.setItem(savedKey, JSON.stringify(data));
    render(data);
  });
  nearby.addEventListener("click", async () => {
    if (!consent.checked || !navigator.bluetooth) return;
    try {
      const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true });
      const data = { collected_at: new Date().toISOString(), source: "user_selected_bluetooth_device", device_name: safe(device.name || "Unnamed device"), device_id: safe(device.id) };
      localStorage.setItem(savedKey, JSON.stringify(data));
      render(data);
    } catch (error) { render({ status: "device_selection_cancelled", message: safe(error.message) }); }
  });
  clear.addEventListener("click", () => { localStorage.removeItem(stateKey); localStorage.removeItem(savedKey); consent.checked = false; render({ status: "cleared" }); update(); });
  const existing = localStorage.getItem(savedKey);
  if (existing) { try { render(JSON.parse(existing)); } catch (_) {} }
  update();
})();
