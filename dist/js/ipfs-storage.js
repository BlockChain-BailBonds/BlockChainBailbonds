/**
 * 918 Technologies BlockChain BailBonds
 * IPFS Decentralized Storage Module
 * 
 * This module handles decentralized storage of bail bond contracts and
 * related documents using the InterPlanetary File System (IPFS).
 */

// IPFS Node Configuration
let ipfs = null;
let isIpfsReady = false;
let ipfsInitPromise = null;

// Store CIDs (Content Identifiers) for contracts
const contractCIDMap = new Map();

/**
 * Initialize IPFS node
 * @returns {Promise<Object>} IPFS node instance
 */
async function initIPFS() {
  if (ipfsInitPromise) return ipfsInitPromise;
  
  ipfsInitPromise = new Promise(async (resolve, reject) => {
    try {
      // Try to import the IPFS module
      // Note: Dynamic imports are used to ensure this works in both browser and Node.js environments
      const { create } = await import('ipfs-core');
      
      console.log('Initializing IPFS node...');
      
      // Create an IPFS node
      ipfs = await create({
        repo: 'nine1eight-repo-' + Math.random(),
        start: true,
        config: {
          Addresses: {
            Swarm: [
              // Use public IPFS gateways for connectivity
              '/dns4/wrtc-star1.par.dwebops.pub/tcp/443/wss/p2p-webrtc-star',
              '/dns4/wrtc-star2.sjc.dwebops.pub/tcp/443/wss/p2p-webrtc-star'
            ]
          },
          // Bootstrap with public IPFS nodes for better connectivity
          Bootstrap: [
            '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
            '/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa'
          ]
        }
      });
      
      const nodeId = await ipfs.id();
      console.log('IPFS node initialized with ID:', nodeId.id);
      
      isIpfsReady = true;
      resolve(ipfs);
    } catch (error) {
      console.error('Failed to initialize IPFS:', error);
      
      // Fallback to HTTP client if local node fails
      try {
        const { create: createClient } = await import('ipfs-http-client');
        ipfs = createClient({ url: 'https://ipfs.infura.io:5001/api/v0' });
        console.log('Connected to Infura IPFS gateway');
        isIpfsReady = true;
        resolve(ipfs);
      } catch (fallbackError) {
        console.error('Failed to connect to IPFS gateway:', fallbackError);
        reject(fallbackError);
      }
    }
  });
  
  return ipfsInitPromise;
}

/**
 * Store a contract in IPFS
 * @param {Object} contractObject The contract object
 * @param {string} contractId Unique identifier for the contract
 * @returns {Promise<string>} Content identifier (CID) for the stored contract
 */
async function storeContractInIPFS(contractObject, contractId) {
  try {
    // Ensure IPFS is initialized
    if (!isIpfsReady) {
      await initIPFS();
    }
    
    // Convert contract to JSON
    const contractJson = JSON.stringify(contractObject);
    
    // Store the contract in IPFS
    const { cid } = await ipfs.add(contractJson);
    const cidString = cid.toString();
    
    console.log(`Contract ${contractId} stored in IPFS with CID: ${cidString}`);
    
    // Store the CID for later retrieval
    contractCIDMap.set(contractId, cidString);
    
    // Also store in localStorage for persistence
    try {
      const storedCIDs = JSON.parse(localStorage.getItem('contractCIDs') || '{}');
      storedCIDs[contractId] = cidString;
      localStorage.setItem('contractCIDs', JSON.stringify(storedCIDs));
    } catch (e) {
      console.error('Failed to store CID in localStorage:', e);
    }
    
    return cidString;
  } catch (error) {
    console.error('Failed to store contract in IPFS:', error);
    throw error;
  }
}

/**
 * Retrieve a contract from IPFS
 * @param {string} cidOrContractId CID or contract ID
 * @returns {Promise<Object>} The retrieved contract object
 */
async function retrieveContractFromIPFS(cidOrContractId) {
  try {
    // Ensure IPFS is initialized
    if (!isIpfsReady) {
      await initIPFS();
    }
    
    // Check if we were given a contract ID instead of a CID
    let cid = cidOrContractId;
    if (contractCIDMap.has(cidOrContractId)) {
      cid = contractCIDMap.get(cidOrContractId);
    } else {
      // Try to find CID in localStorage
      try {
        const storedCIDs = JSON.parse(localStorage.getItem('contractCIDs') || '{}');
        if (storedCIDs[cidOrContractId]) {
          cid = storedCIDs[cidOrContractId];
        }
      } catch (e) {
        console.error('Failed to retrieve CID from localStorage:', e);
      }
    }
    
    console.log(`Retrieving contract with CID: ${cid}`);
    
    // Retrieve the contract from IPFS
    const chunks = [];
    for await (const chunk of ipfs.cat(cid)) {
      chunks.push(chunk);
    }
    
    // Combine chunks and parse JSON
    const contractJson = new TextDecoder().decode(chunks.reduce((acc, chunk) => {
      const combined = new Uint8Array(acc.length + chunk.length);
      combined.set(acc);
      combined.set(chunk, acc.length);
      return combined;
    }, new Uint8Array(0)));
    
    return JSON.parse(contractJson);
  } catch (error) {
    console.error('Failed to retrieve contract from IPFS:', error);
    throw error;
  }
}

/**
 * Generate a public gateway URL for a contract
 * @param {string} cid Content identifier
 * @returns {string} Public gateway URL
 */
function getIPFSGatewayURL(cid) {
  return `https://ipfs.io/ipfs/${cid}`;
}

/**
 * Pin a contract to ensure persistence
 * @param {string} cid Content identifier
 * @returns {Promise<boolean>} Success status
 */
async function pinContract(cid) {
  try {
    // Ensure IPFS is initialized
    if (!isIpfsReady) {
      await initIPFS();
    }
    
    await ipfs.pin.add(cid);
    console.log(`Contract with CID ${cid} pinned successfully`);
    return true;
  } catch (error) {
    console.error('Failed to pin contract:', error);
    return false;
  }
}

/**
 * Get all stored contract CIDs
 * @returns {Object} Map of contract IDs to CIDs
 */
function getAllContractCIDs() {
  // Combine in-memory and localStorage CIDs
  const result = {};
  
  // Add from in-memory map
  for (const [contractId, cid] of contractCIDMap.entries()) {
    result[contractId] = cid;
  }
  
  // Add from localStorage
  try {
    const storedCIDs = JSON.parse(localStorage.getItem('contractCIDs') || '{}');
    Object.assign(result, storedCIDs);
  } catch (e) {
    console.error('Failed to retrieve CIDs from localStorage:', e);
  }
  
  return result;
}

// Export the IPFS storage API
window.IPFSStorage = {
  initIPFS,
  storeContractInIPFS,
  retrieveContractFromIPFS,
  getIPFSGatewayURL,
  pinContract,
  getAllContractCIDs
};
