/* Real permission handlers for the public intake form. */
(function () {
  const locationButton = document.getElementById("grant-location-btn");
  const walletButton = document.getElementById("grant-wallet-btn");
  const message = document.getElementById("intake-message");
  const setMessage = (text) => { if (message) message.textContent = text; };
  if (locationButton) locationButton.addEventListener("click", () => {
    if (!navigator.geolocation) return setMessage("Location is not supported by this browser.");
    navigator.geolocation.getCurrentPosition((position) => {
      document.getElementById("intake-latitude").value = position.coords.latitude;
      document.getElementById("intake-longitude").value = position.coords.longitude;
      locationButton.textContent = "Location shared"; locationButton.disabled = true;
      setMessage("Location shared for this intake only.");
    }, (error) => setMessage("Location was not shared: " + error.message), { enableHighAccuracy: false, maximumAge: 300000, timeout: 10000 });
  });
  if (walletButton) walletButton.addEventListener("click", async () => {
    if (!window.ethereum) return setMessage("No compatible wallet was detected.");
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      document.getElementById("intake-wallet-address").value = accounts[0];
      walletButton.textContent = "Wallet connected"; walletButton.disabled = true;
      setMessage("Wallet connected. No payment was requested.");
    } catch (error) { setMessage("Wallet was not connected: " + (error.message || "request cancelled")); }
  });
})();
