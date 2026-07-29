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
    root.innerHTML = `<h2>Shared booking information</h2><p><strong>${String(data.client_name || "").replace(/[<>]/g, "")}</strong></p><p>Status: ${String(data.status).replace(/[<>]/g, "")}</p><p>County: ${String(data.county || "Tulsa").replace(/[<>]/g, "")}</p>${mugshot}<details><summary>Booking report</summary><pre>${JSON.stringify(data.booking_report || [], null, 2).replace(/[<>]/g, "")}</pre></details><details><summary>OSCN report</summary><pre>${JSON.stringify(data.oscn_report || {}, null, 2).replace(/[<>]/g, "")}</pre></details><p class="text-sm">This link expires ${String(data.expires_at).replace(/[<>]/g, "")}.</p><hr><h3>BBT prepaid balance</h3><p id="bbt-balance">Loading balance...</p><form id="bbt-prepay" class="grid gap-2 max-w-md"><label>Fee type<input name="fee_type" required placeholder="Approved fee or expense" class="input"></label><label>Amount in BBT units<input name="amount_bbt" type="number" min="1" required class="input"></label><button class="btn btn-primary" type="submit">Apply prepaid credit</button><p id="bbt-message" class="text-sm text-muted"></p></form>`;
    const balance = root.querySelector("#bbt-balance");
    fetch(api + "/public/shares/" + encodeURIComponent(token) + "/prepay").then((r) => r.json().then((value) => ({ ok: r.ok, value }))).then(({ ok, value }) => {
      if (!ok) throw new Error(value.error || "Prepayment unavailable");
      balance.textContent = `${value.balance_bbt} BBT units available`;
    }).catch((error) => { balance.textContent = error.message; });
    root.querySelector("#bbt-prepay").addEventListener("submit", (event) => {
      event.preventDefault();
      const message = root.querySelector("#bbt-message");
      const body = Object.fromEntries(new FormData(event.currentTarget).entries());
      fetch(api + "/public/shares/" + encodeURIComponent(token) + "/prepay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fee_type: body.fee_type, amount_bbt: Number(body.amount_bbt) }) }).then((r) => r.json().then((value) => ({ ok: r.ok, value }))).then(({ ok, value }) => { message.textContent = ok ? `Applied ${value.amount_bbt} BBT. Remaining balance: ${value.balance_bbt}.` : (value.error || "Prepayment failed."); if (ok) balance.textContent = `${value.balance_bbt} BBT units available`; }).catch((error) => { message.textContent = error.message; });
    });
  }).catch((error) => { root.innerHTML = "<h2>Shared booking information</h2><p>" + error.message + "</p>"; });
})();
