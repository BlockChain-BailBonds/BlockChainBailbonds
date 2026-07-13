/* Non-custodial wallet panel. Private keys remain inside the user's wallet. */
(function () {
  const root = document.getElementById("wallet-panel");
  if (!root) return;
  let provider;
  const clean = (v) => String(v || "").replace(/[<>"']/g, "");
  function render(body) { root.innerHTML = `<h2>918 Wallet</h2>${body}<p class="text-sm">Non-custodial: this app never receives your seed phrase or private key.</p>`; }
  async function connect() {
    provider = window.ethereum;
    if (!provider) return render("<p>Install or open a compatible browser wallet to connect.</p>");
    try {
      const accounts = await provider.request({ method: "eth_requestAccounts" });
      const chain = await provider.request({ method: "eth_chainId" });
      const balance = await provider.request({ method: "eth_getBalance", params: [accounts[0], "latest"] });
      const eth = Number(BigInt(balance)) / 1e18;
      render(`<p>Connected address:</p><code>${clean(accounts[0])}</code><p>Network: <code>${clean(chain)}</code></p><p>Native balance: ${eth.toFixed(6)}</p><button id="wallet-refresh" class="btn btn-primary">Refresh</button>`);
      document.getElementById("wallet-refresh").onclick = connect;
    } catch (error) { render(`<p>Wallet connection cancelled or unavailable: ${clean(error.message)}</p>`); }
  }
  render('<button id="wallet-connect" class="btn btn-primary">Connect wallet</button>');
  document.getElementById("wallet-connect").onclick = connect;
})();
