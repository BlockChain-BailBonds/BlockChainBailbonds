/**
 * 918 Technologies BlockChain BailBonds
 * Bondsman Actions Script
 * 
 * This script handles all bondsman-specific actions in the system,
 * integrating the multi-domain architecture and contract generation.
 */

// David L. Moss Correctional Facility Data (Tulsa, OK)
const ADMIN_DAVID_L_MOSS_ALERTS = [
  { 
    id: 'tulsa_alert_1',
    defendantName: 'Michael Thompson', 
    location: 'David L. Moss Criminal Justice Center',
    bailAmount: 50000, 
    timeAgo: '22 mins ago',
    urgency: 'urgent',
    facility: 'tulsa',
    bookingNumber: 'TUL-2023-05789',
    coordinates: { lat: 36.1557, lng: -95.9929 },
    charges: 'Felony possession of controlled substance',
    courtDate: '2025-05-15'
  },
  { 
    id: 'tulsa_alert_2',
    defendantName: 'Jessica Williams', 
    location: 'David L. Moss Criminal Justice Center',
    bailAmount: 75000, 
    timeAgo: '47 mins ago',
    urgency: 'urgent',
    facility: 'tulsa',
    bookingNumber: 'TUL-2023-05790',
    coordinates: { lat: 36.1557, lng: -95.9929 },
    charges: 'Assault and battery, domestic violence',
    courtDate: '2025-05-18'
  },
  { 
    id: 'tulsa_alert_3',
    defendantName: 'Daniel Martinez', 
    location: 'David L. Moss Criminal Justice Center',
    bailAmount: 35000, 
    timeAgo: '1.2 hours ago',
    urgency: 'new',
    facility: 'tulsa',
    bookingNumber: 'TUL-2023-05793',
    coordinates: { lat: 36.1557, lng: -95.9929 },
    charges: 'DUI, 2nd offense',
    courtDate: '2025-05-20'
  }
];

// Bondsman Dashboard Data
const DASHBOARD_DATA = {
  // Recent alerts - would be populated from the blockchain in production
  activeAlerts: [
    { 
      id: 'alert_1',
      defendantName: 'James Wilson', 
      location: 'Central County Jail',
      bailAmount: 25000, 
      timeAgo: '15 mins ago',
      urgency: 'urgent',
      coordinates: { lat: 35.4675, lng: -97.5164 }
    },
    { 
      id: 'alert_2',
      defendantName: 'Maria Rodriguez', 
      location: 'Eastern District Facility',
      bailAmount: 15000, 
      timeAgo: '43 mins ago',
      urgency: 'urgent',
      coordinates: { lat: 35.4922, lng: -97.4943 }
    },
    { 
      id: 'alert_3',
      defendantName: 'Robert Chen', 
      location: 'Southern District Jail',
      bailAmount: 30000, 
      timeAgo: '1.5 hours ago',
      urgency: 'new',
      coordinates: { lat: 35.4329, lng: -97.5307 }
    },
    { 
      id: 'alert_4',
      defendantName: 'Sarah Johnson', 
      location: 'Downtown Detention Center',
      bailAmount: 10000, 
      timeAgo: '3 hours ago',
      urgency: 'new',
      coordinates: { lat: 35.4728, lng: -97.5170 }
    }
  ],
  
  // Completed bonds - would be pulled from blockchain records
  completedBonds: [
    {
      id: 'bond_1',
      defendantName: 'David Martinez',
      bailAmount: 20000,
      premium: 2000,
      date: '2 hours ago',
      court: 'Oklahoma County District Court',
      status: 'active'
    },
    {
      id: 'bond_2',
      defendantName: 'Lisa Thompson',
      bailAmount: 15000,
      premium: 1500,
      date: '2 days ago',
      court: 'Cleveland County District Court',
      status: 'completed'
    },
    {
      id: 'bond_3',
      defendantName: 'Michael Johnson',
      bailAmount: 35000,
      premium: 3500,
      date: '5 days ago',
      court: 'Oklahoma County District Court',
      status: 'active'
    }
  ],
  
  // Summary statistics - would be calculated from blockchain data
  stats: {
    activeAlerts: 24,
    completedBonds: 18,
    revenue: 45000,
    coverageRadius: 25
  },
  
  // Subscription details - pulled from blockchain records
  subscription: {
    tier: 'Professional',
    price: 399,
    nextBillingDate: 'June 15, 2024',
    coverageArea: '25 mile radius from Los Angeles County',
    remaining: 'Unlimited'
  }
};

// Bondsman Account Information
let bondsmanAccount = {
  id: 'bnd_' + Math.random().toString(36).substring(2, 10),
  name: 'Alex Johnson',
  company: 'Fast Freedom Bail Bonds',
  license: 'OK-BB12345',
  email: 'alex@fastfreedom.com',
  phone: '(555) 123-4567',
  subscription: {
    tier: 'Professional',
    status: 'active',
    startDate: '2024-01-15',
    nextBillingDate: '2024-06-15'
  },
  serviceArea: {
    primary: 'Oklahoma County',
    radius: 25, // miles
    coordinates: { lat: 35.4729, lng: -97.5170 } // Oklahoma City
  }
};

/**
 * Initialize the bondsman dashboard with data
 */
function initializeBondsmanDashboard(isAdmin = false) {
  // Update stats overview
  document.querySelector('.stat-value:nth-child(2)').textContent = DASHBOARD_DATA.stats.activeAlerts;
  document.querySelector('.stat-value:nth-child(4)').textContent = DASHBOARD_DATA.stats.completedBonds;
  document.querySelector('.stat-value:nth-child(6)').textContent = `$${DASHBOARD_DATA.stats.revenue}k`;
  document.querySelector('.stat-value:nth-child(8)').textContent = `${DASHBOARD_DATA.stats.coverageRadius}mi`;
  
  // Add admin UI elements if admin is logged in
  if (isAdmin) {
    // Create admin panel if it doesn't exist
    if (!document.getElementById('admin-panel')) {
      createAdminPanel();
    }
    
    // Add David L. Moss specific admin controls
    setupTulsaJailAdminControls();
    
    // Show admin-only elements
    document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
    
    // Hide non-admin elements
    document.querySelectorAll('.non-admin-only').forEach(el => el.classList.add('hidden'));
  } else {
    // Hide admin-only elements for regular users
    document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));
    
    // Show non-admin elements
    document.querySelectorAll('.non-admin-only').forEach(el => el.classList.remove('hidden'));
  }
  
  // Populate active alerts table if it exists
  const alertsTable = document.querySelector('table tbody');
  if (alertsTable) {
    alertsTable.innerHTML = ''; // Clear existing rows
    
    // Filter alerts - for admin show all, for regular users filter by their coverage area
    const alertsToShow = isAdmin 
      ? [...DASHBOARD_DATA.activeAlerts, ...ADMIN_DAVID_L_MOSS_ALERTS] // Show all alerts including David L. Moss
      : DASHBOARD_DATA.activeAlerts; // Regular users only see standard alerts
    
    alertsToShow.forEach(alert => {
      const row = document.createElement('tr');
      row.className = 'border-b';
      
      // Create alert urgency badge
      const urgencyClass = alert.urgency === 'urgent' 
        ? 'bg-destructive/10 text-destructive' 
        : 'bg-primary/10 text-primary';
      
      row.innerHTML = `
        <td class="py-3 px-4">${alert.defendantName}</td>
        <td class="py-3 px-4">${alert.location}</td>
        <td class="py-3 px-4">$${alert.bailAmount.toLocaleString()}</td>
        <td class="py-3 px-4">${alert.timeAgo}</td>
        <td class="py-3 px-4"><span class="px-2 py-1 text-xs ${urgencyClass} rounded-full">${alert.urgency === 'urgent' ? 'Urgent' : 'New'}</span></td>
        <td class="py-3 px-4">
          <button class="btn btn-primary py-1 px-3 text-xs accept-alert" data-alert-id="${alert.id}">Accept</button>
        </td>
      `;
      
      alertsTable.appendChild(row);
    });
    
    // Add event listeners to accept buttons
    document.querySelectorAll('.accept-alert').forEach(button => {
      button.addEventListener('click', acceptBailAlert);
    });
  }
  
  // Set subscription information
  const subscriptionElements = document.querySelectorAll('.subscription-tier');
  if (subscriptionElements.length > 0) {
    subscriptionElements.forEach(el => {
      el.textContent = `${bondsmanAccount.subscription.tier} Plan - $${DASHBOARD_DATA.subscription.price}/month`;
    });
  }
}

/**
 * Handle accepting a bail alert
 * @param {Event} e Click event
 */
function acceptBailAlert(e) {
  const alertId = e.target.dataset.alertId;
  const alert = DASHBOARD_DATA.activeAlerts.find(alert => alert.id === alertId);
  
  if (!alert) return;
  
  // Show toast notification
  showToast('Alert Accepted', `You've accepted the bail request for ${alert.defendantName}.`, 'success');
  
  // Disable the button
  e.target.disabled = true;
  e.target.textContent = 'Accepted';
  e.target.classList.remove('btn-primary');
  e.target.classList.add('btn-success');
  
  // In a real implementation, we would:
  // 1. Send a transaction to the blockchain accepting this bail request
  // 2. Begin contract generation process
  // 3. Move to the next screen for contract signing
  
  // For demo purposes, launch the contract generation after a delay
  setTimeout(() => {
    launchContractGeneration(alert);
  }, 1500);
}

/**
 * Launch contract generation for a bail alert
 * @param {Object} alert The bail alert to generate contract for
 */
function launchContractGeneration(alert) {
  // In a production app, we would navigate to the contract generator
  // with the alert data pre-populated
  
  // Determine if this is a Tulsa/David L. Moss alert
  const isTulsaAlert = alert.location.includes("David L. Moss") || alert.facility === "tulsa";
  
  // Create contract data with appropriate fields based on alert type
  const contractData = {
    defendantName: alert.defendantName,
    bailAmount: alert.bailAmount,
    detentionFacility: alert.location,
    bondsmanName: bondsmanAccount ? bondsmanAccount.name : "Admin",
    bondsmanLicense: bondsmanAccount ? bondsmanAccount.license : "ADMIN-OK-LICENSE",
    dateRequested: new Date().toISOString(),
    court: isTulsaAlert ? "Tulsa County District Court" : "Oklahoma County Court",
    countyName: isTulsaAlert ? "Tulsa" : "Oklahoma",
    charges: alert.charges || "Pending charges",
    courtDate: alert.courtDate || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Default to 14 days later
    bookingNumber: alert.bookingNumber || ""
  };
  
  // Store the contract data in localStorage
  localStorage.setItem('current_bail_request', JSON.stringify(contractData));
  
  // Show success message
  const facilityName = isTulsaAlert ? "David L. Moss Criminal Justice Center" : alert.location;
  showToast("Contract Preparation", `Preparing bail contract for ${alert.defendantName} at ${facilityName}`, "success");
  
  // Redirect to contract generator
  window.location.href = 'bail-contract-generator.html?alert=' + alert.id;
}

/**
 * Simulates receiving a new bail alert in real time
 */
function simulateNewBailAlert() {
  // Create a new alert
  const newAlert = {
    id: 'alert_' + Date.now(),
    defendantName: 'Thomas Wright',
    location: 'Western County Jail',
    bailAmount: 40000,
    timeAgo: 'Just now',
    urgency: 'urgent',
    coordinates: { lat: 35.4832, lng: -97.5912 }
  };
  
  // Add to the beginning of alerts array
  DASHBOARD_DATA.activeAlerts.unshift(newAlert);
  
  // Update stats
  DASHBOARD_DATA.stats.activeAlerts += 1;
  document.querySelector('.stat-value:nth-child(2)').textContent = DASHBOARD_DATA.stats.activeAlerts;
  
  // Create notification
  showToast('New Bail Alert', `${newAlert.defendantName} needs bail at ${newAlert.location}`, 'destructive');
  
  // Add to table if it exists
  const alertsTable = document.querySelector('table tbody');
  if (alertsTable) {
    const row = document.createElement('tr');
    row.className = 'border-b new-alert-row';
    
    row.innerHTML = `
      <td class="py-3 px-4">${newAlert.defendantName}</td>
      <td class="py-3 px-4">${newAlert.location}</td>
      <td class="py-3 px-4">$${newAlert.bailAmount.toLocaleString()}</td>
      <td class="py-3 px-4">${newAlert.timeAgo}</td>
      <td class="py-3 px-4"><span class="px-2 py-1 text-xs bg-destructive/10 text-destructive rounded-full">Urgent</span></td>
      <td class="py-3 px-4">
        <button class="btn btn-primary py-1 px-3 text-xs accept-alert" data-alert-id="${newAlert.id}">Accept</button>
      </td>
    `;
    
    // Add at the beginning
    alertsTable.insertBefore(row, alertsTable.firstChild);
    
    // Highlight new row
    setTimeout(() => {
      row.style.backgroundColor = 'rgba(220, 38, 38, 0.05)';
    }, 0);
    setTimeout(() => {
      row.style.backgroundColor = '';
    }, 3000);
    
    // Add event listener to new button
    row.querySelector('.accept-alert').addEventListener('click', acceptBailAlert);
  }
  
  // Trigger notification sound
  const audio = new Audio('data:audio/wav;base64,UklGRqYDAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YYIDAAAfAAAA0AEMACYDRAAJAogAEgCH/h78y/pq+nX7+/2v/5UACwFnAEX/0f5P/rH+xP+1AcsD8gU2BgMFYQKw/o/6vPY/9Gvzx/SV+Mr9xAKiBoYIbQnaB1UEqf4D+FTygu61677rgu3P8kr5Of8HBH0IyQvADAsKwQQu/YH1X+8g63npBuoF7NLvIfXH+ncAkQVZCbALDQzCCTkEAPxo88brpuXH4aXgO+Lw5cnq7+/69R/9ZwNwCPEL3Q0eDcgIegHu+EzwuOlH5QDkdOQg5vHpXu/H9A76Uv+HBLEIgAuUDNQL7AhiBN3+aPn49Mzx0++g71vwQfKV9X/5Vf32AKcE0QcsCgkLfQpqCD8Fgf8r+Znzsq9Era6r16w5r9OyvreUvX3D8MhNzsLTWNmQ3triz+aR6g3uu/CU8pHzzfQc9a70gPOX8m/yCPMB9Fb1TPZx96f4mflk+iH78/ux/Ff9/v2u/nP/0QB9Av8DYwXNBisIkAnvCgUMFg0ID7URsRN+Fe8W3xcAGPEXzhfmFkgVsxJND+8Lbge/AzcA8PxJ+fL1nPOp8bXwYfCJ8C7xFfL48vL0g/by92P5gfva/U3/xwB8ArgDMwTEBF0FZwXzBB8EOAOKA9MCdQI4Au4B1QG6AXcBTwHgALgAwQBnAYABdgCi/xX+bP00/kr/fQH7ArsEOwUpBRoEMAOMArAB6AG+AgIE3AR/BbUF9wT6A4YCOwFRAH//Mf8o/z3/Gv9H/pP9TvzP+pj5Lvkb+pD7V/0K/+wAaQLaAskCWAK3AQgBwQBNAScCbgOtBFMFEQWXBAsE2ANmA9cCPQKXAeMA7v/b/q/9evy8+z779fqH+q/6F/vf+xr9nP5AAKIB5gLCAxkE4QPqAucBNwF0AeQB/QIUBJoEGAWuBEAEIQRSA/QCbgIPAuz/Pf8D/mj8D/wS+xH7dPsL+9D7KfsR+6P79Ptt/fX+JAAXAhgDyANgBI0EMgS0AzoDBgO1AjwC9wEcAQwBuACMAJUAFQDM/xn/rf6k/nz+df6m/tT+4/4X/1T/s//1/wUAAQAFABsAYQCjANEA6QD8ABMBKQENAQwB4wDeANQAbwBFAAgAuP+J/43/Z/94/2H/M/8P/9n+vv62/sv+4P77/g//H/80/1T/hP+5/7z/uP+P/43/jP9+/3X/bP9f/1z/U/80/y//Hv8a/xf/B/8M/w3/Df8Z/xn/Gf8T/xT/Jf8v/0H/Vf9s/4v/sf/X/wYALABKAGUAfQCTALMAygDhAPEA/QAUASkBQAFXAWQBbwF8AX4BiAGMAYsBlgGTAZIBjwGJAZEBjAGHAXcBXgFLATIBLQEmAQsBAwHnAMIArgCaAHkAXgA/ACsACQDr/97/yP+2/6z/mv+R/4f/eP9w/1v/V/9P/0r/S/9G/0T/Qf8//z7/OP82/zr/Pf9L/0//V/9W/1f/Yf9o/3X/gf+L/5n/ov+w/8H/1P/n//7/EwAhADQATABbAHEAgwCNAKAArwC5AMoA0QDaAOQA6wD0APsA/gABAAMA//8AAA==');
  audio.play();
}

/**
 * Initialize the workflow for a captured defendant
 * This is triggered when a user hits the "I'm Going To JAIL!" button
 * and their information appears in the bail system
 */
function initializeDefendantWorkflow(defendantInfo) {
  // In a real application, this would:
  // 1. Check if the defendant is in our coverage area
  // 2. Determine bondsman eligibility based on subscription tier
  // 3. Send notifications to eligible bondsmen
  // 4. Process responses in priority order based on tier
  
  // For demo purposes, just show a toast message
  showToast('New Defendant Alert', `${defendantInfo.name} has been detected in the system.`, 'primary');
  
  // Simulate a new bail alert after a delay
  setTimeout(simulateNewBailAlert, 5000);
}

/**
 * Prepare pre-filled form data for a contract
 * @param {string} alertId The ID of the bail alert
 * @returns {Object} Form data for contract generation
 */
function prepareContractFormData(alertId) {
  // Check regular alerts
  let alert = DASHBOARD_DATA.activeAlerts.find(a => a.id === alertId);
  
  // If not found, check David L. Moss (Tulsa) alerts
  if (!alert && Array.isArray(ADMIN_DAVID_L_MOSS_ALERTS)) {
    alert = ADMIN_DAVID_L_MOSS_ALERTS.find(a => a.id === alertId);
  }
  
  // If still not found, check localStorage
  if (!alert) {
    const storedRequest = localStorage.getItem('current_bail_request');
    if (storedRequest) {
      try {
        return JSON.parse(storedRequest);
      } catch (e) {
        console.error('Error parsing stored bail request:', e);
      }
    }
    return null;
  }
  
  // In a real application, this would retrieve defendant data
  // from the blockchain or API based on the alert
  
  return {
    bondType: 'standard',
    bondAmount: alert.bailAmount,
    chargeDescription: 'Burglary (2nd Degree)',
    courtName: 'Oklahoma County District Court',
    countyName: 'Oklahoma',
    defendantName: alert.defendantName,
    defendantDOB: '1985-06-15',
    defendantAddress: '123 Main St, Oklahoma City, OK',
    defendantPhone: '(555) 987-6543',
    bookingNumber: 'BK' + Math.floor(100000 + Math.random() * 900000),
    caseNumber: '2025-CR-' + Math.floor(1000 + Math.random() * 9000),
    indemnitorName: 'Jane Smith',
    indemnitorRelationship: 'Spouse',
    indemnitorAddress: '123 Main St, Oklahoma City, OK',
    indemnitorPhone: '(555) 123-4567',
    bondsmanName: bondsmanAccount.name,
    bondsmanLicense: bondsmanAccount.license
  };
}

/**
 * Render a bondsman activity timeline 
 * (for display in the dashboard)
 */
function renderActivityTimeline() {
  const activityContainer = document.querySelector('.space-y-3');
  if (!activityContainer) return;
  
  // Clear existing activities
  activityContainer.innerHTML = '';
  
  // Add recent activities
  const activities = [
    {
      type: 'success',
      icon: 'check-circle',
      title: 'Bond Completed: David Martinez',
      description: 'Successfully processed bail bond for $20,000',
      time: '2 hours ago'
    },
    {
      type: 'primary',
      icon: 'bell',
      title: 'New Alert: Thomas Wright',
      description: 'New bail request at Western County Jail',
      time: 'Yesterday at 9:45 PM'
    },
    {
      type: 'accent',
      icon: 'dollar-sign',
      title: 'Payment Received: $2,500',
      description: 'Commission for Johnson bail bond',
      time: 'Yesterday at 4:30 PM'
    },
    {
      type: 'primary',
      icon: 'file-contract',
      title: 'Contract Deployed',
      description: 'Bail bond contract for Lisa Thompson successfully deployed to blockchain',
      time: '2 days ago'
    }
  ];
  
  activities.forEach(activity => {
    const div = document.createElement('div');
    div.className = 'flex items-start gap-3 p-3 border-b';
    div.innerHTML = `
      <div class="text-${activity.type} flex-shrink-0">
        <i class="fas fa-${activity.icon}"></i>
      </div>
      <div>
        <p class="font-medium">${activity.title}</p>
        <p class="text-sm text-muted">${activity.description}</p>
        <p class="text-xs text-muted">${activity.time}</p>
      </div>
    `;
    activityContainer.appendChild(div);
  });
}

/**
 * Display a toast notification
 * @param {string} title The toast title
 * @param {string} message The toast message
 * @param {string} variant The toast variant (default, success, destructive)
 */
function showToast(title, message, variant = "default") {
  // If the showToast function exists globally, use it
  if (typeof window.showToast === 'function') {
    window.showToast(title, message, variant);
    return;
  }
  
  // Otherwise implement our own
  const toastContainer = document.getElementById('toast-container');
  if (!toastContainer) return;
  
  const toast = document.createElement('div');
  toast.className = 'toast';
  
  if (variant === "destructive") {
    toast.style.borderLeft = "4px solid var(--destructive)";
  } else if (variant === "success") {
    toast.style.borderLeft = "4px solid var(--success)";
  } else {
    toast.style.borderLeft = "4px solid var(--primary)";
  }
  
  toast.innerHTML = `
    <div class="font-semibold">${title}</div>
    <div class="text-sm text-muted">${message}</div>
  `;
  
  toastContainer.appendChild(toast);
  
  // Remove toast after 3 seconds
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

/**
 * Integration with domain connector
 * Handles cross-domain connections for bondsman operations
 */
function initializeBondsmanDomainConnector() {
  // If domain connector is loaded
  if (window.Nine1Eight && window.Nine1Eight.domainState) {
    console.log('Domain connector initialized for bondsman operations');
    
    // Listen for emergency activation events (when someone hits the emergency button)
    document.addEventListener('domainActionComplete', function(event) {
      const { action, data } = event.detail;
      
      if (action === 'emergencyInitiation' && data.status === 'initiated') {
        // Someone hit the emergency button and is in our service area
        initializeDefendantWorkflow(data.userInfo);
      }
    });
    
    // Add a badge to show domains are connected
    const header = document.querySelector('header');
    if (header) {
      const badge = document.createElement('div');
      badge.className = 'domain-connection-badge';
      badge.innerHTML = `
        <i class="fas fa-link text-success"></i>
        <span class="text-xs ml-1">Domains Connected</span>
      `;
      badge.style.position = 'absolute';
      badge.style.top = '0.5rem';
      badge.style.right = '0.5rem';
      badge.style.background = 'rgba(22, 163, 74, 0.1)';
      badge.style.color = 'var(--success)';
      badge.style.padding = '0.25rem 0.5rem';
      badge.style.borderRadius = '9999px';
      badge.style.display = 'flex';
      badge.style.alignItems = 'center';
      
      header.style.position = 'relative';
      header.appendChild(badge);
    }
  }
}

// Initialize dashboard when document is loaded
document.addEventListener('DOMContentLoaded', function() {
  // Only run on bondsman portal page
  if (document.getElementById('dashboard-page')) {
    initializeBondsmanDashboard();
    renderActivityTimeline();
    
    // Initialize domain connector integration
    initializeBondsmanDomainConnector();
    
    // Set up periodic new alert simulation (every 60-90 seconds)
    const randomDelay = 60000 + Math.random() * 30000;
    setTimeout(simulateNewBailAlert, randomDelay);
  }
  
  // Check if we're on contract generator page with an alert ID
  const urlParams = new URLSearchParams(window.location.search);
  const alertId = urlParams.get('alert');
  if (alertId && window.location.href.includes('bail-contract-generator.html')) {
    // If we have form pre-filling function available
    if (typeof window.prefillContractForm === 'function') {
      const formData = prepareContractFormData(alertId);
      if (formData) {
        window.prefillContractForm(formData);
      }
    }
  }
});

/**
 * Creates the admin panel for the system administrator
 */
function createAdminPanel() {
  // Create admin panel container
  const adminPanelContainer = document.createElement('div');
  adminPanelContainer.id = 'admin-panel';
  adminPanelContainer.className = 'card admin-only mt-8';
  
  // Panel header with David L. Moss info
  adminPanelContainer.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-xl font-bold flex items-center">
        <span class="bg-destructive-color text-white text-xs px-2 py-1 rounded mr-2">ADMIN</span>
        David L. Moss Criminal Justice Center - Administrator Controls
      </h2>
      <span class="text-xs text-muted">Tulsa, OK</span>
    </div>
    
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
      <div>
        <p class="text-sm font-medium mb-1">Facility Status</p>
        <div class="flex items-center">
          <span class="inline-block w-3 h-3 rounded-full bg-success-color mr-2"></span>
          <span>Online - Connected to Booking System</span>
        </div>
      </div>
      <div>
        <p class="text-sm font-medium mb-1">Total Active Defendants</p>
        <p>${ADMIN_DAVID_L_MOSS_ALERTS.length} requiring bail</p>
      </div>
      <div>
        <p class="text-sm font-medium mb-1">Facility Address</p>
        <p>300 N Denver Ave, Tulsa, OK 74103</p>
      </div>
      <div>
        <p class="text-sm font-medium mb-1">Last System Update</p>
        <p>${new Date().toLocaleString()}</p>
      </div>
    </div>
    
    <div class="mb-6">
      <h3 class="text-lg font-bold mb-3">Administrative Actions</h3>
      <div class="flex flex-wrap gap-3">
        <button id="admin-scan-bookings" class="btn btn-primary btn-sm">
          <i class="fas fa-sync-alt mr-2"></i>Scan Booking System
        </button>
        <button id="admin-mass-alert" class="btn btn-accent btn-sm">
          <i class="fas fa-bell mr-2"></i>Mass Alert Bondsmen
        </button>
        <button id="admin-system-status" class="btn btn-outline btn-sm">
          <i class="fas fa-server mr-2"></i>Check System Status
        </button>
        <button id="admin-view-logs" class="btn btn-outline btn-sm">
          <i class="fas fa-list mr-2"></i>View System Logs
        </button>
      </div>
    </div>
    
    <div>
      <h3 class="text-lg font-bold mb-3">David L. Moss Current Alerts</h3>
      <div class="overflow-x-auto">
        <table class="w-full text-sm" id="admin-alerts-table">
          <thead>
            <tr class="bg-gray-100 text-left">
              <th class="py-2 px-4 font-medium">Defendant</th>
              <th class="py-2 px-4 font-medium">Booking#</th>
              <th class="py-2 px-4 font-medium">Bail Amount</th>
              <th class="py-2 px-4 font-medium">Charges</th>
              <th class="py-2 px-4 font-medium">Court Date</th>
              <th class="py-2 px-4 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            <!-- Populated dynamically -->
          </tbody>
        </table>
      </div>
    </div>
  `;
  
  // Add admin panel to dashboard
  const dashboardContainer = document.querySelector('#dashboard-page .container');
  dashboardContainer.appendChild(adminPanelContainer);
  
  // Add event listeners to admin buttons
  document.getElementById('admin-scan-bookings').addEventListener('click', handleAdminScanBookings);
  document.getElementById('admin-mass-alert').addEventListener('click', handleAdminMassAlert);
  document.getElementById('admin-system-status').addEventListener('click', handleAdminSystemStatus);
  document.getElementById('admin-view-logs').addEventListener('click', handleAdminViewLogs);
}

/**
 * Setup Tulsa jail admin controls and alerts
 */
function setupTulsaJailAdminControls() {
  // Populate David L. Moss alerts table
  const adminAlertsTable = document.getElementById('admin-alerts-table');
  if (adminAlertsTable) {
    const tableBody = adminAlertsTable.querySelector('tbody');
    tableBody.innerHTML = ''; // Clear existing rows
    
    ADMIN_DAVID_L_MOSS_ALERTS.forEach(alert => {
      const row = document.createElement('tr');
      row.className = 'border-b';
      
      row.innerHTML = `
        <td class="py-3 px-4">${alert.defendantName}</td>
        <td class="py-3 px-4">${alert.bookingNumber}</td>
        <td class="py-3 px-4">$${alert.bailAmount.toLocaleString()}</td>
        <td class="py-3 px-4">${alert.charges}</td>
        <td class="py-3 px-4">${alert.courtDate}</td>
        <td class="py-3 px-4">
          <div class="flex gap-2">
            <button class="admin-generate-contract text-xs btn btn-sm btn-primary" data-alert-id="${alert.id}">
              Generate Contract
            </button>
            <button class="admin-view-details text-xs btn btn-sm btn-outline" data-alert-id="${alert.id}">
              Details
            </button>
          </div>
        </td>
      `;
      
      tableBody.appendChild(row);
    });
    
    // Add event listeners to buttons
    document.querySelectorAll('.admin-generate-contract').forEach(button => {
      button.addEventListener('click', (e) => {
        const alertId = e.target.dataset.alertId;
        const alert = ADMIN_DAVID_L_MOSS_ALERTS.find(a => a.id === alertId);
        if (alert) {
          launchContractGeneration(alert);
        }
      });
    });
    
    document.querySelectorAll('.admin-view-details').forEach(button => {
      button.addEventListener('click', (e) => {
        const alertId = e.target.dataset.alertId;
        const alert = ADMIN_DAVID_L_MOSS_ALERTS.find(a => a.id === alertId);
        if (alert) {
          showDefendantDetails(alert);
        }
      });
    });
  }
}

/**
 * Handler for admin "Scan Booking System" button
 */
function handleAdminScanBookings() {
  showToast("Scanning", "Connecting to David L. Moss booking system...", "default");
  
  // Simulate a scan of the booking system
  setTimeout(() => {
    showToast("Scan Complete", "Found 3 defendants requiring bail at David L. Moss facility", "success");
  }, 1500);
}

/**
 * Handler for admin "Mass Alert Bondsmen" button
 */
function handleAdminMassAlert() {
  showToast("Alerting", "Sending alerts to all bondsmen in Tulsa area...", "default");
  
  // Simulate sending alerts
  setTimeout(() => {
    showToast("Alerts Sent", "Successfully notified 12 bondsmen in the Tulsa area", "success");
  }, 1500);
}

/**
 * Handler for admin "Check System Status" button
 */
function handleAdminSystemStatus() {
  showToast("Checking", "Verifying system status across all domains...", "default");
  
  // Simulate checking system status
  setTimeout(() => {
    // Create modal for system status
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-50';
    modal.innerHTML = `
      <div class="bg-white rounded-lg shadow-lg p-6 w-full max-w-xl">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-xl font-bold">System Status</h3>
          <button class="close-modal text-gray-500 hover:text-gray-700">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="mb-4">
          <h4 class="font-bold mb-2">Domain Status</h4>
          <div class="grid grid-cols-2 gap-2">
            <div class="flex items-center">
              <span class="inline-block w-3 h-3 rounded-full bg-success-color mr-2"></span>
              <span>Nine1Eight.blockchain</span>
            </div>
            <div class="flex items-center">
              <span class="inline-block w-3 h-3 rounded-full bg-success-color mr-2"></span>
              <span>Nine1Eight.crypto</span>
            </div>
            <div class="flex items-center">
              <span class="inline-block w-3 h-3 rounded-full bg-success-color mr-2"></span>
              <span>Nine1Eight.nft</span>
            </div>
            <div class="flex items-center">
              <span class="inline-block w-3 h-3 rounded-full bg-success-color mr-2"></span>
              <span>Nine1Eight.wallet</span>
            </div>
            <div class="flex items-center">
              <span class="inline-block w-3 h-3 rounded-full bg-success-color mr-2"></span>
              <span>Nine1Eight.x</span>
            </div>
          </div>
        </div>
        <div class="mb-4">
          <h4 class="font-bold mb-2">Connected Facilities</h4>
          <div class="grid grid-cols-1 gap-2">
            <div class="flex items-center">
              <span class="inline-block w-3 h-3 rounded-full bg-success-color mr-2"></span>
              <span>David L. Moss Criminal Justice Center (Tulsa, OK)</span>
            </div>
          </div>
        </div>
        <div class="text-right mt-4">
          <button class="close-modal btn btn-primary">Close</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Add event listener to close button
    modal.querySelectorAll('.close-modal').forEach(button => {
      button.addEventListener('click', () => {
        modal.remove();
      });
    });
  }, 1500);
}

/**
 * Handler for admin "View System Logs" button
 */
function handleAdminViewLogs() {
  // Create modal for system logs
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-50';
  modal.innerHTML = `
    <div class="bg-white rounded-lg shadow-lg p-6 w-full max-w-2xl">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-xl font-bold">System Logs - David L. Moss Facility</h3>
        <button class="close-modal text-gray-500 hover:text-gray-700">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="mb-4 h-96 overflow-y-auto bg-gray-100 p-3 rounded font-mono text-xs">
        <p>[${new Date().toISOString()}] INFO: Admin login detected: founder918tech@gmail.com</p>
        <p>[${new Date().toISOString()}] INFO: David L. Moss facility connection established</p>
        <p>[${new Date().toISOString()}] INFO: Scanning booking database for new defendants</p>
        <p>[${new Date().toISOString()}] INFO: Found 3 defendants requiring bail services</p>
        <p>[${new Date().toISOString()}] INFO: Successfully generated alert for Michael Thompson (TUL-2023-05789)</p>
        <p>[${new Date().toISOString()}] INFO: Successfully generated alert for Jessica Williams (TUL-2023-05790)</p>
        <p>[${new Date().toISOString()}] INFO: Successfully generated alert for Daniel Martinez (TUL-2023-05793)</p>
        <p>[${new Date().toISOString()}] INFO: Blockchain connection active - Nine1Eight.blockchain</p>
        <p>[${new Date().toISOString()}] INFO: Crypto payment system ready - Nine1Eight.crypto</p>
        <p>[${new Date().toISOString()}] INFO: NFT certificate generator online - Nine1Eight.nft</p>
        <p>[${new Date().toISOString()}] INFO: Wallet signature system active - Nine1Eight.wallet</p>
        <p>[${new Date().toISOString()}] INFO: Profile system connected - Nine1Eight.x</p>
        <p>[${new Date().toISOString()}] INFO: System ready for bail bond generation</p>
      </div>
      <div class="text-right mt-4">
        <button class="close-modal btn btn-primary">Close</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Add event listener to close button
  modal.querySelectorAll('.close-modal').forEach(button => {
    button.addEventListener('click', () => {
      modal.remove();
    });
  });
}

/**
 * Show detailed information about a defendant
 */
function showDefendantDetails(alert) {
  // Create modal for defendant details
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-50';
  modal.innerHTML = `
    <div class="bg-white rounded-lg shadow-lg p-6 w-full max-w-2xl">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-xl font-bold">Defendant Details</h3>
        <button class="close-modal text-gray-500 hover:text-gray-700">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <p class="text-sm font-medium mb-1">Defendant Name</p>
          <p>${alert.defendantName}</p>
        </div>
        <div>
          <p class="text-sm font-medium mb-1">Booking Number</p>
          <p>${alert.bookingNumber}</p>
        </div>
        <div>
          <p class="text-sm font-medium mb-1">Facility</p>
          <p>${alert.location}</p>
        </div>
        <div>
          <p class="text-sm font-medium mb-1">Bail Amount</p>
          <p>$${alert.bailAmount.toLocaleString()}</p>
        </div>
        <div>
          <p class="text-sm font-medium mb-1">Charges</p>
          <p>${alert.charges}</p>
        </div>
        <div>
          <p class="text-sm font-medium mb-1">Court Date</p>
          <p>${alert.courtDate}</p>
        </div>
        <div>
          <p class="text-sm font-medium mb-1">Alert Created</p>
          <p>${alert.timeAgo}</p>
        </div>
        <div>
          <p class="text-sm font-medium mb-1">Alert Status</p>
          <p class="capitalize">${alert.urgency}</p>
        </div>
      </div>
      <div class="text-right gap-2 flex justify-end">
        <button class="generate-contract-btn btn btn-primary" data-alert-id="${alert.id}">
          Generate Contract
        </button>
        <button class="close-modal btn btn-outline">Close</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Add event listener to close button
  modal.querySelectorAll('.close-modal').forEach(button => {
    button.addEventListener('click', () => {
      modal.remove();
    });
  });
  
  // Add event listener to generate contract button
  modal.querySelector('.generate-contract-btn').addEventListener('click', (e) => {
    const alertId = e.target.dataset.alertId;
    const alert = ADMIN_DAVID_L_MOSS_ALERTS.find(a => a.id === alertId);
    if (alert) {
      modal.remove();
      launchContractGeneration(alert);
    }
  });
}

// Export the bondsman actions
window.BondsmanActions = {
  initializeBondsmanDashboard,
  acceptBailAlert,
  simulateNewBailAlert,
  prepareContractFormData,
  initializeDefendantWorkflow,
  createAdminPanel,
  setupTulsaJailAdminControls,
  showDefendantDetails
};
