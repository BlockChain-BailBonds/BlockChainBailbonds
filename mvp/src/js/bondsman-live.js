/* Bondsman consolidation dashboard: source evidence, case status, and plans. */
(function () {
  const cfg = window.BAILBONDS_CONFIG || {};
  const api = window.BAILBONDS_API || cfg.apiBase || "";
  const token = window.BAILBONDS_ADMIN_TOKEN || sessionStorage.getItem("bailbonds_admin_token") || "";
  const esc = (v) => String(v ?? "").replace(/[&<>\"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  function card(title, body) { return `<article class="card"><h3>${esc(title)}</h3>${body}</article>`; }
  function plans() {
    return card("Bondsman subscription", `<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div class="p-4 border rounded"><strong>Starter</strong><p>Profile, basic intake, manual notes.</p></div>
      <div class="p-4 border rounded"><strong>Professional</strong><p>Emergency routing, source packets, documents, reminders.</p></div>
      <div class="p-4 border rounded"><strong>Agency</strong><p>Staff accounts, county routing, analytics, exports.</p></div>
    </div><p class="text-sm text-muted">Pricing and billing are configured by the operator; this page does not collect payment credentials.</p>`);
  }
  async function load() {
    const root = document.getElementById("live-bondsman-dashboard");
    if (!root) return;
    root.innerHTML = plans() + card("Live intake consolidation", "<p>Loading...</p>");
    if (!api || !token) {
      root.innerHTML += card("Connection required", "<p>Configure the licensed bondsman API endpoint and session token to load live requests.</p>");
      return;
    }
    try {
      const headers = { Authorization: "Bearer " + token };
      const response = await fetch(api + "/requests", { headers });
      if (!response.ok) throw new Error("Dashboard request failed");
      const data = await response.json();
      const rows = await Promise.all((data.requests || []).map(async (item) => {
        const detail = await fetch(api + "/requests/" + encodeURIComponent(item.id), { headers }).then((r) => r.json());
        const source = detail.source || {};
        const confirmed = detail.review && ["approve", "approve_with_conditions"].includes(detail.review.decision);
        const mugshot = confirmed && source.mugshot_url ? `<img src="${esc(source.mugshot_url)}" alt="Confirmed source mugshot" style="max-width:120px">` : "Mugshot not provided or not human-confirmed";
        const intake = detail.intake || {};
        const report = (source.matches || []).map((match) => match.record || match);
        const oscn = source.oscn || { status: "not_configured", records: [] };
        const share = confirmed ? `<button data-share="${esc(item.id)}" class="btn btn-primary mt-2">Create 24-hour family link</button>` : "";
        return `<div class="p-3 border rounded mb-2"><strong>${esc(item.id)}</strong> — ${esc(item.status)} — ${esc(item.urgency)}<br><span>${esc(detail.packet?.explanation || "Human review required")}</span><br><span class="text-sm">${mugshot}</span>${share}<details class="mt-2"><summary>Intake, booking, and OSCN report</summary><h4>Client intake</h4><pre>${esc(JSON.stringify(intake, null, 2))}</pre><h4>Booking source report</h4><pre>${esc(JSON.stringify(report, null, 2))}</pre><h4>OSCN source report (${esc(oscn.status)})</h4><pre>${esc(JSON.stringify(oscn.records || [], null, 2))}</pre><p class="text-sm">All source matches require bondsman confirmation.</p></details></div>`;
      }));
      root.innerHTML = plans() + card("Live intake consolidation", rows.join("") || "<p>No requests yet.</p>");
      root.querySelectorAll("[data-share]").forEach((button) => button.addEventListener("click", async () => {
        const response = await fetch(api + "/requests/" + encodeURIComponent(button.dataset.share) + "/share", { method: "POST", headers });
        const result = await response.json();
        if (!response.ok) return alert(result.error || "Unable to create share link");
        prompt("Copy this 24-hour family link", result.share_url);
      }));
    } catch (error) {
      root.innerHTML = plans() + card("Dashboard unavailable", `<p>${esc(error.message)}</p>`);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load); else load();
})();
