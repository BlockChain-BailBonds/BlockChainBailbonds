// Set current year in footer
document.getElementById('current-year').textContent = new Date().getFullYear();

// Mock jail data
const mockJails = [
  {
    id: 1,
    name: "Central County Detention Facility",
    address: "123 Justice Ave, Central City, CA 90001",
    phone: "(555) 123-4567",
    coordinates: { left: "45%", top: "48%" },
    distance: 1.2,
    processingTime: "30-60 minutes",
    capacity: "85%",
    bookingsToday: 24
  },
  {
    id: 2,
    name: "Eastside Correctional Center",
    address: "456 Law St, East District, CA 90011",
    phone: "(555) 234-5678",
    coordinates: { left: "65%", top: "40%" },
    distance: 2.8,
    processingTime: "45-75 minutes",
    capacity: "72%",
    bookingsToday: 18
  },
  {
    id: 3,
    name: "Westside Municipal Jail",
    address: "789 Order Blvd, West City, CA 90024",
    phone: "(555) 345-6789",
    coordinates: { left: "30%", top: "55%" },
    distance: 3.5,
    processingTime: "20-40 minutes",
    capacity: "65%",
    bookingsToday: 15
  },
  {
    id: 4,
    name: "Northern County Correctional Facility",
    address: "101 Legal Way, North Town, CA 90042",
    phone: "(555) 456-7890",
    coordinates: { left: "52%", top: "30%" },
    distance: 4.2,
    processingTime: "60-90 minutes",
    capacity: "90%",
    bookingsToday: 32
  },
  {
    id: 5,
    name: "Southern District Holding Center",
    address: "202 Custody Ln, South City, CA 90037",
    phone: "(555) 567-8901",
    coordinates: { left: "40%", top: "65%" },
    distance: 5.1,
    processingTime: "35-55 minutes",
    capacity: "78%",
    bookingsToday: 21
  }
];

// Mock contract information
const mockContractInfo = {
  contractId: "CONT-2024051701",
  created: "May 17, 2024 - 3:15 PM",
  expiresAt: "May 17, 2024 - 11:59 PM",
  issuer: "918 Technologies Automated System",
  fee: 3000, // 10% of total bail amount
  paymentPlan: {
    initialPayment: 1000,
    monthlyPayment: 500,
    numberOfMonths: 4
  },
  bondsman: {
    id: 101,
    name: "Alex Johnson",
    company: "Freedom Bail Bonds",
    license: "BB1234567",
    phone: "(555) 987-6543"
  }
};

// User session data
let userSession = {
  fullName: "",
  birthYear: "",
  selectedJail: null
};

// DOM Elements
const emergencyButton = document.getElementById('emergency-button');
const permissionsSection = document.getElementById('permissions-section');
const grantLocationBtn = document.getElementById('grant-location-btn');
const grantWalletBtn = document.getElementById('grant-wallet-btn');
const userInfoForm = document.getElementById('user-info-form');
const emergencyForm = document.getElementById('emergency-form');
const processingSection = document.getElementById('processing-section');
const homePage = document.getElementById('home-page');
const jailSelectionPage = document.getElementById('jail-selection-page');
const foundScreen = document.getElementById('found-screen');
const progressBar = document.getElementById('progress-bar');
const progressPercent = document.getElementById('progress-percent');
const processingStatus = document.getElementById('processing-status');
const scanningLog = document.getElementById('scanning-log');
const jailsListContainer = document.getElementById('jails-list');
const jailMarkersContainer = document.getElementById('jail-markers-container');
const sortByDistance = document.getElementById('sort-by-distance');
const sortByProcessing = document.getElementById('sort-by-processing');
const jailBackBtn = document.getElementById('jail-back-btn');
const jailContinueBtn = document.getElementById('jail-continue-btn');
const userNameDisplay = document.getElementById('user-name-display');
const startOverBtn = document.getElementById('start-over-btn');

// Current sort method
let currentSort = "distance";
// Selected jail ID
let selectedJailId = null;

// Show toast notification
function showToast(title, message, variant = "default") {
  const toastContainer = document.getElementById('toast-container');
  
  const toast = document.createElement('div');
  toast.className = 'toast';
  
  if (variant === "destructive") {
    toast.style.borderLeft = "4px solid var(--destructive-color)";
  } else if (variant === "success") {
    toast.style.borderLeft = "4px solid var(--success-color)";
  } else {
    toast.style.borderLeft = "4px solid var(--primary-color)";
  }
  
  toast.innerHTML = `
    <div class="font-semibold">${title}</div>
    <div class="text-sm text-gray-600">${message}</div>
  `;
  
  toastContainer.appendChild(toast);
  
  // Remove toast after 3 seconds
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// Emergency button click
emergencyButton.addEventListener('click', () => {
  document.getElementById('emergency-button-container').classList.add('hidden');
  permissionsSection.classList.remove('hidden');
  showToast("EMERGENCY MODE ACTIVATED", "Please grant permissions to continue...", "destructive");
});

// Grant location permission
grantLocationBtn.addEventListener('click', () => {
  grantLocationBtn.innerHTML = '<i class="fas fa-check mr-2"></i>Granted';
  grantLocationBtn.classList.add('bg-success/20', 'hover:bg-success/30', 'text-success');
  grantLocationBtn.classList.remove('bg-primary', 'text-white');
  grantLocationBtn.disabled = true;
  
  showToast("Location Access Granted", "Your location is being used to find the nearest jail facility.");
  
  // Check if both permissions granted
  if (grantLocationBtn.disabled && grantWalletBtn.disabled) {
    userInfoForm.classList.remove('hidden');
  }
});

// Grant wallet permission
grantWalletBtn.addEventListener('click', () => {
  grantWalletBtn.innerHTML = '<i class="fas fa-check mr-2"></i>Granted';
  grantWalletBtn.classList.add('bg-success/20', 'hover:bg-success/30', 'text-success');
  grantWalletBtn.classList.remove('bg-primary', 'text-white');
  grantWalletBtn.disabled = true;
  
  showToast("Wallet Access Granted", "Your wallet will be used for blockchain verification and payment.");
  
  // Check if both permissions granted
  if (grantLocationBtn.disabled && grantWalletBtn.disabled) {
    userInfoForm.classList.remove('hidden');
  }
});

// Handle form submission
emergencyForm.addEventListener('submit', (e) => {
  e.preventDefault();
  
  // Get form data
  const formData = new FormData(emergencyForm);
  userSession.fullName = formData.get('fullName');
  userSession.birthYear = formData.get('birthYear');
  
  // Show processing screen
  permissionsSection.classList.add('hidden');
  processingSection.classList.remove('hidden');
  
  showToast("Processing Emergency Request", "Scanning jail booking websites for your information...");
  
  // Simulate processing with progress bar
  let progress = 0;
  const simulateProcessing = setInterval(() => {
    progress += 5;
    progressBar.style.width = `${progress}%`;
    progressPercent.textContent = `${progress}% Complete`;
    
    // Update processing status based on progress
    if (progress === 20) {
      processingStatus.textContent = "Searching for Oklahoma detention facilities...";
      scanningLog.innerHTML += "> Found Oklahoma County jail database<br>";
      scanningLog.innerHTML += "> Found 5 Oklahoma detention facilities<br>";
    } else if (progress === 40) {
      processingStatus.textContent = "Analyzing Oklahoma jail booking data...";
      scanningLog.innerHTML += "> Accessing Oklahoma booking databases...<br>";
      scanningLog.innerHTML += "> Searching for records matching " + userSession.fullName + "...<br>";
    } else if (progress === 60) {
      processingStatus.textContent = "Verifying Oklahoma inmate records...";
      scanningLog.innerHTML += "> Cross-referencing with birth year " + userSession.birthYear + "...<br>";
      scanningLog.innerHTML += "> Checking Oklahoma Department of Corrections database...<br>";
    } else if (progress === 80) {
      processingStatus.textContent = "Preparing Oklahoma facility selection...";
      scanningLog.innerHTML += "> Oklahoma location data verified<br>";
      scanningLog.innerHTML += "> Preparing Oklahoma detention facility options...<br>";
    } else if (progress >= 100) {
      clearInterval(simulateProcessing);
      processingStatus.textContent = "Oklahoma data collection complete!";
      scanningLog.innerHTML += "> Processing complete, redirecting to Oklahoma jail selection...<br>";
      
      // Show jail selection page after a short delay
      setTimeout(() => {
        processingSection.classList.add('hidden');
        homePage.classList.add('hidden');
        jailSelectionPage.classList.remove('hidden');
        
        // Set user name in display
        userNameDisplay.textContent = userSession.fullName;
        
        // Initialize jail selection
        initJailSelection();
      }, 1000);
    }
    
    // Auto-scroll the scanning log
    scanningLog.scrollTop = scanningLog.scrollHeight;
  }, 300);
});

// Initialize jail selection page
function initJailSelection() {
  // Disable continue button initially
  jailContinueBtn.disabled = true;

  // Load Oklahoma data if available
  const oklahomaData = window.OklahomaData || { counties: [], jails: [] };
  
  console.log("Oklahoma Data:", oklahomaData);
  
  // Render jail markers on map
  renderJailMarkers();
  
  // Render jail list based on current sort
  renderJailsList();
  
  // If we have Oklahoma data, add it to the page title
  if (oklahomaData && oklahomaData.counties && oklahomaData.counties.length) {
    const pageTitle = document.querySelector('.page-title');
    if (pageTitle) {
      pageTitle.innerHTML = 'Select Oklahoma Detention Facility';
    }
    
    // Update the user location information
    if (userNameDisplay && userSession) {
      // Update user session location to Oklahoma
      userSession.currentLocation = "Oklahoma";
    }
  }
}

// Render jail markers on map
function renderJailMarkers() {
  jailMarkersContainer.innerHTML = "";
  
  mockJails.forEach(jail => {
    const marker = document.createElement('div');
    marker.className = `jail-marker ${jail.id === selectedJailId ? 'selected' : ''}`;
    marker.style.left = jail.coordinates.left;
    marker.style.top = jail.coordinates.top;
    
    marker.innerHTML = `<i class="fas fa-building-shield text-xs"></i>`;
    
    // Marker click event
    marker.addEventListener('click', () => {
      selectJail(jail.id);
    });
    
    jailMarkersContainer.appendChild(marker);
  });
}

// Render jails list based on current sort
function renderJailsList() {
  // Sort jails
  const sortedJails = [...mockJails].sort((a, b) => {
    if (currentSort === "distance") {
      return a.distance - b.distance;
    } else {
      // Extract minutes from processing time and sort by the lower bound
      const aTime = parseInt(a.processingTime.split("-")[0]);
      const bTime = parseInt(b.processingTime.split("-")[0]);
      return aTime - bTime;
    }
  });
  
  // Clear container
  jailsListContainer.innerHTML = "";
  
  // Add jail cards
  sortedJails.forEach(jail => {
    const isSelected = jail.id === selectedJailId;
    
    const card = document.createElement('div');
    card.className = `bg-white rounded-lg shadow transition-all duration-300 border ${isSelected ? 'border-primary shadow-md' : 'border-gray-200 hover:shadow-sm'}`;
    card.innerHTML = `
      <div class="p-4 pb-2">
        <div class="flex justify-between items-start">
          <h3 class="text-base font-semibold">${jail.name}</h3>
          ${isSelected ? '<span class="text-[10px] px-2 py-0.5 bg-success/20 text-success rounded-full">Selected</span>' : ''}
        </div>
        <p class="text-xs text-gray-500">${jail.address}</p>
      </div>
      <div class="px-4 pt-0 pb-4">
        <div class="grid grid-cols-2 gap-2 text-xs mb-3">
          <div class="flex items-center gap-1">
            <i class="fas fa-route text-primary"></i>
            <span>${jail.distance} miles away</span>
          </div>
          <div class="flex items-center gap-1">
            <i class="fas fa-clock text-primary"></i>
            <span>${jail.processingTime}</span>
          </div>
          <div class="flex items-center gap-1">
            <i class="fas fa-users text-primary"></i>
            <span>Capacity: ${jail.capacity}</span>
          </div>
          <div class="flex items-center gap-1">
            <i class="fas fa-calendar-day text-primary"></i>
            <span>${jail.bookingsToday} bookings today</span>
          </div>
        </div>
        <button class="w-full text-sm py-1.5 rounded transition-colors ${
          isSelected ? 'bg-success text-white' : 'bg-primary text-white'
        }">
          ${isSelected ? 'Selected' : 'Select This Facility'}
        </button>
      </div>
    `;
    
    // Card click event
    card.addEventListener('click', () => {
      selectJail(jail.id);
    });
    
    jailsListContainer.appendChild(card);
  });
}

// Handle jail selection
function selectJail(jailId) {
  selectedJailId = jailId;
  
  // Save selected jail to session
  userSession.selectedJail = mockJails.find(jail => jail.id === jailId);
  
  // Enable continue button
  jailContinueBtn.disabled = false;
  
  // Update UI
  renderJailMarkers();
  renderJailsList();
  
  showToast("Facility Selected", `${userSession.selectedJail.name} has been selected.`, "success");
}

// Sort buttons
sortByDistance.addEventListener('click', () => {
  currentSort = "distance";
  sortByDistance.classList.add('bg-primary', 'text-white');
  sortByDistance.classList.remove('bg-gray-200');
  sortByProcessing.classList.add('bg-gray-200');
  sortByProcessing.classList.remove('bg-primary', 'text-white');
  renderJailsList();
});

sortByProcessing.addEventListener('click', () => {
  currentSort = "processingTime";
  sortByProcessing.classList.add('bg-primary', 'text-white');
  sortByProcessing.classList.remove('bg-gray-200');
  sortByDistance.classList.add('bg-gray-200');
  sortByDistance.classList.remove('bg-primary', 'text-white');
  renderJailsList();
});

// Back button
jailBackBtn.addEventListener('click', () => {
  jailSelectionPage.classList.add('hidden');
  processingSection.classList.add('hidden');
  permissionsSection.classList.remove('hidden');
  homePage.classList.remove('hidden');
});

// Continue button
jailContinueBtn.addEventListener('click', () => {
  if (!selectedJailId) {
    showToast("Please select a facility", "You must select a detention facility to continue.", "destructive");
    return;
  }
  
  showToast("Processing", "Generating bail bond contract...", "default");
  
  // Show processing section again with contract generation
  jailSelectionPage.classList.add('hidden');
  processingSection.classList.remove('hidden');
  
  // Reset and restart progress
  progressBar.style.width = "0%";
  progressPercent.textContent = "0% Complete";
  processingStatus.textContent = "Generating bail bond contract...";
  scanningLog.innerHTML = "> Facility selected: " + userSession.selectedJail.name + "<br>";
  scanningLog.innerHTML += "> Accessing inmate records...<br>";
  
  // Simulate contract generation
  let progress = 0;
  const simulateContractGen = setInterval(() => {
    progress += 10;
    progressBar.style.width = `${progress}%`;
    progressPercent.textContent = `${progress}% Complete`;
    
    // Update status based on progress
    if (progress === 20) {
      processingStatus.textContent = "Verifying inmate information...";
      scanningLog.innerHTML += "> Inmate record found<br>";
      scanningLog.innerHTML += "> Charges: Burglary (2nd Degree), Possession of Stolen Property<br>";
    } else if (progress === 40) {
      processingStatus.textContent = "Calculating bail amount...";
      scanningLog.innerHTML += "> Total bail amount: $30,000<br>";
    } else if (progress === 60) {
      processingStatus.textContent = "Finding available bondsmen...";
      scanningLog.innerHTML += "> Searching for bondsmen near " + userSession.selectedJail.name + "<br>";
      scanningLog.innerHTML += "> 3 bondsmen available within 10 miles<br>";
    } else if (progress === 80) {
      processingStatus.textContent = "Generating smart contract...";
      scanningLog.innerHTML += "> Preparing blockchain contract<br>";
      scanningLog.innerHTML += "> Contract ID: " + mockContractInfo.contractId + "<br>";
    } else if (progress >= 100) {
      clearInterval(simulateContractGen);
      processingStatus.textContent = "Contract successfully generated!";
      scanningLog.innerHTML += "> Bondsman notified: " + mockContractInfo.bondsman.name + " (" + mockContractInfo.bondsman.company + ")<br>";
      scanningLog.innerHTML += "> Contract deployed to blockchain<br>";
      
      // Show final success screen
      setTimeout(() => {
        processingSection.classList.add('hidden');
        foundScreen.classList.remove('hidden');
      }, 1500);
    }
    
    // Auto-scroll the scanning log
    scanningLog.scrollTop = scanningLog.scrollHeight;
  }, 500);
});

// Start over button
startOverBtn.addEventListener('click', () => {
  foundScreen.classList.add('hidden');
  homePage.classList.remove('hidden');
  document.getElementById('emergency-button-container').classList.remove('hidden');
  permissionsSection.classList.add('hidden');
  userInfoForm.classList.add('hidden');
  
  // Reset user session
  userSession = {
    fullName: "",
    birthYear: "",
    selectedJail: null
  };
  
  // Reset permissions
  grantLocationBtn.innerHTML = 'Grant Access';
  grantLocationBtn.classList.remove('bg-success/20', 'hover:bg-success/30', 'text-success');
  grantLocationBtn.classList.add('bg-primary', 'text-white');
  grantLocationBtn.disabled = false;
  
  grantWalletBtn.innerHTML = 'Grant Access';
  grantWalletBtn.classList.remove('bg-success/20', 'hover:bg-success/30', 'text-success');
  grantWalletBtn.classList.add('bg-primary', 'text-white');
  grantWalletBtn.disabled = false;
  
  // Reset form
  emergencyForm.reset();
  
  // Reset jail selection
  selectedJailId = null;
  
  showToast("Reset Complete", "Starting a new bail bond request.", "success");
});
