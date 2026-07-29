// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Non-custodial audit anchor for signed case events.
/// @dev This contract never holds bail, premium, collateral, or token funds.
///      It stores only a digest and a timestamp so private records stay off-chain.
contract AuditRegistry {
    struct Anchor {
        bytes32 digest;
        uint64 recordedAt;
        address recorder;
    }

    mapping(bytes32 => Anchor) public anchors;
    event Anchored(bytes32 indexed caseId, bytes32 indexed digest, address indexed recorder, uint64 recordedAt);

    function anchor(bytes32 caseId, bytes32 digest) external {
        require(caseId != bytes32(0), "case id required");
        require(digest != bytes32(0), "digest required");
        require(anchors[caseId].recordedAt == 0, "case already anchored");
        uint64 timestamp = uint64(block.timestamp);
        anchors[caseId] = Anchor(digest, timestamp, msg.sender);
        emit Anchored(caseId, digest, msg.sender, timestamp);
    }

    function verify(bytes32 caseId, bytes32 digest) external view returns (bool) {
        return anchors[caseId].digest == digest && digest != bytes32(0);
    }
}
