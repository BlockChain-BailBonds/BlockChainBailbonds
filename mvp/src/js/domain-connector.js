/**
 * 918 Technologies BlockChain BailBonds
 * Multi-Domain Connector Script
 * 
 * This script handles the interconnection between the five Unstoppable Domains:
 * - Nine1Eight.blockchain - Primary hub & contract engine
 * - Nine1Eight.crypto - Payment processing
 * - Nine1Eight.nft - Contract verification & documentation
 * - Nine1Eight.wallet - Wallet integration
 * - Nine1Eight.x - Bondsman network
 */

// Domain Configuration
const DOMAINS = {
  blockchain: {
    url: 'https://Nine1Eight.blockchain',
    functions: ['emergencyInitiation', 'contractGeneration', 'jailScanning']
  },
  crypto: {
    url: 'https://Nine1Eight.crypto',
    functions: ['paymentProcessing', 'escrowManagement', 'feeCalculation'] 
  },
  nft: {
    url: 'https://Nine1Eight.nft',
    functions: ['contractVerification', 'documentationStorage', 'auditTrail']
  },
  wallet: {
    url: 'https://Nine1Eight.wallet',
    functions: ['walletConnection', 'proxySignature', 'emergencyAuthorization']
  },
  x: {
    url: 'https://Nine1Eight.x',
    functions: ['bondsmanPortal', 'notificationSystem', 'subscriptionManagement']
  }
};

// Domain State
const domainState = {
  currentDomain: detectCurrentDomain(),
  session: loadSession() || createNewSession(),
  initialized: false
};

/**
 * Detects which domain the user is currently on
 * @returns {string} Domain key (blockchain, crypto, nft, wallet, x)
 */
function detectCurrentDomain() {
  const hostname = window.location.hostname;
  
  // For development/testing, use path to simulate different domains
  if (hostname === 'localhost' || hostname.includes('replit')) {
    const path = window.location.pathname;
    if (path.includes('/crypto/')) return 'crypto';
    if (path.includes('/nft/')) return 'nft';
    if (path.includes('/wallet/')) return 'wallet';
    if (path.includes('/x/')) return 'x';
    return 'blockchain'; // Default domain
  }
  
  // For production on actual Unstoppable Domains
  if (hostname.includes('Nine1Eight.crypto')) return 'crypto';
  if (hostname.includes('Nine1Eight.nft')) return 'nft';
  if (hostname.includes('Nine1Eight.wallet')) return 'wallet';
  if (hostname.includes('Nine1Eight.x')) return 'x';
  return 'blockchain'; // Default domain
}

/**
 * Loads the user session from localStorage
 * @returns {Object|null} User session or null if not found
 */
function loadSession() {
  try {
    const sessionData = localStorage.getItem('bailBondsEmergencySession');
    return sessionData ? JSON.parse(sessionData) : null;
  } catch (error) {
    console.error('Error loading session:', error);
    return null;
  }
}

/**
 * Creates a new session
 * @returns {Object} New session object
 */
function createNewSession() {
  return {
    sessionId: generateSessionId(),
    timestamp: new Date().toISOString(),
    domainAccess: {
      blockchain: false,
      crypto: false,
      nft: false,
      wallet: false,
      x: false
    },
    emergencyActivated: false,
    status: 'initialized'
  };
}

/**
 * Generates a unique session ID
 * @returns {string} Session ID
 */
function generateSessionId() {
  return 'sid_' + Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

/**
 * Saves the session to localStorage
 */
function saveSession() {
  try {
    localStorage.setItem('bailBondsEmergencySession', JSON.stringify(domainState.session));
  } catch (error) {
    console.error('Error saving session:', error);
  }
}

/**
 * Initializes the cross-domain functionality
 */
function initializeDomainConnector() {
  if (domainState.initialized) return;
  
  // Mark this domain as accessed
  domainState.session.domainAccess[domainState.currentDomain] = true;
  saveSession();
  
  // Set up cross-domain message listeners
  window.addEventListener('message', handleCrossDomainMessage);
  
  // Announce this domain's presence to parent if in iframe
  if (window !== parent) {
    parent.postMessage({
      type: 'DOMAIN_READY',
      domain: domainState.currentDomain,
      sessionId: domainState.session.sessionId
    }, '*');
  }
  
  domainState.initialized = true;
  console.log(`Domain connector initialized on ${domainState.currentDomain}`);
}

/**
 * Handles messages from other domains
 * @param {MessageEvent} event Message event
 */
function handleCrossDomainMessage(event) {
  // Validate message source and format
  if (!event.data || !event.data.type) return;
  
  const { type, domain, action, data, sessionId } = event.data;
  
  // Verify session ID matches
  if (sessionId && sessionId !== domainState.session.sessionId) {
    console.error('Session ID mismatch, ignoring message');
    return;
  }
  
  console.log(`Received message: ${type} from ${domain || 'unknown'}`);
  
  switch (type) {
    case 'DOMAIN_ACTION_REQUEST':
      handleDomainActionRequest(action, data);
      break;
    case 'DOMAIN_ACTION_RESPONSE':
      handleDomainActionResponse(action, data);
      break;
    case 'EMERGENCY_ACTIVATION':
      handleEmergencyActivation(data);
      break;
    case 'SESSION_UPDATE':
      updateSession(data);
      break;
    default:
      console.log('Unknown message type:', type);
  }
}

/**
 * Handles action requests from other domains
 * @param {string} action The action to perform
 * @param {Object} data Action data
 */
function handleDomainActionRequest(action, data) {
  console.log(`Domain action request: ${action}`, data);
  
  // Check if this domain can handle the requested action
  const domainFunctions = DOMAINS[domainState.currentDomain].functions;
  if (!domainFunctions.includes(action)) {
    console.error(`This domain (${domainState.currentDomain}) cannot handle action: ${action}`);
    return;
  }
  
  // Perform the action
  let result = null;
  switch (action) {
    // Blockchain domain actions
    case 'emergencyInitiation':
      result = handleEmergencyInitiation(data);
      break;
    case 'contractGeneration':
      result = handleContractGeneration(data);
      break;
    case 'jailScanning':
      result = handleJailScanning(data);
      break;
      
    // Crypto domain actions
    case 'paymentProcessing':
      result = handlePaymentProcessing(data);
      break;
    case 'escrowManagement':
      result = handleEscrowManagement(data);
      break;
    case 'feeCalculation':
      result = handleFeeCalculation(data);
      break;
      
    // NFT domain actions
    case 'contractVerification':
      result = handleContractVerification(data);
      break;
    case 'documentationStorage':
      result = handleDocumentationStorage(data);
      break;
    case 'auditTrail':
      result = handleAuditTrail(data);
      break;
      
    // Wallet domain actions
    case 'walletConnection':
      result = handleWalletConnection(data);
      break;
    case 'proxySignature':
      result = handleProxySignature(data);
      break;
    case 'emergencyAuthorization':
      result = handleEmergencyAuthorization(data);
      break;
      
    // X domain actions
    case 'bondsmanPortal':
      result = handleBondsmanPortal(data);
      break;
    case 'notificationSystem':
      result = handleNotificationSystem(data);
      break;
    case 'subscriptionManagement':
      result = handleSubscriptionManagement(data);
      break;
      
    default:
      console.error('Unknown action:', action);
  }
  
  // Send response back
  if (data.responseChannel) {
    sendCrossDomainMessage(data.responseChannel, 'DOMAIN_ACTION_RESPONSE', {
      originalAction: action,
      result: result,
      status: 'complete'
    });
  }
}

/**
 * Handles action responses from other domains
 * @param {string} action The action that was performed
 * @param {Object} data Response data
 */
function handleDomainActionResponse(action, data) {
  console.log(`Domain action response for ${action}:`, data);
  
  // Dispatch to any waiting promises
  const responseKey = `${action}_response`;
  const waitingCallback = window[responseKey];
  if (typeof waitingCallback === 'function') {
    waitingCallback(data);
    window[responseKey] = null;
  }
  
  // Update any relevant UI
  const event = new CustomEvent('domainActionComplete', {
    detail: { action, data }
  });
  document.dispatchEvent(event);
}

/**
 * Handles emergency activation from any domain
 * @param {Object} data Emergency activation data
 */
function handleEmergencyActivation(data) {
  console.log('Emergency activation:', data);
  
  // Update session
  domainState.session.emergencyActivated = true;
  domainState.session.emergencyData = data;
  domainState.session.status = 'emergency_active';
  saveSession();
  
  // Show emergency activation UI if needed
  if (typeof showEmergencyActivationUI === 'function') {
    showEmergencyActivationUI(data);
  }
  
  // Broadcast to all domains
  broadcastToAllDomains('SESSION_UPDATE', domainState.session);
}

/**
 * Updates the session with new data
 * @param {Object} sessionData New session data
 */
function updateSession(sessionData) {
  if (!sessionData || sessionData.sessionId !== domainState.session.sessionId) {
    console.error('Invalid session update');
    return;
  }
  
  domainState.session = {
    ...domainState.session,
    ...sessionData
  };
  saveSession();
  
  // Trigger session update event
  const event = new CustomEvent('sessionUpdated', {
    detail: { session: domainState.session }
  });
  document.dispatchEvent(event);
}

/**
 * Sends a message to another domain
 * @param {string} targetDomain Domain to send message to 
 * @param {string} type Message type
 * @param {Object} data Message data
 */
function sendCrossDomainMessage(targetDomain, type, data) {
  if (!DOMAINS[targetDomain]) {
    console.error(`Unknown domain: ${targetDomain}`);
    return;
  }
  
  const message = {
    type,
    domain: domainState.currentDomain,
    sessionId: domainState.session.sessionId,
    timestamp: new Date().toISOString(),
    ...data
  };
  
  // For development (iframe-based)
  const targetIframe = document.querySelector(`iframe[data-domain="${targetDomain}"]`);
  if (targetIframe && targetIframe.contentWindow) {
    targetIframe.contentWindow.postMessage(message, '*');
    return;
  }
  
  // For production (cross-window)
  // Store in local storage for cross-domain access
  localStorage.setItem(`nine1eight_message_${Date.now()}`, JSON.stringify({
    targetDomain,
    message
  }));
  
  // If we have a window reference, use it
  if (window.domainWindows && window.domainWindows[targetDomain]) {
    window.domainWindows[targetDomain].postMessage(message, DOMAINS[targetDomain].url);
  } else {
    // Otherwise open a new window/tab
    const newWindow = window.open(`${DOMAINS[targetDomain].url}/receive-message.html`, `domain_${targetDomain}`);
    if (!window.domainWindows) window.domainWindows = {};
    window.domainWindows[targetDomain] = newWindow;
  }
}

/**
 * Broadcasts a message to all domains
 * @param {string} type Message type
 * @param {Object} data Message data
 */
function broadcastToAllDomains(type, data) {
  Object.keys(DOMAINS).forEach(domain => {
    if (domain !== domainState.currentDomain) {
      sendCrossDomainMessage(domain, type, data);
    }
  });
}

/**
 * Requests an action from another domain
 * @param {string} targetDomain Domain to request action from
 * @param {string} action Action to request
 * @param {Object} data Action data
 * @returns {Promise} Promise that resolves with the response
 */
function requestDomainAction(targetDomain, action, data = {}) {
  return new Promise((resolve, reject) => {
    // Create a unique response channel
    const responseChannel = domainState.currentDomain;
    
    // Set up response handler
    const responseKey = `${action}_response`;
    window[responseKey] = resolve;
    
    // Send request
    sendCrossDomainMessage(targetDomain, 'DOMAIN_ACTION_REQUEST', {
      action,
      data: {
        ...data,
        responseChannel
      }
    });
    
    // Timeout after 30 seconds
    setTimeout(() => {
      if (window[responseKey]) {
        window[responseKey] = null;
        reject(new Error(`Request to ${targetDomain} for ${action} timed out`));
      }
    }, 30000);
  });
}

// Blockchain Domain Action Handlers
function handleEmergencyInitiation(data) {
  console.log('Emergency initiation handler:', data);
  // Implementation would scan jail booking databases and track detainee
  return {
    status: 'initiated',
    timestamp: new Date().toISOString(),
    tracking: {
      userInfo: data.userInfo,
      locations: data.locations || [],
      active: true
    }
  };
}

function handleContractGeneration(data) {
  console.log('Contract generation handler:', data);
  // Implementation would generate smart contract for bail bond
  return {
    contractId: 'bc_' + Math.random().toString(36).substring(2, 10),
    timestamp: new Date().toISOString(),
    bailAmount: data.bailAmount || 25000,
    detaineeInfo: data.detaineeInfo || {},
    status: 'generated'
  };
}

function handleJailScanning(data) {
  console.log('Jail scanning handler:', data);
  // Implementation would scan jail booking databases
  return {
    scanComplete: true,
    found: true,
    facility: {
      name: 'Central County Detention Facility',
      id: 'jail_' + Math.random().toString(36).substring(2, 10),
      bookingRef: 'BK' + Math.floor(100000 + Math.random() * 900000)
    }
  };
}

// Crypto Domain Action Handlers
function handlePaymentProcessing(data) {
  console.log('Payment processing handler:', data);
  // Implementation would process crypto payment
  return {
    paymentId: 'pay_' + Math.random().toString(36).substring(2, 10),
    amount: data.amount,
    currency: data.currency || 'USDC',
    status: 'completed',
    txHash: '0x' + Math.random().toString(36).substring(2, 10)
  };
}

function handleEscrowManagement(data) {
  console.log('Escrow management handler:', data);
  // Implementation would manage escrow for bail payment
  return {
    escrowId: 'esc_' + Math.random().toString(36).substring(2, 10),
    status: data.action || 'created',
    amount: data.amount,
    releaseCondition: data.releaseCondition || 'confirmation'
  };
}

function handleFeeCalculation(data) {
  console.log('Fee calculation handler:', data);
  // Implementation would calculate bail bond fees
  const bailAmount = data.bailAmount || 10000;
  const feePercent = 10;
  const fee = bailAmount * (feePercent / 100);
  
  return {
    bailAmount,
    feePercent,
    fee,
    total: bailAmount + fee,
    breakdown: {
      baseFee: fee * 0.8,
      serviceFee: fee * 0.2
    }
  };
}

// NFT Domain Action Handlers
function handleContractVerification(data) {
  console.log('Contract verification handler:', data);
  // Implementation would verify bail bond contract
  return {
    verified: true,
    contractId: data.contractId,
    verificationId: 'ver_' + Math.random().toString(36).substring(2, 10),
    timestamp: new Date().toISOString()
  };
}

function handleDocumentationStorage(data) {
  console.log('Documentation storage handler:', data);
  // Implementation would store legal documents as NFTs
  return {
    documentId: 'doc_' + Math.random().toString(36).substring(2, 10),
    ipfsHash: 'Qm' + Math.random().toString(36).substring(2, 40),
    tokenId: Math.floor(1000 + Math.random() * 9000),
    status: 'stored'
  };
}

function handleAuditTrail(data) {
  console.log('Audit trail handler:', data);
  // Implementation would record audit trail entry
  return {
    auditId: 'aud_' + Math.random().toString(36).substring(2, 10),
    timestamp: new Date().toISOString(),
    action: data.action,
    actor: data.actor,
    details: data.details,
    recorded: true
  };
}

// Wallet Domain Action Handlers
function handleWalletConnection(data) {
  console.log('Wallet connection handler:', data);
  // Implementation would handle wallet connection
  return {
    connected: true,
    address: '0x' + Math.random().toString(36).substring(2, 42),
    chainId: data.chainId || 1,
    provider: data.provider || 'metamask'
  };
}

function handleProxySignature(data) {
  console.log('Proxy signature handler:', data);
  // Implementation would create proxy signature for user without device
  return {
    signatureId: 'sig_' + Math.random().toString(36).substring(2, 10),
    message: data.message,
    signature: '0x' + Math.random().toString(36).substring(2, 130),
    valid: true,
    expiresAt: new Date(Date.now() + 86400000).toISOString() // 24 hours
  };
}

function handleEmergencyAuthorization(data) {
  console.log('Emergency authorization handler:', data);
  // Implementation would authorize emergency transaction
  return {
    authorized: true,
    authId: 'auth_' + Math.random().toString(36).substring(2, 10),
    maxAmount: data.maxAmount || '5000',
    expiresAt: new Date(Date.now() + 86400000).toISOString(), // 24 hours
    limits: {
      transactions: 1,
      totalSpend: data.maxAmount || '5000'
    }
  };
}

// X Domain Action Handlers
function handleBondsmanPortal(data) {
  console.log('Bondsman portal handler:', data);
  // Implementation would handle bondsman portal action
  return {
    portalAction: data.action,
    userId: data.userId,
    status: 'success',
    timestamp: new Date().toISOString()
  };
}

function handleNotificationSystem(data) {
  console.log('Notification system handler:', data);
  // Implementation would send notification to bondsmen
  return {
    notificationId: 'not_' + Math.random().toString(36).substring(2, 10),
    recipients: data.recipients || [],
    message: data.message,
    urgency: data.urgency || 'normal',
    sent: true,
    sentAt: new Date().toISOString()
  };
}

function handleSubscriptionManagement(data) {
  console.log('Subscription management handler:', data);
  // Implementation would manage bondsman subscriptions
  return {
    userId: data.userId,
    tier: data.tier || 'basic',
    status: data.action || 'updated',
    validUntil: new Date(Date.now() + 30 * 86400000).toISOString(), // 30 days
    features: {
      radius: data.tier === 'enterprise' ? 'statewide' : 
              data.tier === 'pro' ? '25mi' : '10mi',
      priority: data.tier === 'enterprise' ? 1 : 
               data.tier === 'pro' ? 2 : 3,
      notificationChannels: data.tier === 'basic' ? ['email'] : 
                           ['email', 'sms', 'app']
    }
  };
}

// Initialize on load
document.addEventListener('DOMContentLoaded', initializeDomainConnector);

// Exports for external usage
window.Nine1Eight = {
  domainState,
  requestDomainAction,
  sendCrossDomainMessage,
  broadcastToAllDomains,
  handleEmergencyActivation
};
