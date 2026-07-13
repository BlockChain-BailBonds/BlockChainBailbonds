/* Live Tulsa intake bridge. The existing visual flow remains, but submission
 * is sent to the authenticated backend and requires explicit consent. */
(function () {
  const API = window.BAILBONDS_API || ((window.BAILBONDS_CONFIG || {}).apiBase || "");
  let statusTimer;
  function showStatus(message) {
    const target = document.getElementById("processing-status");
    if (target) target.textContent = message;
  }
  function watchRequest(requestId) {
    if (!API) return;
    clearInterval(statusTimer);
    statusTimer = setInterval(async () => {
      try {
        const response = await fetch(API + "/public/requests/" + encodeURIComponent(requestId));
        if (!response.ok) return;
        const state = await response.json();
        showStatus("Request " + state.status + ". A licensed bondsman is reviewing the case.");
        if (["reviewed", "closed"].includes(state.status)) clearInterval(statusTimer);
      } catch (_) { /* transient network failures are retried */ }
    }, 5000);
  }
  function install() {
    const form = document.getElementById("emergency-form");
    if (!form || form.dataset.tulsaWorkflowInstalled) return;
    form.dataset.tulsaWorkflowInstalled = "1";
    const phone = document.createElement("input");
    phone.name = "phone";
    phone.type = "tel";
    phone.required = true;
    phone.placeholder = "Callback phone number";
    phone.className = "w-full border rounded p-2 mt-2";
    const consent = document.createElement("label");
    consent.className = "block mt-3 text-sm";
    consent.innerHTML = '<input type="checkbox" name="consent" required> I consent to this request being shared with the assigned licensed bondsman and the configured records sources for case review.';
    form.append(phone, consent);
    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const data = new FormData(form);
      const payload = {
        full_name: data.get("fullName"),
        date_of_birth: data.get("birthYear"),
        phone: data.get("phone"),
        emergency: true,
        consent: data.get("consent") === "on",
        county: "Tulsa",
        source: "918-bail-pwa"
      };
      try {
        if (!API) throw new Error("The live Tulsa service is not configured for this Pages deployment.");
        const response = await fetch(API + "/intake", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to submit intake");
        showStatus("Request received. Waiting for Tulsa record review.");
        watchRequest(result.request_id);
        alert("Request received. A licensed bondsman will review it. Reference: " + result.request_id);
      } catch (error) {
        alert("The request could not be submitted: " + error.message);
      }
    }, true);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install); else install();
})();
