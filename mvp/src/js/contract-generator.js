/**
 * Oklahoma Bail Bond Contract Generator
 * 
 * This script generates legally compliant bail bond contracts according to
 * Oklahoma state regulations. The contract generation happens on the Nine1Eight.blockchain
 * domain but interacts with other domains for verification, payment, and notification.
 * 
 * Now with multilingual support for: English, Spanish, Vietnamese, Korean, and Chinese.
 */

// Function to build contract text based on translations
function buildContractFromTranslations(contractData, language = 'en') {
  // If translations are not available, use the English template
  if (typeof ContractTranslations === 'undefined' || !ContractTranslations.getTranslation) {
    return CONTRACT_TEMPLATES.standard.replace(/\{([^}]+)\}/g, (match, key) => {
      return contractData[key] || match;
    });
  }
  
  // Get translations for this language
  const T = (key, params = {}) => ContractTranslations.getTranslation(key, params, language);
  
  // Build a contract using the translations
  return `
${T('contract.title')}
${T('contract.power_number')}: ${contractData.BOND_NUMBER}

${T('contract.know_all_men')}

${T('contract.bind_statement', { 
  DEFENDANT_NAME: contractData.DEFENDANT_NAME,
  BONDSMAN_NAME: contractData.BONDSMAN_NAME,
  BONDSMAN_LICENSE: contractData.BONDSMAN_LICENSE,
  BOND_AMOUNT: contractData.BOND_AMOUNT
})}

${T('contract.signed_sealed', { CONTRACT_DATE: contractData.CONTRACT_DATE })}

${T('contract.condition')}

${T('contract.whereas', {
  CHARGE_DESCRIPTION: contractData.CHARGE_DESCRIPTION,
  BOND_AMOUNT: contractData.BOND_AMOUNT
})}

${T('contract.now_therefore', {
  COURT_NAME: contractData.COURT_NAME,
  COUNTY_NAME: contractData.COUNTY_NAME,
  COURT_DATE: contractData.COURT_DATE,
  COURT_TIME: contractData.COURT_TIME
})}

${T('contract.provided')}

${T('contract.premium_paid', { PREMIUM_AMOUNT: contractData.PREMIUM_AMOUNT })}`;
}

// Contract templates based on Oklahoma requirements - still used as fallbacks
const CONTRACT_TEMPLATES = {
  // Standard Oklahoma bail bond contract template
  standard: `
OKLAHOMA BAIL BOND CONTRACT
APPEARANCE BOND POWER NO. {BOND_NUMBER}

KNOW ALL MEN BY THESE PRESENTS:

That we, {DEFENDANT_NAME}, as Principal, and Nine1Eight Technologies Bail Bonds, through its bondsman {BONDSMAN_NAME}, license #{BONDSMAN_LICENSE}, as Surety, are held and firmly bound unto the State of Oklahoma in the sum of {BOND_AMOUNT} DOLLARS, for the payment whereof well and truly to be made we bind ourselves, our heirs, executors, administrators, successors and assigns, jointly and severally, firmly by these presents.

SIGNED AND SEALED this {CONTRACT_DATE}.

THE CONDITION OF THIS BOND IS SUCH THAT:

WHEREAS, the above-named Principal has been charged with the offense of {CHARGE_DESCRIPTION}, in violation of the laws of the State of Oklahoma, and has been admitted to bail in the sum of {BOND_AMOUNT} DOLLARS.

NOW THEREFORE, if the said Principal shall well and truly appear before the {COURT_NAME} in {COUNTY_NAME} County, Oklahoma, at the courthouse thereof, on the {COURT_DATE} at {COURT_TIME}, and submit to the jurisdiction of the court and answer the said charge, and shall appear from day to day and term to term of said court, and not depart the same without leave, then this obligation shall be null and void, otherwise to remain in full force and effect.

PROVIDED, HOWEVER, if it is necessary to apprehend and surrender the Principal to the Court, the Principal shall be responsible for any and all expenses incurred as a result thereof.

THE PREMIUM PAID FOR THIS BOND IS: ${PREMIUM_AMOUNT} DOLLARS.

DEFENDANT INFORMATION:
Full Name: {DEFENDANT_NAME}
Birth Date: {DEFENDANT_DOB}
Address: {DEFENDANT_ADDRESS}
Phone: {DEFENDANT_PHONE}
Booking Number: {BOOKING_NUMBER}
Case Number: {CASE_NUMBER}

INDEMNITOR INFORMATION:
Name: {INDEMNITOR_NAME}
Relationship to Defendant: {INDEMNITOR_RELATIONSHIP}
Address: {INDEMNITOR_ADDRESS}
Phone: {INDEMNITOR_PHONE}

I, THE INDEMNITOR, AGREE TO THE FOLLOWING:
1. To pay Nine1Eight Technologies Bail Bonds the premium for this bail bond.
2. To reimburse Nine1Eight Technologies Bail Bonds for actual expenses incurred by the Surety in connection with the bond.
3. To indemnify Nine1Eight Technologies Bail Bonds against any and all losses not otherwise specifically prohibited by applicable law or rules.

BLOCKCHAIN VERIFICATION:
Contract Hash: {CONTRACT_HASH}
Transaction ID: {TRANSACTION_ID}
Verification Link: {VERIFICATION_LINK}

IN WITNESS WHEREOF, we have executed this Agreement the day and date first above written.

{DEFENDANT_SIGNATURE}
Defendant's Signature

{INDEMNITOR_SIGNATURE}
Indemnitor's Signature

{BONDSMAN_SIGNATURE}
Bondsman's Signature, Nine1Eight Technologies Bail Bonds
Oklahoma License # {BONDSMAN_LICENSE}
`,

  // Property bond template for Oklahoma
  property: `
OKLAHOMA PROPERTY BAIL BOND CONTRACT
APPEARANCE BOND POWER NO. {BOND_NUMBER}

KNOW ALL MEN BY THESE PRESENTS:

That we, {DEFENDANT_NAME}, as Principal, and Nine1Eight Technologies Bail Bonds, through its bondsman {BONDSMAN_NAME}, license #{BONDSMAN_LICENSE}, as Surety, are held and firmly bound unto the State of Oklahoma in the sum of {BOND_AMOUNT} DOLLARS, for the payment whereof well and truly to be made we bind ourselves, our heirs, executors, administrators, successors and assigns, jointly and severally, firmly by these presents.

SIGNED AND SEALED this {CONTRACT_DATE}.

THE CONDITION OF THIS BOND IS SUCH THAT:

WHEREAS, the above-named Principal has been charged with the offense of {CHARGE_DESCRIPTION}, in violation of the laws of the State of Oklahoma, and has been admitted to bail in the sum of {BOND_AMOUNT} DOLLARS.

NOW THEREFORE, if the said Principal shall well and truly appear before the {COURT_NAME} in {COUNTY_NAME} County, Oklahoma, at the courthouse thereof, on the {COURT_DATE} at {COURT_TIME}, and submit to the jurisdiction of the court and answer the said charge, and shall appear from day to day and term to term of said court, and not depart the same without leave, then this obligation shall be null and void, otherwise to remain in full force and effect.

PROPERTY COLLATERAL INFORMATION:
This bond is secured by the following property:
Property Address: {PROPERTY_ADDRESS}
Legal Description: {PROPERTY_LEGAL_DESCRIPTION}
Assessed Value: {PROPERTY_VALUE}
Owner(s): {PROPERTY_OWNERS}
Recorded in {RECORDING_COUNTY} County, Document # {RECORDING_NUMBER}

THE PREMIUM PAID FOR THIS BOND IS: ${PREMIUM_AMOUNT} DOLLARS.

DEFENDANT INFORMATION:
Full Name: {DEFENDANT_NAME}
Birth Date: {DEFENDANT_DOB}
Address: {DEFENDANT_ADDRESS}
Phone: {DEFENDANT_PHONE}
Booking Number: {BOOKING_NUMBER}
Case Number: {CASE_NUMBER}

INDEMNITOR/PROPERTY OWNER INFORMATION:
Name: {INDEMNITOR_NAME}
Relationship to Defendant: {INDEMNITOR_RELATIONSHIP}
Address: {INDEMNITOR_ADDRESS}
Phone: {INDEMNITOR_PHONE}

I, THE INDEMNITOR/PROPERTY OWNER, AGREE TO THE FOLLOWING:
1. To pay Nine1Eight Technologies Bail Bonds the premium for this bail bond.
2. To reimburse Nine1Eight Technologies Bail Bonds for actual expenses incurred by the Surety in connection with the bond.
3. To indemnify Nine1Eight Technologies Bail Bonds against any and all losses not otherwise specifically prohibited by applicable law or rules.
4. That the above-described property is being pledged as collateral for this bail bond and that a lien may be placed on said property.
5. In the event the defendant fails to appear in court as required, the property may be subject to forfeiture to satisfy the bail amount.

BLOCKCHAIN VERIFICATION:
Contract Hash: {CONTRACT_HASH}
Transaction ID: {TRANSACTION_ID}
Verification Link: {VERIFICATION_LINK}
Property Records Hash: {PROPERTY_RECORDS_HASH}

IN WITNESS WHEREOF, we have executed this Agreement the day and date first above written.

{DEFENDANT_SIGNATURE}
Defendant's Signature

{INDEMNITOR_SIGNATURE}
Indemnitor/Property Owner's Signature

{BONDSMAN_SIGNATURE}
Bondsman's Signature, Nine1Eight Technologies Bail Bonds
Oklahoma License # {BONDSMAN_LICENSE}
`,

  // Cash bond template for Oklahoma
  cash: `
OKLAHOMA CASH BAIL BOND CONTRACT
APPEARANCE BOND POWER NO. {BOND_NUMBER}

KNOW ALL MEN BY THESE PRESENTS:

That we, {DEFENDANT_NAME}, as Principal, and Nine1Eight Technologies Bail Bonds, through its bondsman {BONDSMAN_NAME}, license #{BONDSMAN_LICENSE}, as Surety, are held and firmly bound unto the State of Oklahoma in the sum of {BOND_AMOUNT} DOLLARS, for the payment whereof well and truly to be made we bind ourselves, our heirs, executors, administrators, successors and assigns, jointly and severally, firmly by these presents.

SIGNED AND SEALED this {CONTRACT_DATE}.

THE CONDITION OF THIS BOND IS SUCH THAT:

WHEREAS, the above-named Principal has been charged with the offense of {CHARGE_DESCRIPTION}, in violation of the laws of the State of Oklahoma, and has been admitted to bail in the sum of {BOND_AMOUNT} DOLLARS.

NOW THEREFORE, if the said Principal shall well and truly appear before the {COURT_NAME} in {COUNTY_NAME} County, Oklahoma, at the courthouse thereof, on the {COURT_DATE} at {COURT_TIME}, and submit to the jurisdiction of the court and answer the said charge, and shall appear from day to day and term to term of said court, and not depart the same without leave, then this obligation shall be null and void, otherwise to remain in full force and effect.

CASH COLLATERAL INFORMATION:
This bond is secured by cash collateral in the amount of: ${CASH_COLLATERAL_AMOUNT} DOLLARS
Method of payment: {PAYMENT_METHOD}
Cryptocurrency Payment Details: {CRYPTO_PAYMENT_DETAILS}
Transaction Hash: {PAYMENT_TRANSACTION_HASH}
Date Received: {PAYMENT_DATE}

THE PREMIUM PAID FOR THIS BOND IS: ${PREMIUM_AMOUNT} DOLLARS.

DEFENDANT INFORMATION:
Full Name: {DEFENDANT_NAME}
Birth Date: {DEFENDANT_DOB}
Address: {DEFENDANT_ADDRESS}
Phone: {DEFENDANT_PHONE}
Booking Number: {BOOKING_NUMBER}
Case Number: {CASE_NUMBER}

INDEMNITOR INFORMATION:
Name: {INDEMNITOR_NAME}
Relationship to Defendant: {INDEMNITOR_RELATIONSHIP}
Address: {INDEMNITOR_ADDRESS}
Phone: {INDEMNITOR_PHONE}

CASH COLLATERAL AGREEMENT:
1. The cash collateral shall be held in trust by Nine1Eight Technologies Bail Bonds until the bond is exonerated by the court.
2. Upon exoneration of the bond, the cash collateral, less any fees due, shall be returned to the indemnitor within 14 business days.
3. If the defendant fails to appear as required, the entire cash collateral may be forfeited.
4. For cryptocurrency payments, the equivalent USD value at time of transaction completion will be considered the cash collateral amount.

BLOCKCHAIN VERIFICATION:
Contract Hash: {CONTRACT_HASH}
Transaction ID: {TRANSACTION_ID}
Verification Link: {VERIFICATION_LINK}
Escrow Contract Address: {ESCROW_CONTRACT_ADDRESS}

IN WITNESS WHEREOF, we have executed this Agreement the day and date first above written.

{DEFENDANT_SIGNATURE}
Defendant's Signature

{INDEMNITOR_SIGNATURE}
Indemnitor's Signature

{BONDSMAN_SIGNATURE}
Bondsman's Signature, Nine1Eight Technologies Bail Bonds
Oklahoma License # {BONDSMAN_LICENSE}
`
};

// Oklahoma county data
const OKLAHOMA_COUNTIES = [
  { name: "Adair" },
  { name: "Alfalfa" },
  { name: "Atoka" },
  { name: "Beaver" },
  { name: "Beckham" },
  { name: "Blaine" },
  { name: "Bryan" },
  { name: "Caddo" },
  { name: "Canadian" },
  { name: "Carter" },
  { name: "Cherokee" },
  { name: "Choctaw" },
  { name: "Cimarron" },
  { name: "Cleveland" },
  { name: "Coal" },
  { name: "Comanche" },
  { name: "Cotton" },
  { name: "Craig" },
  { name: "Creek" },
  { name: "Custer" },
  { name: "Delaware" },
  { name: "Dewey" },
  { name: "Ellis" },
  { name: "Garfield" },
  { name: "Garvin" },
  { name: "Grady" },
  { name: "Grant" },
  { name: "Greer" },
  { name: "Harmon" },
  { name: "Harper" },
  { name: "Haskell" },
  { name: "Hughes" },
  { name: "Jackson" },
  { name: "Jefferson" },
  { name: "Johnston" },
  { name: "Kay" },
  { name: "Kingfisher" },
  { name: "Kiowa" },
  { name: "Latimer" },
  { name: "Le Flore" },
  { name: "Lincoln" },
  { name: "Logan" },
  { name: "Love" },
  { name: "Major" },
  { name: "Marshall" },
  { name: "Mayes" },
  { name: "McClain" },
  { name: "McCurtain" },
  { name: "McIntosh" },
  { name: "Murray" },
  { name: "Muskogee" },
  { name: "Noble" },
  { name: "Nowata" },
  { name: "Okfuskee" },
  { name: "Oklahoma" },
  { name: "Okmulgee" },
  { name: "Osage" },
  { name: "Ottawa" },
  { name: "Pawnee" },
  { name: "Payne" },
  { name: "Pittsburg" },
  { name: "Pontotoc" },
  { name: "Pottawatomie" },
  { name: "Pushmataha" },
  { name: "Roger Mills" },
  { name: "Rogers" },
  { name: "Seminole" },
  { name: "Sequoyah" },
  { name: "Stephens" },
  { name: "Texas" },
  { name: "Tillman" },
  { name: "Tulsa" },
  { name: "Wagoner" },
  { name: "Washington" },
  { name: "Washita" },
  { name: "Woods" },
  { name: "Woodward" }
];

// Oklahoma courts
const OKLAHOMA_COURTS = [
  { name: "District Court" },
  { name: "Municipal Court" },
  { name: "County Court" },
  { name: "Special District Court" }
];

// Oklahoma common offenses
const OKLAHOMA_COMMON_OFFENSES = [
  { name: "Public Intoxication", category: "Misdemeanor" },
  { name: "Driving Under the Influence (DUI)", category: "Misdemeanor/Felony" },
  { name: "Possession of Controlled Dangerous Substance", category: "Misdemeanor/Felony" },
  { name: "Domestic Assault and Battery", category: "Misdemeanor/Felony" },
  { name: "Theft/Larceny", category: "Misdemeanor/Felony" },
  { name: "Burglary", category: "Felony" },
  { name: "Assault and Battery", category: "Misdemeanor/Felony" },
  { name: "Driving While License Suspended", category: "Misdemeanor" },
  { name: "Possession of Drug Paraphernalia", category: "Misdemeanor" },
  { name: "Violation of Protective Order", category: "Misdemeanor/Felony" },
  { name: "Public Lewdness", category: "Misdemeanor" },
  { name: "Trespassing", category: "Misdemeanor" },
  { name: "Resisting Arrest", category: "Misdemeanor" },
  { name: "False Impersonation", category: "Felony" },
  { name: "Unauthorized Use of a Vehicle", category: "Felony" },
  { name: "Possession with Intent to Distribute", category: "Felony" },
  { name: "Robbery", category: "Felony" },
  { name: "Forgery", category: "Felony" },
  { name: "Embezzlement", category: "Felony" },
  { name: "Obtaining Money by False Pretense", category: "Felony" }
];

/**
 * Calculate the premium amount based on bail amount according to Oklahoma regulations
 * @param {number} bailAmount The bail amount in dollars
 * @returns {number} The premium amount in dollars
 */
function calculatePremium(bailAmount) {
  // In Oklahoma, the standard premium is typically 10%
  return bailAmount * 0.10;
}

/**
 * Generate a unique bond number
 * @returns {string} A bond number in the Oklahoma format
 */
function generateBondNumber() {
  const prefix = "OK";
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Calculate cryptographic hash for the contract (for blockchain storage)
 * @param {string} contractText The full text of the contract
 * @returns {string} Hash of the contract
 */
function calculateContractHash(contractText) {
  // This is a simple implementation - in production, use a proper hashing algorithm
  // Simulating a SHA-256 hash
  let hash = 0;
  for (let i = 0; i < contractText.length; i++) {
    const char = contractText.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return '0x' + Math.abs(hash).toString(16).padStart(64, '0');
}

/**
 * Generate a blockchain transaction ID
 * @returns {string} A mock transaction ID
 */
function generateTransactionId() {
  let result = '0x';
  const characters = '0123456789abcdef';
  for (let i = 0; i < 64; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

/**
 * Generate a verification link for the contract on the blockchain
 * @param {string} contractHash The hash of the contract
 * @returns {string} URL to verify the contract
 */
function generateVerificationLink(contractHash) {
  return `https://Nine1Eight.nft/verify/${contractHash}`;
}

/**
 * Format a date in the format required by Oklahoma bail bond contracts
 * @param {Date} date The date to format
 * @returns {string} Formatted date string
 */
function formatContractDate(date) {
  const options = { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  };
  return date.toLocaleDateString('en-US', options);
}

/**
 * Generate an Oklahoma bail bond contract based on provided data
 * @param {Object} contractData Data for the contract
 * @returns {Object} The generated contract object
 */
function generateOklahomaBailBondContract(contractData) {
  // Set default bond type if not specified
  const bondType = contractData.bondType || 'standard';
  
  // Get the appropriate template
  let contractTemplate = CONTRACT_TEMPLATES[bondType];
  if (!contractTemplate) {
    console.error(`Unknown bond type: ${bondType}. Using standard template.`);
    contractTemplate = CONTRACT_TEMPLATES.standard;
  }
  
  // Get current language from language selector
  const languageSelector = document.getElementById('language-selector');
  const currentLanguage = languageSelector ? languageSelector.value : 'en';
  
  // Calculate the premium amount based on bail amount
  const premiumAmount = calculatePremium(contractData.bondAmount).toFixed(2);
  
  // Generate a unique bond number
  const bondNumber = generateBondNumber();
  
  // Format the contract date
  const contractDate = formatContractDate(new Date());
  
  // Generate court date (typically 30 days from now for first appearance)
  const courtDate = new Date();
  courtDate.setDate(courtDate.getDate() + 30);
  const formattedCourtDate = formatContractDate(courtDate);
  
  // Generate a random court time between 8:30 AM and 3:30 PM
  const courtHour = 8 + Math.floor(Math.random() * 7);
  const courtMinute = Math.random() < 0.5 ? '00' : '30';
  const courtTime = `${courtHour}:${courtMinute} ${courtHour >= 12 ? 'PM' : 'AM'}`;
  
  // Create a complete contract object with all required fields
  let contractWithPlaceholders = contractTemplate
    .replace(/{BOND_NUMBER}/g, bondNumber)
    .replace(/{DEFENDANT_NAME}/g, contractData.defendantName || '[DEFENDANT NAME]')
    .replace(/{BONDSMAN_NAME}/g, contractData.bondsmanName || '[BONDSMAN NAME]')
    .replace(/{BONDSMAN_LICENSE}/g, contractData.bondsmanLicense || '[LICENSE NUMBER]')
    .replace(/{BOND_AMOUNT}/g, (contractData.bondAmount || 0).toLocaleString())
    .replace(/{PREMIUM_AMOUNT}/g, premiumAmount)
    .replace(/{CONTRACT_DATE}/g, contractDate)
    .replace(/{CHARGE_DESCRIPTION}/g, contractData.chargeDescription || '[CHARGE DESCRIPTION]')
    .replace(/{COURT_NAME}/g, contractData.courtName || '[COURT NAME]')
    .replace(/{COUNTY_NAME}/g, contractData.countyName || '[COUNTY NAME]')
    .replace(/{COURT_DATE}/g, formattedCourtDate)
    .replace(/{COURT_TIME}/g, courtTime)
    .replace(/{DEFENDANT_DOB}/g, contractData.defendantDOB || '[DATE OF BIRTH]')
    .replace(/{DEFENDANT_ADDRESS}/g, contractData.defendantAddress || '[ADDRESS]')
    .replace(/{DEFENDANT_PHONE}/g, contractData.defendantPhone || '[PHONE NUMBER]')
    .replace(/{BOOKING_NUMBER}/g, contractData.bookingNumber || '[BOOKING NUMBER]')
    .replace(/{CASE_NUMBER}/g, contractData.caseNumber || '[CASE NUMBER]')
    .replace(/{INDEMNITOR_NAME}/g, contractData.indemnitorName || '[INDEMNITOR NAME]')
    .replace(/{INDEMNITOR_RELATIONSHIP}/g, contractData.indemnitorRelationship || '[RELATIONSHIP]')
    .replace(/{INDEMNITOR_ADDRESS}/g, contractData.indemnitorAddress || '[ADDRESS]')
    .replace(/{INDEMNITOR_PHONE}/g, contractData.indemnitorPhone || '[PHONE NUMBER]')
    .replace(/{DEFENDANT_SIGNATURE}/g, '_______________________________')
    .replace(/{INDEMNITOR_SIGNATURE}/g, '_______________________________')
    .replace(/{BONDSMAN_SIGNATURE}/g, '_______________________________');
  
  // Add property-specific fields if it's a property bond
  if (bondType === 'property') {
    contractWithPlaceholders = contractWithPlaceholders
      .replace(/{PROPERTY_ADDRESS}/g, contractData.propertyAddress || '[PROPERTY ADDRESS]')
      .replace(/{PROPERTY_LEGAL_DESCRIPTION}/g, contractData.propertyLegalDescription || '[LEGAL DESCRIPTION]')
      .replace(/{PROPERTY_VALUE}/g, (contractData.propertyValue || 0).toLocaleString())
      .replace(/{PROPERTY_OWNERS}/g, contractData.propertyOwners || '[PROPERTY OWNERS]')
      .replace(/{RECORDING_COUNTY}/g, contractData.recordingCounty || '[RECORDING COUNTY]')
      .replace(/{RECORDING_NUMBER}/g, contractData.recordingNumber || '[RECORDING NUMBER]')
      .replace(/{PROPERTY_RECORDS_HASH}/g, generateTransactionId());
  }
  
  // Add cash-specific fields if it's a cash bond
  if (bondType === 'cash') {
    contractWithPlaceholders = contractWithPlaceholders
      .replace(/{CASH_COLLATERAL_AMOUNT}/g, (contractData.cashCollateralAmount || 0).toLocaleString())
      .replace(/{PAYMENT_METHOD}/g, contractData.paymentMethod || '[PAYMENT METHOD]')
      .replace(/{CRYPTO_PAYMENT_DETAILS}/g, contractData.cryptoPaymentDetails || '[CRYPTO PAYMENT DETAILS]')
      .replace(/{PAYMENT_TRANSACTION_HASH}/g, contractData.paymentTransactionHash || generateTransactionId())
      .replace(/{PAYMENT_DATE}/g, contractData.paymentDate || contractDate)
      .replace(/{ESCROW_CONTRACT_ADDRESS}/g, contractData.escrowContractAddress || generateTransactionId());
  }
  
  // Generate blockchain verification fields
  const contractHash = calculateContractHash(contractWithPlaceholders);
  const transactionId = generateTransactionId();
  const verificationLink = generateVerificationLink(contractHash);
  
  // Add the blockchain fields
  const finalContract = contractWithPlaceholders
    .replace(/{CONTRACT_HASH}/g, contractHash)
    .replace(/{TRANSACTION_ID}/g, transactionId)
    .replace(/{VERIFICATION_LINK}/g, verificationLink);
  
  // Try to use the multilingual contract if translations are available
  let contractText = finalContract;
  
  // If translations exist, try to generate a multilingual contract
  if (typeof ContractTranslations !== 'undefined' && 
      typeof ContractTranslations.getTranslation === 'function' && 
      typeof buildContractFromTranslations === 'function') {
    
    // Prepare contract data for translation
    const translationData = {
      BOND_NUMBER: bondNumber,
      DEFENDANT_NAME: contractData.defendantName,
      BONDSMAN_NAME: contractData.bondsmanName,
      BONDSMAN_LICENSE: contractData.bondsmanLicense,
      BOND_AMOUNT: contractData.bondAmount?.toLocaleString() || '0',
      CONTRACT_DATE: contractDate,
      CHARGE_DESCRIPTION: contractData.chargeDescription,
      COURT_NAME: contractData.courtName,
      COUNTY_NAME: contractData.countyName,
      COURT_DATE: formattedCourtDate,
      COURT_TIME: courtTime,
      PREMIUM_AMOUNT: premiumAmount
    };
    
    // Try to get the translated contract
    try {
      const translatedContract = buildContractFromTranslations(translationData, currentLanguage);
      if (translatedContract) {
        contractText = translatedContract;
        console.log(`Contract generated in ${currentLanguage} language`);
      }
    } catch (e) {
      console.error('Error generating translated contract:', e);
      // Fall back to the English template (already in finalContract)
    }
  }
  
  // Return the complete contract data
  return {
    contractText: contractText,
    contractId: bondNumber,
    contractHash,
    transactionId,
    verificationLink,
    language: currentLanguage,
    contractData: {
      ...contractData,
      bondNumber,
      premiumAmount,
      contractDate,
      courtDate: formattedCourtDate,
      courtTime
    }
  };
}

/**
 * Generate a bail bond contract in HTML format for display
 * @param {Object} contractObject The contract object
 * @returns {string} HTML representation of the contract
 */
function generateContractHTML(contractObject) {
  const contractText = contractObject.contractText;
  const language = contractObject.language || 'en';
  
  // Convert plain text contract to HTML with language-specific handling
  let htmlContract = contractText.replace(/\n/g, '<br>');
  
  // If we have explicit language information, use tailored regex
  if (language !== 'en') {
    // Create patterns for section headings in this language
    if (typeof ContractTranslations !== 'undefined' && typeof ContractTranslations.getTranslation === 'function') {
      const T = (key) => ContractTranslations.getTranslation(key, {}, language);
      
      // Create regex-safe versions of translated headings
      const titlePattern = escapeRegExp(T('contract.title'));
      const powerNoPattern = escapeRegExp(T('contract.power_number'));
      const knowAllMenPattern = escapeRegExp(T('contract.know_all_men'));
      const conditionPattern = escapeRegExp(T('contract.condition'));
      const defendantInfoPattern = escapeRegExp(T('contract.defendant_info'));
      const indemnitorInfoPattern = escapeRegExp(T('contract.indemnitor_info'));
      const propertyCollateralPattern = escapeRegExp(T('contract.property_collateral'));
      const cashCollateralPattern = escapeRegExp(T('contract.cash_collateral'));
      const cashAgreementPattern = escapeRegExp(T('contract.cash_agreement'));
      const indemnitorAgreementPattern = escapeRegExp(T('contract.indemnitor_agreement'));
      const blockchainVerificationPattern = escapeRegExp(T('contract.blockchain_verification'));
      const inWitnessPattern = escapeRegExp(T('contract.in_witness'));
      const contractHashPattern = escapeRegExp(T('contract.contract_hash'));
      const transactionIdPattern = escapeRegExp(T('contract.transaction_id'));
      const verificationLinkPattern = escapeRegExp(T('contract.verification_link'));
      
      // Apply language-specific replacements
      htmlContract = htmlContract
        .replace(new RegExp(titlePattern, 'g'), `<h2>${T('contract.title')}</h2>`)
        .replace(new RegExp(`${powerNoPattern}: (.*)`, 'g'), `<p class="bond-number">${T('contract.power_number')}: <strong>$1</strong></p>`)
        .replace(new RegExp(knowAllMenPattern, 'g'), `<h3>${T('contract.know_all_men')}</h3>`)
        .replace(new RegExp(conditionPattern, 'g'), `<h3>${T('contract.condition')}</h3>`)
        .replace(new RegExp(defendantInfoPattern, 'g'), `<h3>${T('contract.defendant_info')}</h3>`)
        .replace(new RegExp(indemnitorInfoPattern, 'g'), `<h3>${T('contract.indemnitor_info')}</h3>`)
        .replace(new RegExp(propertyCollateralPattern, 'g'), `<h3>${T('contract.property_collateral')}</h3>`)
        .replace(new RegExp(cashCollateralPattern, 'g'), `<h3>${T('contract.cash_collateral')}</h3>`)
        .replace(new RegExp(cashAgreementPattern, 'g'), `<h3>${T('contract.cash_agreement')}</h3>`)
        .replace(new RegExp(indemnitorAgreementPattern, 'g'), `<h3>${T('contract.indemnitor_agreement')}</h3>`)
        .replace(new RegExp(blockchainVerificationPattern, 'g'), `<h3>${T('contract.blockchain_verification')}</h3>`)
        .replace(new RegExp(inWitnessPattern, 'g'), `<h3>${T('contract.in_witness')}</h3>`)
        .replace(new RegExp(`${contractHashPattern}: (0x[a-f0-9]+)`, 'g'), `${T('contract.contract_hash')}: <code>$1</code>`)
        .replace(new RegExp(`${transactionIdPattern}: (0x[a-f0-9]+)`, 'g'), `${T('contract.transaction_id')}: <code>$1</code>`)
        .replace(new RegExp(`${verificationLinkPattern}: (https:\\/\\/.*)`, 'g'), `${T('contract.verification_link')}: <a href="$1" target="_blank">$1</a>`);
    }
  } else {
    // English language formatted using regex
    htmlContract = htmlContract
      .replace(/OKLAHOMA (.*?) BAIL BOND CONTRACT/g, '<h2>OKLAHOMA $1 BAIL BOND CONTRACT</h2>')
      .replace(/APPEARANCE BOND POWER NO\. (.*)/g, '<p class="bond-number">APPEARANCE BOND POWER NO. <strong>$1</strong></p>')
      .replace(/KNOW ALL MEN BY THESE PRESENTS:/g, '<h3>KNOW ALL MEN BY THESE PRESENTS:</h3>')
      .replace(/THE CONDITION OF THIS BOND IS SUCH THAT:/g, '<h3>THE CONDITION OF THIS BOND IS SUCH THAT:</h3>')
      .replace(/DEFENDANT INFORMATION:/g, '<h3>DEFENDANT INFORMATION:</h3>')
      .replace(/INDEMNITOR INFORMATION:/g, '<h3>INDEMNITOR INFORMATION:</h3>')
      .replace(/PROPERTY COLLATERAL INFORMATION:/g, '<h3>PROPERTY COLLATERAL INFORMATION:</h3>')
      .replace(/CASH COLLATERAL INFORMATION:/g, '<h3>CASH COLLATERAL INFORMATION:</h3>')
      .replace(/CASH COLLATERAL AGREEMENT:/g, '<h3>CASH COLLATERAL AGREEMENT:</h3>')
      .replace(/I, THE INDEMNITOR.*?AGREE TO THE FOLLOWING:/g, '<h3>I, THE INDEMNITOR AGREE TO THE FOLLOWING:</h3>')
      .replace(/BLOCKCHAIN VERIFICATION:/g, '<h3>BLOCKCHAIN VERIFICATION:</h3>')
      .replace(/IN WITNESS WHEREOF/g, '<h3>IN WITNESS WHEREOF</h3>')
      .replace(/Contract Hash: (0x[a-f0-9]+)/g, 'Contract Hash: <code>$1</code>')
      .replace(/Transaction ID: (0x[a-f0-9]+)/g, 'Transaction ID: <code>$1</code>')
      .replace(/Verification Link: (https:\/\/.*)/g, 'Verification Link: <a href="$1" target="_blank">$1</a>')
      .replace(/Escrow Contract Address: (0x[a-f0-9]+)/g, 'Escrow Contract Address: <code>$1</code>')
      .replace(/Property Records Hash: (0x[a-f0-9]+)/g, 'Property Records Hash: <code>$1</code>');
  }
  
  // Add language indicator
  let languageName = language;
  if (typeof ContractTranslations !== 'undefined' && ContractTranslations.SUPPORTED_LANGUAGES) {
    languageName = ContractTranslations.SUPPORTED_LANGUAGES[language] || language;
  }
  
  // Return the complete HTML document
  return `
    <div class="contract-document">
      <div class="contract-watermark">918 Technologies</div>
      <div class="contract-language">${languageName}</div>
      <div class="contract-content">
        ${htmlContract}
      </div>
      <div class="contract-footer">
        <p>Generated by Nine1Eight.blockchain · Verified by Nine1Eight.nft · Secured by Nine1Eight.crypto</p>
      </div>
    </div>
  `;
}

// Helper function to escape special characters for use in regex
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Convert contract to blockchain-ready format
 * @param {Object} contractObject The contract object
 * @returns {Object} Blockchain-ready contract data
 */
function prepareContractForBlockchain(contractObject) {
  // Extract critical contract information
  const { 
    contractId, 
    contractHash, 
    transactionId, 
    verificationLink,
    contractData
  } = contractObject;
  
  // Create a blockchain-ready object with important data only
  return {
    contractId,
    contractHash,
    transactionId,
    bondAmount: contractData.bondAmount,
    premiumAmount: contractData.premiumAmount,
    defendantName: contractData.defendantName,
    bondsmanName: contractData.bondsmanName,
    bondsmanLicense: contractData.bondsmanLicense,
    courtDate: contractData.courtDate,
    contractDate: contractData.contractDate,
    verificationLink,
    timestamp: Date.now(),
    contractType: contractData.bondType || 'standard'
  };
}

/**
 * Signs the contract with the indemnitor's signature
 * @param {Object} contractObject The contract object
 * @param {string} signature Base64 encoded signature data
 * @returns {Object} Updated contract object with signature
 */
function signContractByIndemnitor(contractObject, signature) {
  let updatedContractText = contractObject.contractText.replace(
    /{INDEMNITOR_SIGNATURE}/g, 
    signature ? "Digitally Signed: " + signature.substring(0, 15) + "..." : "___________________________"
  );
  
  return {
    ...contractObject,
    contractText: updatedContractText,
    indemnitorSigned: !!signature,
    indemnitorSignature: signature
  };
}

/**
 * Signs the contract with the defendant's signature
 * @param {Object} contractObject The contract object
 * @param {string} signature Base64 encoded signature data
 * @returns {Object} Updated contract object with signature
 */
function signContractByDefendant(contractObject, signature) {
  let updatedContractText = contractObject.contractText.replace(
    /{DEFENDANT_SIGNATURE}/g, 
    signature ? "Digitally Signed: " + signature.substring(0, 15) + "..." : "___________________________"
  );
  
  return {
    ...contractObject,
    contractText: updatedContractText,
    defendantSigned: !!signature,
    defendantSignature: signature
  };
}

/**
 * Signs the contract with the bondsman's signature
 * @param {Object} contractObject The contract object
 * @param {string} signature Base64 encoded signature data
 * @returns {Object} Updated contract object with signature
 */
function signContractByBondsman(contractObject, signature) {
  let updatedContractText = contractObject.contractText.replace(
    /{BONDSMAN_SIGNATURE}/g, 
    signature ? "Digitally Signed: " + signature.substring(0, 15) + "..." : "___________________________"
  );
  
  return {
    ...contractObject,
    contractText: updatedContractText,
    bondsmanSigned: !!signature,
    bondsmanSignature: signature
  };
}

/**
 * Finalizes the contract and prepares it for deployment to blockchain
 * @param {Object} contractObject The contract object with all signatures
 * @returns {Object} Finalized contract ready for blockchain deployment
 */
function finalizeContract(contractObject) {
  // Check that all required signatures are present
  if (!contractObject.defendantSigned || !contractObject.indemnitorSigned || !contractObject.bondsmanSigned) {
    throw new Error("Cannot finalize contract: missing required signatures");
  }
  
  // Create a finalized version
  const finalizedContract = {
    ...contractObject,
    status: 'finalized',
    finalizedAt: new Date().toISOString(),
    readyForBlockchain: true
  };
  
  // Prepare the blockchain version
  finalizedContract.blockchainData = prepareContractForBlockchain(finalizedContract);
  
  return finalizedContract;
}

/**
 * Deploys the finalized contract to the blockchain
 * This would normally interact with actual blockchain
 * @param {Object} finalizedContract The finalized contract
 * @returns {Promise<Object>} Deployed contract data
 */
async function deployContractToBlockchain(finalizedContract) {
  if (!finalizedContract.readyForBlockchain) {
    throw new Error("Contract not ready for blockchain deployment");
  }
  
  // Generate a unique contract ID
  const contractId = `contract_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  
  try {
    // Show deployment status message
    console.log('Deploying contract to decentralized storage...');
    if (typeof showToast === 'function') {
      showToast('Deploying Contract', 'Storing contract in decentralized IPFS storage...', 'default');
    }
    
    let ipfsCid = null;
    
    // First attempt to use IPFS storage if available
    if (window.IPFSStorage && typeof window.IPFSStorage.storeContractInIPFS === 'function') {
      try {
        console.log('Using IPFS for decentralized storage...');
        // Store the contract in IPFS
        ipfsCid = await window.IPFSStorage.storeContractInIPFS(finalizedContract, contractId);
        console.log('Contract stored in IPFS with CID:', ipfsCid);
        
        if (typeof showToast === 'function') {
          showToast('Storage Successful', 'Contract stored securely in decentralized storage', 'success');
        }
      } catch (ipfsError) {
        console.error('IPFS storage failed:', ipfsError);
        // Continue with fallback as we'll use local storage below
      }
    } else {
      console.log('IPFS integration not available, using local storage...');
    }
    
    // Always store in localStorage as backup or if IPFS isn't available
    try {
      // Get existing contracts or initialize empty array
      const storedContracts = JSON.parse(localStorage.getItem('deployedContracts') || '[]');
      
      // Add this contract to the array
      storedContracts.push({
        id: contractId,
        contract: finalizedContract,
        timestamp: new Date().toISOString(),
        ipfsCid: ipfsCid
      });
      
      // Save back to localStorage
      localStorage.setItem('deployedContracts', JSON.stringify(storedContracts));
      console.log('Contract also saved to local storage');
    } catch (localStorageError) {
      console.error('Local storage backup failed:', localStorageError);
    }
    
    // Simulate blockchain processing delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Return deployed contract data with IPFS CID if available
    return {
      ...finalizedContract,
      id: contractId,
      status: 'deployed',
      deployedAt: new Date().toISOString(),
      blockNumber: Math.floor(Math.random() * 1000000) + 15000000,
      blockchainConfirmations: 1,
      ipfsCid: ipfsCid,
      ipfsGatewayUrl: ipfsCid ? `https://ipfs.io/ipfs/${ipfsCid}` : null,
      deploymentSuccessful: true
    };
  } catch (error) {
    console.error('Contract deployment failed:', error);
    
    // Store the contract in local queue for later retry
    try {
      const pendingContracts = JSON.parse(localStorage.getItem('pendingContracts') || '[]');
      pendingContracts.push({
        id: contractId,
        contract: finalizedContract,
        timestamp: new Date().toISOString(),
        errorMessage: error.message
      });
      localStorage.setItem('pendingContracts', JSON.stringify(pendingContracts));
      console.log('Contract stored in pending queue for later retry');
      
      if (typeof showToast === 'function') {
        showToast('Deployment Queued', 'Contract saved for deployment when connection is restored', 'default');
      }
    } catch (localStorageError) {
      console.error('Failed to store contract in pending queue:', localStorageError);
    }
    
    throw error;
  }
}

/**
 * Creates an NFT representation of the bail bond contract
 * This would interact with Nine1Eight.nft domain
 * @param {Object} deployedContract The deployed contract
 * @returns {Promise<Object>} NFT data
 */
async function createContractNFT(deployedContract) {
  if (!deployedContract.deploymentSuccessful) {
    throw new Error("Cannot create NFT: contract not successfully deployed");
  }
  
  // Simulate NFT creation delay
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  // Generate NFT token ID
  const tokenId = Math.floor(Math.random() * 1000000000);
  
  // Return NFT data
  return {
    ...deployedContract,
    nft: {
      tokenId,
      contractAddress: "0x" + Math.random().toString(16).substring(2, 42),
      tokenURI: `https://Nine1Eight.nft/token/${tokenId}`,
      metadata: {
        name: `Bail Bond #${deployedContract.contractId}`,
        description: `Oklahoma Bail Bond for ${deployedContract.contractData.defendantName}`,
        image: `https://Nine1Eight.nft/image/${tokenId}`,
        attributes: [
          { trait_type: "Bond Type", value: deployedContract.contractData.bondType || "standard" },
          { trait_type: "Bond Amount", value: deployedContract.contractData.bondAmount },
          { trait_type: "Court Date", value: deployedContract.contractData.courtDate },
          { trait_type: "County", value: deployedContract.contractData.countyName }
        ]
      },
      createdAt: new Date().toISOString()
    }
  };
}

// Export the contract generator functions
window.OklahomaBailBondContract = {
  // Data providers
  counties: OKLAHOMA_COUNTIES,
  courts: OKLAHOMA_COURTS,
  commonOffenses: OKLAHOMA_COMMON_OFFENSES,
  
  // Generator functions
  generateContract: generateOklahomaBailBondContract,
  generateContractHTML,
  
  // Contract modification functions
  signContractByIndemnitor,
  signContractByDefendant,
  signContractByBondsman,
  finalizeContract,
  
  // Blockchain functions
  deployContractToBlockchain,
  
  // NFT functions
  createContractNFT,
  
  // Helper functions
  calculatePremium,
  generateBondNumber,
  formatContractDate
};
