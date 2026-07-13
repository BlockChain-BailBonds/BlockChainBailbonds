(function () {
  const token = new URLSearchParams(location.search).get("share");
  const api = window.BAILBONDS_API || ((window.BAILBONDS_CONFIG || {}).apiBase || "");
  if (!token || !api) return;
  const root = document.createElement("section");
  root.className = "container mx-auto p-4 card";
  root.innerHTML = "<h2>Shared booking information</h2><p>Loading the approved report...</p>";
  document.body.prepend(root);
  fetch(api + "/public/shares/" + encodeURIComponent(token)).then((r) => r.json().then((data) => ({ ok: r.ok, data }))).then(({ ok, data }) => {
    if (!ok) throw new Error(data.error || "Share unavailable");
    const mugshot = data.mugshot_url ? `<img src="${String(data.mugshot_url).replace(/[\"']/g, "")}" alt="Booking mugshot" style="max-width:180px">` : "No mugshot supplied by the source.";
    root.innerHTML = `<h2>Shared booking information</h2><p><strong>${String(data.client_name || "").replace(/[<>]/g, "")}</strong></p><p>Status: ${String(data.status).replace(/[<>]/g, "")}</p><p>County: ${String(data.county || "Tulsa").replace(/[<>]/g, "")}</p>${mugshot}<details><summary>Booking report</summary><pre>${JSON.stringify(data.booking_report || [], null, 2).replace(/[<>]/g, "")}</pre></details><details><summary>OSCN report</summary><pre>${JSON.stringify(data.oscn_report || {}, null, 2).replace(/[<>]/g, "")}</pre></details><p class="text-sm">This link expires ${String(data.expires_at).replace(/[<>]/g, "")}.</p>`;
  }).catch((error) => { root.innerHTML = "<h2>Shared booking information</h2><p>" + error.message + "</p>"; });
})();
