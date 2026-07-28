// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Non-custodial, so|bond-inspired lifecycle register for a bail agreement.
/// @dev Stores workflow attestations and hashes only. It never holds or transfers funds.
contract BailAgreementRegistry {
    enum Status { Draft, Ready, Active, Completed, Frozen }
    struct AgreementData {
        bytes32 caseId;
        string jurisdiction;
        string currency;
        uint256 bondAmountMinor;
        uint256 premiumAmountMinor;
        uint256 createdAt;
        uint256 effectiveAt;
        uint256 expiresAt;
    }
    address public immutable registrar;
    address public immutable bondsman;
    address public immutable client;
    Status public status;
    AgreementData private agreement;
    bool public clientApproved;
    bool public bondsmanApproved;

    event AgreementStatusChanged(bytes32 indexed caseId, Status indexed status);
    event AgreementApproval(bytes32 indexed caseId, address indexed actor);
    event EvidenceAnchored(bytes32 indexed caseId, bytes32 indexed digest, address indexed actor);

    modifier onlyRegistrar() { require(msg.sender == registrar, "registrar required"); _; }
    modifier onlyParticipant() { require(msg.sender == client || msg.sender == bondsman, "participant required"); _; }

    constructor(address registrar_, address bondsman_, address client_, bytes32 caseId_) {
        require(registrar_ != address(0) && bondsman_ != address(0) && client_ != address(0), "party required");
        require(caseId_ != bytes32(0), "case id required");
        registrar = registrar_;
        bondsman = bondsman_;
        client = client_;
        agreement.caseId = caseId_;
        agreement.createdAt = block.timestamp;
        status = Status.Draft;
    }

    function getAgreementData() external view returns (AgreementData memory) { return agreement; }

    /// @dev Amounts are integer minor units, such as USD cents.
    function setAgreementData(string calldata jurisdiction_, string calldata currency_, uint256 bondAmountMinor_, uint256 premiumAmountMinor_, uint256 effectiveAt_, uint256 expiresAt_) external onlyRegistrar {
        require(status == Status.Draft, "not draft");
        require(bytes(jurisdiction_).length > 0 && bytes(currency_).length > 0, "terms required");
        require(bondAmountMinor_ > 0 && expiresAt_ >= effectiveAt_, "invalid terms");
        agreement.jurisdiction = jurisdiction_;
        agreement.currency = currency_;
        agreement.bondAmountMinor = bondAmountMinor_;
        agreement.premiumAmountMinor = premiumAmountMinor_;
        agreement.effectiveAt = effectiveAt_;
        agreement.expiresAt = expiresAt_;
    }

    function makeReady() external onlyRegistrar {
        require(status == Status.Draft, "not draft");
        require(agreement.bondAmountMinor > 0 && agreement.expiresAt >= agreement.effectiveAt, "terms incomplete");
        status = Status.Ready;
        emit AgreementStatusChanged(agreement.caseId, status);
    }

    function approve() external onlyParticipant {
        require(status == Status.Ready, "not ready");
        if (msg.sender == client) clientApproved = true;
        if (msg.sender == bondsman) bondsmanApproved = true;
        emit AgreementApproval(agreement.caseId, msg.sender);
    }

    /// @dev Activation remains separate so off-chain signing and payment checks happen first.
    function activate() external onlyRegistrar {
        require(status == Status.Ready && clientApproved && bondsmanApproved, "approvals required");
        status = Status.Active;
        emit AgreementStatusChanged(agreement.caseId, status);
    }

    function toggleFrozen() external onlyRegistrar {
        require(status == Status.Active || status == Status.Frozen, "not active");
        status = status == Status.Active ? Status.Frozen : Status.Active;
        emit AgreementStatusChanged(agreement.caseId, status);
    }

    function complete() external onlyRegistrar {
        require(status == Status.Active || status == Status.Frozen, "not active");
        status = Status.Completed;
        emit AgreementStatusChanged(agreement.caseId, status);
    }

    function anchorEvidence(bytes32 digest) external onlyRegistrar {
        require(digest != bytes32(0), "digest required");
        emit EvidenceAnchored(agreement.caseId, digest, msg.sender);
    }
}
