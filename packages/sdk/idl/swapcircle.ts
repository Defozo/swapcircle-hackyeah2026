/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/swapcircle.json`.
 */
export type Swapcircle = {
  "address": "HkboPxfwBemtYkwfkHzMknHdiM7YP32KkU6Rgjy4LGun",
  "metadata": {
    "name": "swapcircle",
    "version": "1.0.0",
    "spec": "0.1.0",
    "description": "Exact 2-4 party SPL swaps with atomic final funding and independent refunds"
  },
  "instructions": [
    {
      "name": "closeEmptyVault",
      "discriminator": [
        164,
        188,
        208,
        189,
        128,
        218,
        166,
        248
      ],
      "accounts": [
        {
          "name": "cycle",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "rentPayer",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "index",
          "type": "u8"
        }
      ]
    },
    {
      "name": "createCycle",
      "docs": [
        "remaining_accounts = [mint, vault] per leg, in immutable flow order."
      ],
      "discriminator": [
        230,
        206,
        158,
        192,
        122,
        193,
        246,
        254
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "cycle",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  121,
                  99,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "creator"
              },
              {
                "kind": "arg",
                "path": "nonce"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "nonce",
          "type": "u64"
        },
        {
          "name": "deadline",
          "type": "i64"
        },
        {
          "name": "legs",
          "type": {
            "vec": {
              "defined": {
                "name": "leg"
              }
            }
          }
        }
      ]
    },
    {
      "name": "fundAndMaybeSettle",
      "docs": [
        "Every fund supplies all [mint, vault, canonical recipient ATA] triples.",
        "Readiness is decided on-chain, never from a stale client observation."
      ],
      "discriminator": [
        236,
        144,
        36,
        65,
        50,
        240,
        119,
        25
      ],
      "accounts": [
        {
          "name": "cycle",
          "writable": true
        },
        {
          "name": "owner",
          "signer": true
        },
        {
          "name": "source",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "index",
          "type": "u8"
        },
        {
          "name": "expectedHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "refund",
      "docs": [
        "Permissionless fee payer, but strictly owner-preserving destination.",
        "No accounts of another leg are required, including for damaged ATAs."
      ],
      "discriminator": [
        2,
        96,
        183,
        251,
        63,
        208,
        46,
        46
      ],
      "accounts": [
        {
          "name": "cycle",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "mint"
        },
        {
          "name": "destination",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "index",
          "type": "u8"
        }
      ]
    },
    {
      "name": "returnSurplus",
      "discriminator": [
        70,
        86,
        75,
        105,
        216,
        187,
        109,
        148
      ],
      "accounts": [
        {
          "name": "cycle",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "mint"
        },
        {
          "name": "destination",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "index",
          "type": "u8"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "cycle",
      "discriminator": [
        189,
        110,
        197,
        59,
        103,
        0,
        241,
        115
      ]
    }
  ],
  "events": [
    {
      "name": "cycleCreated",
      "discriminator": [
        121,
        81,
        215,
        131,
        207,
        246,
        163,
        119
      ]
    },
    {
      "name": "cycleSettled",
      "discriminator": [
        161,
        82,
        193,
        119,
        38,
        164,
        168,
        198
      ]
    },
    {
      "name": "legFunded",
      "discriminator": [
        72,
        61,
        184,
        206,
        238,
        245,
        149,
        174
      ]
    },
    {
      "name": "legRefunded",
      "discriminator": [
        204,
        42,
        97,
        39,
        66,
        139,
        183,
        185
      ]
    },
    {
      "name": "surplusReturned",
      "discriminator": [
        99,
        242,
        91,
        77,
        129,
        235,
        8,
        122
      ]
    },
    {
      "name": "vaultClosed",
      "discriminator": [
        238,
        129,
        38,
        228,
        227,
        118,
        249,
        215
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidLegCount",
      "msg": "A cycle requires 2 to 4 distinct owners"
    },
    {
      "code": 6001,
      "name": "invalidDeadline",
      "msg": "Deadline must be in the future"
    },
    {
      "code": 6002,
      "name": "invalidAccounts",
      "msg": "Wrong number or order of accounts"
    },
    {
      "code": 6003,
      "name": "invalidAmount",
      "msg": "Amount must be a positive u64 and owner must be present"
    },
    {
      "code": 6004,
      "name": "duplicateOwner",
      "msg": "An owner may appear only once"
    },
    {
      "code": 6005,
      "name": "invalidVault",
      "msg": "Wrong vault PDA or conflicting initialized account"
    },
    {
      "code": 6006,
      "name": "invalidState",
      "msg": "Instruction unavailable in this cycle state"
    },
    {
      "code": 6007,
      "name": "deadlinePassed",
      "msg": "Funding deadline has passed"
    },
    {
      "code": 6008,
      "name": "termsMismatch",
      "msg": "Signed terms do not match the immutable cycle"
    },
    {
      "code": 6009,
      "name": "alreadyFunded",
      "msg": "Leg already funded"
    },
    {
      "code": 6010,
      "name": "wrongOwner",
      "msg": "Wrong token authority or funding signer"
    },
    {
      "code": 6011,
      "name": "invalidDestination",
      "msg": "Wrong or unsafe destination"
    },
    {
      "code": 6012,
      "name": "tooEarly",
      "msg": "Recovery and cleanup are unavailable before deadline"
    },
    {
      "code": 6013,
      "name": "notFunded",
      "msg": "Leg was never funded"
    },
    {
      "code": 6014,
      "name": "alreadyRefunded",
      "msg": "Leg already refunded"
    },
    {
      "code": 6015,
      "name": "noSurplus",
      "msg": "No surplus to return"
    },
    {
      "code": 6016,
      "name": "alreadyClosed",
      "msg": "Vault already closed permanently"
    },
    {
      "code": 6017,
      "name": "vaultNotEmpty",
      "msg": "Vault contains tokens"
    },
    {
      "code": 6018,
      "name": "wrongRentPayer",
      "msg": "Rent must return to the recorded payer"
    },
    {
      "code": 6019,
      "name": "invalidCycle",
      "msg": "Invalid cycle address or version"
    },
    {
      "code": 6020,
      "name": "invalidIndex",
      "msg": "Leg index outside cycle"
    },
    {
      "code": 6021,
      "name": "outstandingLiability",
      "msg": "The authorized deposit is still owed"
    },
    {
      "code": 6022,
      "name": "invalidMint",
      "msg": "Wrong mint or decimals"
    },
    {
      "code": 6023,
      "name": "unsupportedToken",
      "msg": "Only classic SPL, unfrozen non-native mints are supported"
    },
    {
      "code": 6024,
      "name": "invalidTokenAccount",
      "msg": "Invalid token account data"
    },
    {
      "code": 6025,
      "name": "unsafeTokenAccount",
      "msg": "Frozen account, delegate, native token or foreign close authority"
    }
  ],
  "types": [
    {
      "name": "cycle",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "version",
            "type": "u8"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "rentPayer",
            "type": "pubkey"
          },
          {
            "name": "nonce",
            "type": "u64"
          },
          {
            "name": "termsHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "deadline",
            "type": "i64"
          },
          {
            "name": "legCount",
            "type": "u8"
          },
          {
            "name": "legs",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "leg"
                  }
                },
                4
              ]
            }
          },
          {
            "name": "state",
            "type": {
              "defined": {
                "name": "cycleState"
              }
            }
          },
          {
            "name": "funded",
            "type": "u8"
          },
          {
            "name": "refunded",
            "type": "u8"
          },
          {
            "name": "closed",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "cycleCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "cycle",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "termsHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "deadline",
            "type": "i64"
          },
          {
            "name": "legCount",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "cycleSettled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "cycle",
            "type": "pubkey"
          },
          {
            "name": "termsHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "cycleState",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "funding"
          },
          {
            "name": "settled"
          },
          {
            "name": "refunding"
          },
          {
            "name": "refunded"
          }
        ]
      }
    },
    {
      "name": "leg",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "decimals",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "legFunded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "cycle",
            "type": "pubkey"
          },
          {
            "name": "index",
            "type": "u8"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "legRefunded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "cycle",
            "type": "pubkey"
          },
          {
            "name": "index",
            "type": "u8"
          },
          {
            "name": "destination",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "surplusReturned",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "cycle",
            "type": "pubkey"
          },
          {
            "name": "index",
            "type": "u8"
          },
          {
            "name": "destination",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "vaultClosed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "cycle",
            "type": "pubkey"
          },
          {
            "name": "index",
            "type": "u8"
          },
          {
            "name": "rentPayer",
            "type": "pubkey"
          }
        ]
      }
    }
  ]
};
