/* Bondsman consolidation dashboard: source evidence, case status, and plans. */
(function () {
  const cfg = window.BAILBONDS_CONFIG || {};
  const api = window.BAILBONDS_API || cfg.apiBase || "";
  const token = window.BAILBONDS_ADMIN_TOKEN || sessionStorage.getItem("bailbonds_admin_token") || "";
  const esc = (v) => String(v ?? "").replace(/[&<>\"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  function card(title, body) { return `<article class="card"><h3>${esc(title)}</h3>${body}</article>`; }
  function loginCard() { return card("Licensed operator sign in", `<form id="bondsman-login" class="grid gap-3 max-w-md"><label>Email<input name="email" type="email" required autocomplete="username" class="input"></label><label>Password<input name="password" type="password" required autocomplete="current-password" class="input"></label><button class="btn btn-primary" type="submit">Sign in</button><p id="login-message" class="text-sm text-muted"></p></form>`); }
  function plans() {
    return card("Bondsman subscription", `<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div class="p-4 border rounded"><strong>Starter</strong><p>Profile, basic intake, manual notes.</p><button data-plan="starter" class="btn btn-primary">Start plan</button></div>
      <div class="p-4 border rounded"><strong>Professional</strong><p>Emergency routing, source packets, documents, reminders.</p><button data-plan="professional" class="btn btn-primary">Start plan</button></div>
      <div class="p-4 border rounded"><strong>Agency</strong><p>Staff accounts, county routing, analytics, exports.</p><button data-plan="agency" class="btn btn-primary">Start plan</button></div>
    </div><p class="text-sm text-muted">Pricing and billing are configured by the operator; this page does not collect payment credentials.</p>`);
  }
  function bindPlans(root) {
    root.querySelectorAll("[data-plan]").forEach((button) => button.addEventListener("click", async () => {
      if (!api || !token) return alert("Configure the licensed bondsman API and sign in before starting a subscription.");
      if (!window.ethereum) return alert("Connect a compatible EVM wallet to pay with crypto.");
      try {
        const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
        const result = await fetch(api + "/billing/checkout", { method: "POST", headers: { ...{"Authorization": "Bearer " + token}, "Content-Type": "application/json" }, body: JSON.stringify({ plan_id: button.dataset.plan, wallet_address: accounts[0], success_url: location.href + "?billing=success", cancel_url: location.href + "?billing=cancel" }) }).then((r) => r.json());
        if (result.status === "not_configured") return alert("Crypto billing is not configured yet.");
        if (!result.recipient || !result.amount_wei) return alert(result.error || "No payment details were returned.");
        const txHash = await window.ethereum.request({ method: "eth_sendTransaction", params: [{ from: accounts[0], to: result.recipient, value: "0x" + BigInt(result.amount_wei).toString(16) }] });
        const verified = await fetch(api + "/billing/crypto/verify", { method: "POST", headers: { ...{"Authorization": "Bearer " + token}, "Content-Type": "application/json" }, body: JSON.stringify({ tx_hash: txHash, amount_wei: result.amount_wei }) }).then((r) => r.json());
        alert(verified.status === "confirmed" ? "Payment confirmed." : "Payment submitted; confirmation is still pending.");
      } catch (error) { alert(error.message || "Wallet payment cancelled or failed."); }
    }));
  }
  function bindLogin(root) {
    const form = root.querySelector("#bondsman-login");
    if (!form) return;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const message = root.querySelector("#login-message");
      const body = Object.fromEntries(new FormData(form).entries());
      const response = await fetch(api + "/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) { message.textContent = result.error || "Sign in failed."; return; }
      sessionStorage.setItem("bailbonds_admin_token", result.token);
      location.reload();
    });
  }
  async function load() {
    const root = document.getElementById("live-bondsman-dashboard");
    if (!root) return;
    if (!api) { root.innerHTML = card("Service unavailable", "<p>Configure the API endpoint before using the operator portal.</p>"); return; }
    if (!token) { root.innerHTML = loginCard(); bindLogin(root); return; }
    root.innerHTML = plans() + card("Live intake consolidation", "<p>Loading...</p>");
    bindPlans(root);
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
      bindPlans(root);
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
