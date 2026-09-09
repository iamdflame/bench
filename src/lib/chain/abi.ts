/**
 * MandateMarket ABI and bytecode, generated from the Foundry artifact.
 *
 * Regenerate with: npm run abi
 */

export const MANDATE_MARKET_ABI = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "adjudicator_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "minBond_",
        "type": "uint96",
        "internalType": "uint96"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "CATASTROPHIC_ALPHA_BPS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "int256",
        "internalType": "int256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MAX_ALPHA_BPS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "int256",
        "internalType": "int256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MAX_BPS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "STRIKES_TO_DISMISS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint32",
        "internalType": "uint32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "adjudicator",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "assayedAt",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "award",
    "inputs": [
      {
        "name": "mandateId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "bidIndex",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "opening",
        "type": "tuple",
        "internalType": "struct MandateMarket.Observation",
        "components": [
          {
            "name": "wallet",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "valuationWei",
            "type": "uint96",
            "internalType": "uint96"
          },
          {
            "name": "gasSpentWei",
            "type": "uint96",
            "internalType": "uint96"
          },
          {
            "name": "priceX96",
            "type": "uint160",
            "internalType": "uint160"
          },
          {
            "name": "blockNumber",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "breakdownRef",
            "type": "bytes32",
            "internalType": "bytes32"
          }
        ]
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "bid",
    "inputs": [
      {
        "name": "mandateId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "targetAlphaBps",
        "type": "int16",
        "internalType": "int16"
      }
    ],
    "outputs": [
      {
        "name": "bidIndex",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "bidCount",
    "inputs": [
      {
        "name": "mandateId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "challengeWindow",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "claimSlash",
    "inputs": [
      {
        "name": "mandateId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "epoch",
        "type": "uint32",
        "internalType": "uint32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "closeMandate",
    "inputs": [
      {
        "name": "mandateId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "contestSlash",
    "inputs": [
      {
        "name": "mandateId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "epoch",
        "type": "uint32",
        "internalType": "uint32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "epochAttestation",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "",
        "type": "uint32",
        "internalType": "uint32"
      }
    ],
    "outputs": [
      {
        "name": "observationHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "valuationWei",
        "type": "uint96",
        "internalType": "uint96"
      },
      {
        "name": "blockNumber",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "takenAt",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "fineness",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getBids",
    "inputs": [
      {
        "name": "mandateId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple[]",
        "internalType": "struct MandateMarket.Bid[]",
        "components": [
          {
            "name": "agent",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "bond",
            "type": "uint96",
            "internalType": "uint96"
          },
          {
            "name": "targetAlphaBps",
            "type": "int16",
            "internalType": "int16"
          },
          {
            "name": "spent",
            "type": "bool",
            "internalType": "bool"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getMandate",
    "inputs": [
      {
        "name": "mandateId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct MandateMarket.Mandate",
        "components": [
          {
            "name": "principal",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "capital",
            "type": "uint96",
            "internalType": "uint96"
          },
          {
            "name": "agent",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "bond",
            "type": "uint96",
            "internalType": "uint96"
          },
          {
            "name": "category",
            "type": "uint8",
            "internalType": "enum MandateMarket.Category"
          },
          {
            "name": "state",
            "type": "uint8",
            "internalType": "enum MandateMarket.State"
          },
          {
            "name": "toleranceBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "feeBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "slashBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "epochLength",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "epochsTotal",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "epochsSettled",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "lastSettledAt",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "cumulativeAlphaBps",
            "type": "int256",
            "internalType": "int256"
          },
          {
            "name": "strikes",
            "type": "uint32",
            "internalType": "uint32"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "hashObservation",
    "inputs": [
      {
        "name": "o",
        "type": "tuple",
        "internalType": "struct MandateMarket.Observation",
        "components": [
          {
            "name": "wallet",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "valuationWei",
            "type": "uint96",
            "internalType": "uint96"
          },
          {
            "name": "gasSpentWei",
            "type": "uint96",
            "internalType": "uint96"
          },
          {
            "name": "priceX96",
            "type": "uint160",
            "internalType": "uint160"
          },
          {
            "name": "blockNumber",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "breakdownRef",
            "type": "bytes32",
            "internalType": "bytes32"
          }
        ]
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "pure"
  },
  {
    "type": "function",
    "name": "mandateCount",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "minBond",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint96",
        "internalType": "uint96"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "minFineness",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "openAttestation",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "observationHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "valuationWei",
        "type": "uint96",
        "internalType": "uint96"
      },
      {
        "name": "blockNumber",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "takenAt",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "openMandate",
    "inputs": [
      {
        "name": "category",
        "type": "uint8",
        "internalType": "enum MandateMarket.Category"
      },
      {
        "name": "toleranceBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "feeBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "slashBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "epochLength",
        "type": "uint32",
        "internalType": "uint32"
      },
      {
        "name": "epochsTotal",
        "type": "uint32",
        "internalType": "uint32"
      }
    ],
    "outputs": [
      {
        "name": "mandateId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "owner",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "pendingSlash",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "",
        "type": "uint32",
        "internalType": "uint32"
      }
    ],
    "outputs": [
      {
        "name": "amount",
        "type": "uint96",
        "internalType": "uint96"
      },
      {
        "name": "claimableAt",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "agent",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "contested",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "resolved",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "publishAssay",
    "inputs": [
      {
        "name": "agent",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "fineness_",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "publishAssays",
    "inputs": [
      {
        "name": "agents",
        "type": "address[]",
        "internalType": "address[]"
      },
      {
        "name": "values",
        "type": "uint16[]",
        "internalType": "uint16[]"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "renounceOwnership",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "resolveSlash",
    "inputs": [
      {
        "name": "mandateId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "epoch",
        "type": "uint32",
        "internalType": "uint32"
      },
      {
        "name": "upheld",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setAdjudicator",
    "inputs": [
      {
        "name": "next",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setChallengeWindow",
    "inputs": [
      {
        "name": "seconds_",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setMinBond",
    "inputs": [
      {
        "name": "wei_",
        "type": "uint96",
        "internalType": "uint96"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setMinFineness",
    "inputs": [
      {
        "name": "next",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "settleEpoch",
    "inputs": [
      {
        "name": "mandateId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "realizedAlphaBps",
        "type": "int256",
        "internalType": "int256"
      },
      {
        "name": "obs",
        "type": "tuple",
        "internalType": "struct MandateMarket.Observation",
        "components": [
          {
            "name": "wallet",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "valuationWei",
            "type": "uint96",
            "internalType": "uint96"
          },
          {
            "name": "gasSpentWei",
            "type": "uint96",
            "internalType": "uint96"
          },
          {
            "name": "priceX96",
            "type": "uint160",
            "internalType": "uint160"
          },
          {
            "name": "blockNumber",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "breakdownRef",
            "type": "bytes32",
            "internalType": "bytes32"
          }
        ]
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "successor",
    "inputs": [
      {
        "name": "mandateId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "transferOwnership",
    "inputs": [
      {
        "name": "newOwner",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "withdraw",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "withdrawBid",
    "inputs": [
      {
        "name": "mandateId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "bidIndex",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "withdrawable",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "AdjudicatorChanged",
    "inputs": [
      {
        "name": "previous",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "next",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "AgentDismissed",
    "inputs": [
      {
        "name": "mandateId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "agent",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "reason",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Assayed",
    "inputs": [
      {
        "name": "agent",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "fineness",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      },
      {
        "name": "at",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "BidPlaced",
    "inputs": [
      {
        "name": "mandateId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "agent",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "bond",
        "type": "uint96",
        "indexed": false,
        "internalType": "uint96"
      },
      {
        "name": "targetAlphaBps",
        "type": "int16",
        "indexed": false,
        "internalType": "int16"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "BidWithdrawn",
    "inputs": [
      {
        "name": "mandateId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "agent",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "bond",
        "type": "uint96",
        "indexed": false,
        "internalType": "uint96"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ChallengeWindowChanged",
    "inputs": [
      {
        "name": "previous",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "next",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "EpochSettled",
    "inputs": [
      {
        "name": "mandateId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "epoch",
        "type": "uint32",
        "indexed": true,
        "internalType": "uint32"
      },
      {
        "name": "agent",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "realizedAlphaBps",
        "type": "int256",
        "indexed": false,
        "internalType": "int256"
      },
      {
        "name": "feePaid",
        "type": "uint96",
        "indexed": false,
        "internalType": "uint96"
      },
      {
        "name": "slashed",
        "type": "uint96",
        "indexed": false,
        "internalType": "uint96"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "MandateAwarded",
    "inputs": [
      {
        "name": "mandateId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "agent",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "bond",
        "type": "uint96",
        "indexed": false,
        "internalType": "uint96"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "MandateClosed",
    "inputs": [
      {
        "name": "mandateId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "returned",
        "type": "uint96",
        "indexed": false,
        "internalType": "uint96"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "MandateOpened",
    "inputs": [
      {
        "name": "mandateId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "principal",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "category",
        "type": "uint8",
        "indexed": false,
        "internalType": "enum MandateMarket.Category"
      },
      {
        "name": "capital",
        "type": "uint96",
        "indexed": false,
        "internalType": "uint96"
      },
      {
        "name": "epochsTotal",
        "type": "uint32",
        "indexed": false,
        "internalType": "uint32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "MinBondChanged",
    "inputs": [
      {
        "name": "previous",
        "type": "uint96",
        "indexed": false,
        "internalType": "uint96"
      },
      {
        "name": "next",
        "type": "uint96",
        "indexed": false,
        "internalType": "uint96"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "MinFinenessChanged",
    "inputs": [
      {
        "name": "previous",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      },
      {
        "name": "next",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Observed",
    "inputs": [
      {
        "name": "mandateId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "epoch",
        "type": "uint32",
        "indexed": true,
        "internalType": "uint32"
      },
      {
        "name": "observationHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "observation",
        "type": "tuple",
        "indexed": false,
        "internalType": "struct MandateMarket.Observation",
        "components": [
          {
            "name": "wallet",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "valuationWei",
            "type": "uint96",
            "internalType": "uint96"
          },
          {
            "name": "gasSpentWei",
            "type": "uint96",
            "internalType": "uint96"
          },
          {
            "name": "priceX96",
            "type": "uint160",
            "internalType": "uint160"
          },
          {
            "name": "blockNumber",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "breakdownRef",
            "type": "bytes32",
            "internalType": "bytes32"
          }
        ]
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OwnershipTransferred",
    "inputs": [
      {
        "name": "previousOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "newOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "SlashContested",
    "inputs": [
      {
        "name": "mandateId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "epoch",
        "type": "uint32",
        "indexed": true,
        "internalType": "uint32"
      },
      {
        "name": "agent",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "SlashResolved",
    "inputs": [
      {
        "name": "mandateId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "epoch",
        "type": "uint32",
        "indexed": true,
        "internalType": "uint32"
      },
      {
        "name": "upheld",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      },
      {
        "name": "amount",
        "type": "uint96",
        "indexed": false,
        "internalType": "uint96"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Withdrawal",
    "inputs": [
      {
        "name": "to",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "AlphaContradictsObservation",
    "inputs": []
  },
  {
    "type": "error",
    "name": "AlreadyResolved",
    "inputs": []
  },
  {
    "type": "error",
    "name": "BadParameters",
    "inputs": []
  },
  {
    "type": "error",
    "name": "BadState",
    "inputs": []
  },
  {
    "type": "error",
    "name": "BelowFineness",
    "inputs": []
  },
  {
    "type": "error",
    "name": "BidSpent",
    "inputs": []
  },
  {
    "type": "error",
    "name": "BondTooSmall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "EpochNotElapsed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "MandateHeld",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NoCapital",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NoOpeningAttestation",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NoSuchBid",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotAdjudicator",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotAssayed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotBidder",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotPrincipal",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NothingToWithdraw",
    "inputs": []
  },
  {
    "type": "error",
    "name": "OwnableInvalidOwner",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "OwnableUnauthorizedAccount",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ReentrancyGuardReentrantCall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "StaleObservation",
    "inputs": []
  },
  {
    "type": "error",
    "name": "TermComplete",
    "inputs": []
  },
  {
    "type": "error",
    "name": "TransferFailed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "WindowOpen",
    "inputs": []
  }
] as const;

export const MANDATE_MARKET_BYTECODE = "0x60806040525f8054600160a01b600160e01b0319166102a360a71b179055348015610028575f5ffd5b50604051613c38380380613c38833981016040819052610047916101bd565b60017f9b779b17422d0df92223018b32b4d1fa46e071723d6817e2486d003becc55f0055338061009057604051631e4fbdf760e01b81525f600482015260240160405180910390fd5b6100998161016e565b50806001600160601b03165f036100c357604051630ce23d3f60e21b815260040160405180910390fd5b600280546001600160a01b0319166001600160a01b038416908117909155600180546001600160601b0319166001600160601b0384161790556040515f907fd71598e915f689154369180588e39e6cec9552c4ffd63cfdad2f3c8058e891d8908290a3604080515f81526001600160601b03831660208201527f21fd8be1d819ff23de6e9905c47f1b8445ca4a4827494115def83c078a306caa910160405180910390a1505061020b565b5f80546001600160a01b038381166001600160a01b0319831681178455604051919092169283917f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e09190a35050565b5f5f604083850312156101ce575f5ffd5b82516001600160a01b03811681146101e4575f5ffd5b60208401519092506001600160601b0381168114610200575f5ffd5b809150509250929050565b613a20806102185f395ff3fe608060405260043610610228575f3560e01c806376d3544311610129578063bf27a229116100a8578063e2b3f95f1161006d578063e2b3f95f1461082b578063e63211ed1461084a578063f2fde38b14610869578063fcee9a5014610888578063fd967f47146108a7575f5ffd5b8063bf27a2291461076f578063c66f93601461078e578063ce513b6f146107ad578063d81cc607146107d8578063da75c01e1461080c575f5ffd5b80638fa07215116100ee5780638fa07215146106ba578063a5735662146106d0578063a8e64c8a146106ef578063adc19a521461071b578063b9a958b414610744575f5ffd5b806376d35443146105ec5780638026c1491461060b578063831518b71461062a578063861a1412146106615780638da5cb5b1461069e575f5ffd5b806348c03d83116101b557806360b5662e1161017a57806360b5662e1461051f5780636382ab84146105335780636773dd841461058a5780636a15c6e5146105a9578063715018a6146105d8575f5ffd5b806348c03d83146103d157806351796fba146103f057806353a7d2d41461040f57806353c2ed8e146104255780635d78b7771461045c575f5ffd5b8063224dd6b5116101fb578063224dd6b514610338578063263a5b5c14610357578063334987ab1461036a5780633ab49ffb146103895780633ccfd60b146103bd575f5ffd5b806305d8dd941461022c578063131d9a27146102525780631e7472f81461027e578063208a872114610317575b5f5ffd5b61023f61023a3660046131c0565b6108bc565b6040519081526020015b60405180910390f35b34801561025d575f5ffd5b5061027161026c366004613235565b610c1c565b604051610249919061324c565b348015610289575f5ffd5b506102e06102983660046132ca565b600860209081525f9283526040808420909152908252902080546001909101546001600160601b038116906001600160401b03600160601b8204811691600160a01b90041684565b604080519485526001600160601b0390931660208501526001600160401b0391821692840192909252166060820152608001610249565b348015610322575f5ffd5b5061033661033136600461330a565b610ccc565b005b348015610343575f5ffd5b5061033661035236600461330a565b6113ce565b61023f61036536600461333e565b6115f0565b348015610375575f5ffd5b50610336610384366004613386565b6117eb565b348015610394575f5ffd5b506001546103aa90600160601b900461ffff1681565b60405161ffff9091168152602001610249565b3480156103c8575f5ffd5b5061033661184e565b3480156103dc575f5ffd5b506103366103eb3660046133e8565b61194a565b3480156103fb575f5ffd5b5061033661040a366004613468565b611b82565b34801561041a575f5ffd5b5061023f620186a081565b348015610430575f5ffd5b50600254610444906001600160a01b031681565b6040516001600160a01b039091168152602001610249565b348015610467575f5ffd5b506104d56104763660046132ca565b600560209081525f9283526040808420909152908252902080546001909101546001600160601b038216916001600160401b03600160601b90910416906001600160a01b0381169060ff600160a01b8204811691600160a81b90041685565b604080516001600160601b0390961686526001600160401b0390941660208601526001600160a01b039092169284019290925290151560608301521515608082015260a001610249565b34801561052a575f5ffd5b5060035461023f565b34801561053e575f5ffd5b506102e061054d366004613235565b60076020525f9081526040902080546001909101546001600160601b038116906001600160401b03600160601b8204811691600160a01b90041684565b348015610595575f5ffd5b506103366105a4366004613481565b611c21565b3480156105b4575f5ffd5b506103aa6105c3366004613386565b60096020525f908152604090205461ffff1681565b3480156105e3575f5ffd5b50610336611d95565b3480156105f7575f5ffd5b506103366106063660046134c2565b611da6565b348015610616575f5ffd5b50610444610625366004613235565b611e40565b348015610635575f5ffd5b50600154610649906001600160601b031681565b6040516001600160601b039091168152602001610249565b34801561066c575f5ffd5b505f5461068690600160a01b90046001600160401b031681565b6040516001600160401b039091168152602001610249565b3480156106a9575f5ffd5b505f546001600160a01b0316610444565b3480156106c5575f5ffd5b5061023f6103e71981565b3480156106db575f5ffd5b506103366106ea3660046134db565b611e9b565b3480156106fa575f5ffd5b5061070e610709366004613235565b612058565b6040516102499190613538565b348015610726575f5ffd5b5061072f600381565b60405163ffffffff9091168152602001610249565b34801561074f575f5ffd5b5061023f61075e366004613235565b5f9081526004602052604090205490565b34801561077a575f5ffd5b506103366107893660046132ca565b612249565b348015610799575f5ffd5b506103366107a8366004613235565b612340565b3480156107b8575f5ffd5b5061023f6107c7366004613386565b60066020525f908152604090205481565b3480156107e3575f5ffd5b506106866107f2366004613386565b600a6020525f90815260409020546001600160401b031681565b348015610817575f5ffd5b506103366108263660046136b2565b6125ab565b348015610836575f5ffd5b506103366108453660046136cb565b61262c565b348015610855575f5ffd5b5061023f6108643660046136f5565b61270a565b348015610874575f5ffd5b50610336610883366004613386565b6127d3565b348015610893575f5ffd5b506103366108a23660046132ca565b612812565b3480156108b2575f5ffd5b506103aa61271081565b5f345f036108dd57604051632a81ca8560e11b815260040160405180910390fd5b61271061ffff871611806108f6575061271061ffff8616115b80610903575061ffff8416155b80610913575061271061ffff8516115b80610922575063ffffffff8316155b80610931575063ffffffff8216155b1561094f5760405163a18a709360e01b815260040160405180910390fd5b5060038054604080516101e0810182523381526001600160601b03341660208201525f9181018290526060810191909152909190608081018983811115610998576109986134fb565b81526020015f815261ffff808a1660208084019190915289821660408085019190915291891660608085019190915263ffffffff808a1660808087019190915290891660a08601525f60c086018190526001600160401b03421660e08701526101008601819052610120909501859052865460018181018955978652948390208651938701516001600160601b03908116600160a01b9081026001600160a01b03968716176005909802909201968755948701519287015190941690930291161782850155820151600282018054939492939192909160ff191690836003811115610a8557610a856134fb565b021790555060a082015160028201805461ff001916610100836003811115610aaf57610aaf6134fb565b021790555060c082015160028201805460e08501516101008601516101208701516101408801516101608901516101808a015165ffffffff0000199096166201000061ffff998a160265ffff0000000019161764010000000095891695909502949094176bffffffffffff0000000000001916600160301b97909316969096026bffffffff0000000000000000191691909117600160401b63ffffffff928316021767ffffffffffffffff60601b1916600160601b9582169590950263ffffffff60801b191694909417600160801b918516919091021767ffffffffffffffff60a01b1916600160a01b6001600160401b03909216919091021790556101a083015160038301556101c0909201516004909101805463ffffffff191691909216179055604051339082907fb49ddf8b18792f184522b8213857b5ed499eee0ce3374333978358337db3aab190610c0a908b903490889061370f565b60405180910390a39695505050505050565b606060045f8381526020019081526020015f20805480602002602001604051908101604052809291908181526020015f905b82821015610cc1575f848152602090819020604080516080810182526002860290920180546001600160a01b0381168452600160a01b90046001600160601b03168385015260019081015480820b928401929092526201000090910460ff16151560608301529083529092019101610c4e565b505050509050919050565b6002546001600160a01b03163314610cf757604051630b5873a560e31b815260040160405180910390fd5b610cff6129b7565b620186a0821380610d1a5750610d17620186a0613753565b82125b15610d385760405163a18a709360e01b815260040160405180910390fd5b5f60038481548110610d4c57610d4c61376d565b5f9182526020909120600590910201905060016002820154610100900460ff166003811115610d7d57610d7d6134fb565b14610d9b57604051634291db1560e11b815260040160405180910390fd5b600281015463ffffffff600160601b82048116600160801b9092041610610dd55760405163ad4ed3a960e01b815260040160405180910390fd5b6002810154610e0190600160401b810463ffffffff1690600160a01b90046001600160401b0316613781565b6001600160401b0316421015610e2a5760405163a4cbd88560e01b815260040160405180910390fd5b60028101546001820154600160801b90910463ffffffff16906001600160a01b0316610e58868387876129d2565b610e638260016137a6565b6002840180546bffffffffffffffffffffffff60801b1916600160801b63ffffffff939093169290920267ffffffffffffffff60a01b191691909117600160a01b426001600160401b0316021790556003830180548691905f90610ec89084906137c2565b909155505f905080808713156110145784545f9061271090610efb908a90600160a01b90046001600160601b03166137e9565b610f059190613814565b60028701549091505f9061271090610f2990640100000000900461ffff16846137e9565b610f339190613814565b8754909150600160a01b90046001600160601b0316811115610f6357508554600160a01b90046001600160601b03165b9250826001600160601b03811615610ffe57865484908890601490610f99908490600160a01b90046001600160601b0316613827565b92506101000a8154816001600160601b0302191690836001600160601b03160217905550836001600160601b031660065f876001600160a01b03166001600160a01b031681526020019081526020015f205f828254610ff89190613846565b90915550505b505060048501805463ffffffff19169055611258565b600285015461102c9062010000900461ffff16613753565b87121561124857600285015460018601546127109161106891600160301b90910461ffff16906001600160601b03600160a01b909104166137e9565b6110729190613814565b60018601549091506001600160601b03600160a01b909104811690821611156110ac57506001840154600160a01b90046001600160601b03165b6001600160601b0381161561120857808560010160148282829054906101000a90046001600160601b03166110e19190613827565b92506101000a8154816001600160601b0302191690836001600160601b031602179055506040518060a00160405280826001600160601b031681526020015f60149054906101000a90046001600160401b03164261113f9190613781565b6001600160401b0390811682526001600160a01b038087166020808501919091525f604080860182905260609586018290528e82526005835280822063ffffffff8c1683528352908190208651815493880151909516600160601b026001600160a01b03199093166001600160601b03909516949094179190911783558401516001929092018054938501516080909501511515600160a81b0260ff60a81b19951515600160a01b026001600160a81b0319909516939092169290921792909217929092161790555b600485018054600191905f9061122590849063ffffffff166137a6565b92506101000a81548163ffffffff021916908363ffffffff160217905550611258565b60048501805463ffffffff191690555b826001600160a01b03168463ffffffff16897ff425e75e1f5d192e2e28107d6539f49a6c82523b569223e0af399ba4a4d7c1cb8a86866040516112b7939291909283526001600160601b03918216602084015216604082015260600190565b60405180910390a46103e719871361130e5761130988866040518060400160405280601d81526020017f636174617374726f7068696320756e646572706572666f726d616e6365000000815250612cfa565b6113ae565b6004850154600363ffffffff909116106113625761130988866040518060400160405280602081526020017f746872656520636f6e7365637574697665206661696c696e672065706f636873815250612cfa565b6001850154600160a01b90046001600160601b03165f036113ae576113ae88866040518060400160405280600e81526020016d189bdb9908195e1a185d5cdd195960921b815250612cfa565b50505050506113c960015f5160206139cb5f395f51905f5255565b505050565b6113d66129b7565b5f600384815481106113ea576113ea61376d565b5f918252602090912060059091020180549091506001600160a01b0316331461142657604051630789a70b60e41b815260040160405180910390fd5b5f6002820154610100900460ff166003811115611445576114456134fb565b1461146357604051634291db1560e11b815260040160405180910390fd5b4361147460a08401608085016136b2565b6001600160401b0316118061149f57506114946040830160208401613468565b6001600160601b0316155b156114bd5760405163158767e760e01b815260040160405180910390fd5b5f6114c78361270a565b905060405180608001604052808281526020018460200160208101906114ed9190613468565b6001600160601b0316815260200161150b60a08601608087016136b2565b6001600160401b0390811682524281166020928301525f88815260078352604090819020845181559284015160019093018054858301516060909601518416600160a01b0267ffffffffffffffff60a01b1996909416600160601b026001600160a01b03199091166001600160601b039095169490941793909317939093161790555163ffffffff9086907f13dbc322be241cd8c15ea230669cadc20e47affee38ef7289db6912fe574374f906115c59085908890613859565b60405180910390a36115d8858386612e19565b50506113c960015f5160206139cb5f395f51905f5255565b5f5f600384815481106116055761160561376d565b5f9182526020822060059091020191506002820154610100900460ff166003811115611633576116336134fb565b1461165157604051634291db1560e11b815260040160405180910390fd5b6001546001600160601b031634101561167d57604051630ce23d3f60e21b815260040160405180910390fd5b600154600160601b900461ffff161561170a57335f908152600a60205260408120546001600160401b031690036116c75760405163b3f487f960e01b815260040160405180910390fd5b600154335f9081526009602052604090205461ffff600160601b90920482169116101561170a5760405160016286279360e01b0319815260040160405180910390fd5b5f84815260046020908152604080832080548251608081018452338082526001600160601b0334811683880181815260018d810b868a01818152606088018d8152838a018b55998d529b8b902096519251909416600160a01b026001600160a01b039092169190911760028702909501948555985193909801805495511515620100000262ffffff1990961661ffff90941693909317949094179091558351958652938501919091529450909186917f22bffdbd17e669c882783205043a4c8f991d077b568d45c44448b0d8c1c8cf7c910160405180910390a35092915050565b6117f3612f6d565b6002546040516001600160a01b038084169216907fd71598e915f689154369180588e39e6cec9552c4ffd63cfdad2f3c8058e891d8905f90a3600280546001600160a01b0319166001600160a01b0392909216919091179055565b6118566129b7565b335f908152600660205260408120549081900361188657604051630686827b60e51b815260040160405180910390fd5b335f818152600660205260408082208290555190919083908381818185875af1925050503d805f81146118d4576040519150601f19603f3d011682016040523d82523d5f602084013e6118d9565b606091505b50509050806118fb576040516312171d8360e31b815260040160405180910390fd5b60405182815233907f7fcf532c15f0a6db0bd6d0e038bea71d30d808c7d98cb3bf7268a95bf5081b659060200160405180910390a2505061194860015f5160206139cb5f395f51905f5255565b565b6002546001600160a01b0316331461197557604051630b5873a560e31b815260040160405180910390fd5b8281146119955760405163a18a709360e01b815260040160405180910390fd5b5f5b83811015611b7b576103e88383838181106119b4576119b461376d565b90506020020160208101906119c991906134c2565b61ffff1611156119ec5760405163a18a709360e01b815260040160405180910390fd5b8282828181106119fe576119fe61376d565b9050602002016020810190611a1391906134c2565b60095f878785818110611a2857611a2861376d565b9050602002016020810190611a3d9190613386565b6001600160a01b03166001600160a01b031681526020019081526020015f205f6101000a81548161ffff021916908361ffff16021790555042600a5f878785818110611a8b57611a8b61376d565b9050602002016020810190611aa09190613386565b6001600160a01b0316815260208101919091526040015f20805467ffffffffffffffff19166001600160401b0392909216919091179055848482818110611ae957611ae961376d565b9050602002016020810190611afe9190613386565b6001600160a01b03167f6077f20b6a44bf02b04c24d76446115b96fc65b5de1108b1efa5c4157b0aabdd848484818110611b3a57611b3a61376d565b9050602002016020810190611b4f91906134c2565b6040805161ffff90921682526001600160401b03421660208301520160405180910390a2600101611997565b5050505050565b611b8a612f6d565b806001600160601b03165f03611bb357604051630ce23d3f60e21b815260040160405180910390fd5b600154604080516001600160601b03928316815291831660208301527f21fd8be1d819ff23de6e9905c47f1b8445ca4a4827494115def83c078a306caa910160405180910390a1600180546bffffffffffffffffffffffff19166001600160601b0392909216919091179055565b611c29612f6d565b611c316129b7565b5f83815260056020908152604080832063ffffffff8616845290915290206001810154600160a81b900460ff1680611c71575080546001600160601b0316155b15611c8f576040516336ab81e160e11b815260040160405180910390fd5b60018101805460ff60a81b1916600160a81b17905580546001600160601b03165f83611cc85760018301546001600160a01b0316611cf5565b60038681548110611cdb57611cdb61376d565b5f9182526020909120600590910201546001600160a01b03165b6001600160a01b0381165f90815260066020526040812080549293506001600160601b03851692909190611d2a908490613846565b90915550506040805185151581526001600160601b038416602082015263ffffffff87169188917f2eedc13fc518b8fd077e61a3677d7b2aa7440b13af7e2aef6ff79d538e888e75910160405180910390a35050506113c960015f5160206139cb5f395f51905f5255565b611d9d612f6d565b6119485f612f99565b611dae612f6d565b6103e88161ffff161115611dd55760405163a18a709360e01b815260040160405180910390fd5b6001546040805161ffff600160601b9093048316815291831660208301527fc13ea1b1c0afe1bd75530d16f058cc94129f3de6add2da231e267607e2bb645c910160405180910390a16001805461ffff909216600160601b0261ffff60601b19909216919091179055565b5f5f611e4b83612fe8565b90505f198114611e92575f838152600460205260409020805482908110611e7457611e7461376d565b5f9182526020909120600290910201546001600160a01b0316611e94565b5f5b9392505050565b611ea36129b7565b5f82815260046020526040902080548210611ed15760405163fafbff9360e01b815260040160405180910390fd5b5f818381548110611ee457611ee461376d565b5f918252602090912060029091020180549091506001600160a01b03163314611f20576040516301e1a84160e11b815260040160405180910390fd5b600181015462010000900460ff1615611f4c57604051639df90fa360e01b815260040160405180910390fd5b336001600160a01b031660038581548110611f6957611f6961376d565b5f9182526020909120600160059092020101546001600160a01b031603611fa35760405163a2b20ea160e01b815260040160405180910390fd5b6001810180546201000062ff00001990911617905580546001600160a01b0381168255335f9081526006602052604081208054600160a01b9093046001600160601b031692839290611ff6908490613846565b90915550506040516001600160601b0382168152339086907ff8dbdba17ddaa167ba2df095e986cc6546bb61eca07b0fe2f1766d2b483f40f89060200160405180910390a350505061205460015f5160206139cb5f395f51905f5255565b5050565b6120d0604080516101e0810182525f808252602082018190529181018290526060810182905290608082019081526020015f81525f6020820181905260408201819052606082018190526080820181905260a0820181905260c0820181905260e0820181905261010082018190526101209091015290565b600382815481106120e3576120e361376d565b5f918252602091829020604080516101e081018252600590930290910180546001600160a01b0380821685526001600160601b03600160a01b9283900481169686019690965260018301549081169385019390935290910490921660608201526002820154909190608083019060ff166003811115612164576121646134fb565b6003811115612175576121756134fb565b81526020016002820160019054906101000a900460ff16600381111561219d5761219d6134fb565b60038111156121ae576121ae6134fb565b8152600282015462010000810461ffff9081166020840152640100000000820481166040840152600160301b8204166060830152600160401b810463ffffffff9081166080840152600160601b8204811660a0840152600160801b8204811660c0840152600160a01b9091046001600160401b031660e083015260038301546101008301526004909201549091166101209091015292915050565b5f82815260056020908152604080832063ffffffff85168452909152902060018101546001600160a01b03163314612294576040516301e1a84160e11b815260040160405180910390fd5b6001810154600160a81b900460ff16156122c1576040516336ab81e160e11b815260040160405180910390fd5b8054600160601b90046001600160401b031642106122f25760405163a4229fab60e01b815260040160405180910390fd5b60018101805460ff60a01b1916600160a01b179055604051339063ffffffff84169085907f13be65c22b56de10576e2bd0a5ac5c27cbf419db4d6f2010c753401e4bad8aa5905f90a4505050565b6123486129b7565b5f6003828154811061235c5761235c61376d565b5f91825260209091206005909102019050600280820154610100900460ff16600381111561238c5761238c6134fb565b14806123b5575060036002820154610100900460ff1660038111156123b3576123b36134fb565b145b156123d357604051634291db1560e11b815260040160405180910390fd5b600281015463ffffffff600160601b82048116600160801b9092041610155f806002840154610100900460ff166003811115612411576124116134fb565b148015612427575082546001600160a01b031633145b905081158015612435575080155b1561245357604051634291db1560e11b815260040160405180910390fd5b82546001600160a01b0381168085555f9081526006602052604081208054600160a01b9093046001600160601b031692839290612491908490613846565b909155505060018401546001600160a01b0316158015906124c557506001840154600160a01b90046001600160601b031615155b15612513576001840180546001600160a01b038116918290555f9182526006602052604082208054600160a01b9092046001600160601b031692839261250c908490613846565b9091555050505b61251c85613095565b8261252857600361252b565b60025b60028501805461ff00191661010083600381111561254b5761254b6134fb565b02179055506040516001600160601b038216815285907fd0281b5169204f977d34527d1c2d6bd21e9fb587e36110bef97a44bdf101b6ac9060200160405180910390a2505050506125a860015f5160206139cb5f395f51905f5255565b50565b6125b3612f6d565b5f54604080516001600160401b03600160a01b9093048316815291831660208301527fa8f75854b1474ce9dbfa64e1be30d55ba643baab811a64dd7a018aa47b736d00910160405180910390a15f80546001600160401b03909216600160a01b0267ffffffffffffffff60a01b19909216919091179055565b6002546001600160a01b0316331461265757604051630b5873a560e31b815260040160405180910390fd5b6103e88161ffff16111561267e5760405163a18a709360e01b815260040160405180910390fd5b6001600160a01b0382165f818152600960209081526040808320805461ffff191661ffff8716908117909155600a835292819020805467ffffffffffffffff1916426001600160401b03169081179091558151938452918301919091527f6077f20b6a44bf02b04c24d76446115b96fc65b5de1108b1efa5c4157b0aabdd910160405180910390a25050565b5f6127186020830183613386565b6127286040840160208501613468565b6127386060850160408601613468565b6127486080860160608701613386565b61275860a08701608088016136b2565b8660a001356040516020016127b6969594939291906001600160a01b0396871681526001600160601b039586166020820152939094166040840152931660608201526001600160401b0392909216608083015260a082015260c00190565b604051602081830303815290604052805190602001209050919050565b6127db612f6d565b6001600160a01b03811661280957604051631e4fbdf760e01b81525f60048201526024015b60405180910390fd5b6125a881612f99565b61281a6129b7565b5f82815260056020908152604080832063ffffffff8516845290915290206001810154600160a81b900460ff168061285a575080546001600160601b0316155b15612878576040516336ab81e160e11b815260040160405180910390fd5b6001810154600160a01b900460ff16156128a5576040516336ab81e160e11b815260040160405180910390fd5b8054600160601b90046001600160401b03164210156128d75760405163a4229fab60e01b815260040160405180910390fd5b60018101805460ff60a81b1916600160a81b1790558054600380546001600160601b039092169182916006915f9190889081106129165761291661376d565b5f91825260208083206005909202909101546001600160a01b031683528201929092526040018120805490919061294e908490613846565b909155505060408051600181526001600160601b038316602082015263ffffffff85169186917f2eedc13fc518b8fd077e61a3677d7b2aa7440b13af7e2aef6ff79d538e888e75910160405180910390a3505061205460015f5160206139cb5f395f51905f5255565b6129bf613168565b60025f5160206139cb5f395f51905f5255565b436129e360a08301608084016136b2565b6001600160401b03161180612a0e5750612a036040820160208301613468565b6001600160601b0316155b15612a2c5760405163158767e760e01b815260040160405180910390fd5b5f63ffffffff841615612a70575f85815260086020526040812090612a526001876138ff565b63ffffffff1663ffffffff1681526020019081526020015f20612a7e565b5f8581526007602052604090205b6040805160808101825282548082526001909301546001600160601b03811660208301526001600160401b03600160601b8204811693830193909352600160a01b9004909116606082015291501580612ae2575060208101516001600160601b0316155b15612b005760405163ad4647c160e01b815260040160405180910390fd5b60408101516001600160401b0316612b1e60a08401608085016136b2565b6001600160401b03161015612b465760405163158767e760e01b815260040160405180910390fd5b6020808201515f91612710916001600160601b0316908290612b6e9060408801908801613468565b6001600160601b0316612b81919061391b565b612b8b919061394a565b612b959190613976565b90505f612ba28286613976565b90506001811380612bb357505f1981125b15612bd157604051636099d65f60e01b815260040160405180910390fd5b5f612bdb8561270a565b90506040518060800160405280828152602001866020016020810190612c019190613468565b6001600160601b03168152602001612c1f60a08801608089016136b2565b6001600160401b0390811682524281166020928301525f8b815260088352604080822063ffffffff8d1680845290855291819020855181559385015160019094018054868301516060909701518516600160a01b0267ffffffffffffffff60a01b1997909516600160601b026001600160a01b03199091166001600160601b0390961695909517949094179490941691909117909155905189907f13dbc322be241cd8c15ea230669cadc20e47affee38ef7289db6912fe574374f90612ce89085908a90613859565b60405180910390a35050505050505050565b6001820180545f90915560048301805463ffffffff191690556001600160a01b03811690600160a01b90046001600160601b03168015612d6a576001600160a01b0382165f90815260066020526040812080546001600160601b0384169290612d64908490613846565b90915550505b816001600160a01b0316857f03b20d0fcf98bb7d0a6cd04c51563675100959d5f4f5411ed86efcde88092c4e85604051612da49190613995565b60405180910390a35f612db686612fe8565b90505f19811480612de15750600285015463ffffffff600160601b82048116600160801b9092041610155b15612df95750505050600201805461ff001916905550565b60028501805461ff0019169055612e11868683612e19565b505050505050565b5f83815260046020526040902080548210612e475760405163fafbff9360e01b815260040160405180910390fd5b5f818381548110612e5a57612e5a61376d565b905f5260205f20906002020190508060010160029054906101000a900460ff1615612e9857604051639df90fa360e01b815260040160405180910390fd5b6001818101805462ff0000191662010000179055815490850180546001600160a01b0319166001600160a01b03928316908117825583546001600160601b03600160a01b918290048116820290921790925560028701805460048901805463ffffffff1916905561010061ff0067ffffffffffffffff60a01b0119909116426001600160401b03168502171790558354604080519382049092168352905192169187917ffc2b5e56d65b9e9bc0a01f3e087d984ae9003dbadc7ef1035a11f4bae8a59eaa919081900360200190a35050505050565b5f546001600160a01b031633146119485760405163118cdaa760e01b8152336004820152602401612800565b5f80546001600160a01b038381166001600160a01b0319831681178455604051919092169283917f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e09190a35050565b5f8181526004602052604081205f19617fff19835b835481101561308b575f8482815481106130195761301961376d565b905f5260205f20906002020190508060010160029054906101000a900460ff168061305357508054600160a01b90046001600160601b0316155b1561305e5750613083565b60018181015484820b910b1315613081576001808201549294509190910b915082905b505b600101612ffd565b5090949350505050565b5f818152600460205260408120905b81548110156113c9575f8282815481106130c0576130c061376d565b905f5260205f20906002020190508060010160029054906101000a900460ff16806130fa57508054600160a01b90046001600160601b0316155b156131055750613160565b6001810180546201000062ff00001990911617905580546001600160a01b0381168083555f9081526006602052604081208054600160a01b9093046001600160601b031692839290613158908490613846565b909155505050505b6001016130a4565b5f5160206139cb5f395f51905f525460020361194857604051633ee5aeb560e01b815260040160405180910390fd5b803561ffff811681146131a8575f5ffd5b919050565b803563ffffffff811681146131a8575f5ffd5b5f5f5f5f5f5f60c087890312156131d5575f5ffd5b8635600481106131e3575f5ffd5b95506131f160208801613197565b94506131ff60408801613197565b935061320d60608801613197565b925061321b608088016131ad565b915061322960a088016131ad565b90509295509295509295565b5f60208284031215613245575f5ffd5b5035919050565b602080825282518282018190525f918401906040840190835b818110156132bf57835160018060a01b0381511684526001600160601b036020820151166020850152604081015160010b604085015260608101511515606085015250608083019250602084019350600181019050613265565b509095945050505050565b5f5f604083850312156132db575f5ffd5b823591506132eb602084016131ad565b90509250929050565b5f60c08284031215613304575f5ffd5b50919050565b5f5f5f610100848603121561331d575f5ffd5b833592506020840135915061333585604086016132f4565b90509250925092565b5f5f6040838503121561334f575f5ffd5b823591506020830135600181900b8114613367575f5ffd5b809150509250929050565b6001600160a01b03811681146125a8575f5ffd5b5f60208284031215613396575f5ffd5b8135611e9481613372565b5f5f83601f8401126133b1575f5ffd5b5081356001600160401b038111156133c7575f5ffd5b6020830191508360208260051b85010111156133e1575f5ffd5b9250929050565b5f5f5f5f604085870312156133fb575f5ffd5b84356001600160401b03811115613410575f5ffd5b61341c878288016133a1565b90955093505060208501356001600160401b0381111561343a575f5ffd5b613446878288016133a1565b95989497509550505050565b80356001600160601b03811681146131a8575f5ffd5b5f60208284031215613478575f5ffd5b611e9482613452565b5f5f5f60608486031215613493575f5ffd5b833592506134a3602085016131ad565b9150604084013580151581146134b7575f5ffd5b809150509250925092565b5f602082840312156134d2575f5ffd5b611e9482613197565b5f5f604083850312156134ec575f5ffd5b50508035926020909101359150565b634e487b7160e01b5f52602160045260245ffd5b600481106125a857634e487b7160e01b5f52602160045260245ffd5b6135348161350f565b9052565b81516001600160a01b031681526101e08101602083015161356460208401826001600160601b03169052565b50604083015161357f60408401826001600160a01b03169052565b50606083015161359a60608401826001600160601b03169052565b5060808301516135ad608084018261352b565b5060a08301516135c060a084018261352b565b5060c08301516135d660c084018261ffff169052565b5060e08301516135ec60e084018261ffff169052565b5061010083015161360461010084018261ffff169052565b5061012083015161361e61012084018263ffffffff169052565b5061014083015161363861014084018263ffffffff169052565b5061016083015161365261016084018263ffffffff169052565b5061018083015161366f6101808401826001600160401b03169052565b506101a08301516101a08301526101c08301516136956101c084018263ffffffff169052565b5092915050565b80356001600160401b03811681146131a8575f5ffd5b5f602082840312156136c2575f5ffd5b611e948261369c565b5f5f604083850312156136dc575f5ffd5b82356136e781613372565b91506132eb60208401613197565b5f60c08284031215613705575f5ffd5b611e9483836132f4565b6060810161371c8561350f565b9381526001600160601b0392909216602083015263ffffffff1660409091015290565b634e487b7160e01b5f52601160045260245ffd5b5f600160ff1b82016137675761376761373f565b505f0390565b634e487b7160e01b5f52603260045260245ffd5b6001600160401b0381811683821601908111156137a0576137a061373f565b92915050565b63ffffffff81811683821601908111156137a0576137a061373f565b8082018281125f8312801582168215821617156137e1576137e161373f565b505092915050565b80820281158282048414176137a0576137a061373f565b634e487b7160e01b5f52601260045260245ffd5b5f8261382257613822613800565b500490565b6001600160601b0382811682821603908111156137a0576137a061373f565b808201808211156137a0576137a061373f565b82815260e08101823561386b81613372565b6001600160a01b03166020838101919091526001600160601b0390613891908501613452565b1660408301526001600160601b036138ab60408501613452565b16606083015260608301356138bf81613372565b6001600160a01b03166080838101919091526001600160401b03906138e590850161369c565b1660a083810191909152929092013560c090910152919050565b63ffffffff82811682821603908111156137a0576137a061373f565b8082025f8212600160ff1b841416156139365761393661373f565b81810583148215176137a0576137a061373f565b5f8261395857613958613800565b600160ff1b82145f19841416156139715761397161373f565b500590565b8181035f8312801583831316838312821617156136955761369561373f565b602081525f82518060208401528060208501604085015e5f604082850101526040601f19601f8301168401019150509291505056fe9b779b17422d0df92223018b32b4d1fa46e071723d6817e2486d003becc55f00a2646970667358221220b01c48bd8a1de6c639d6b4977ad9a3c4ee9d36f0b5fa02ef1fc5a1e87a502d4c64736f6c634300081c0033" as `0x${string}`;
