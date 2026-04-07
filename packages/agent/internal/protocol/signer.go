package protocol

import (
	"crypto/ecdsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/asn1"
	"encoding/pem"
	"fmt"
	"math/big"
)

// ecdsaSignature mirrors the ASN.1 DER structure produced by most ECDSA
// signing implementations (including crypto/ecdsa and OpenSSL).
type ecdsaSignature struct {
	R, S *big.Int
}

// VerifyCommand checks the ECDSA-SHA256 signature on cmd against the
// cloud's public key. It returns true only when the signature is valid.
//
// The signed payload is the concatenation of:
//
//	IdempotencyKey + CommandType + string(Payload)
//
// This matches the cloud signing logic and ensures that both the command
// identity (idempotency key) and the exact payload bytes are covered.
func VerifyCommand(cmd CommandRequest, pub *ecdsa.PublicKey) bool {
	if pub == nil {
		return false
	}
	if len(cmd.Signature) == 0 {
		return false
	}

	// Build the message that was signed on the cloud side.
	msg := cmd.IdempotencyKey + cmd.CommandType + string(cmd.Payload)
	digest := sha256.Sum256([]byte(msg))

	var sig ecdsaSignature
	if _, err := asn1.Unmarshal(cmd.Signature, &sig); err != nil {
		return false
	}

	return ecdsa.Verify(pub, digest[:], sig.R, sig.S)
}

// ParseECDSAPublicKey parses a PEM-encoded ECDSA public key (PKIX/SubjectPublicKeyInfo
// format) and returns the *ecdsa.PublicKey. Returns an error when the PEM
// block is missing, of the wrong type, or encodes a non-ECDSA key.
func ParseECDSAPublicKey(pemData string) (*ecdsa.PublicKey, error) {
	block, _ := pem.Decode([]byte(pemData))
	if block == nil {
		return nil, fmt.Errorf("signer: no PEM block found in public key data")
	}
	if block.Type != "PUBLIC KEY" {
		return nil, fmt.Errorf("signer: expected PEM type %q, got %q", "PUBLIC KEY", block.Type)
	}

	pub, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("signer: parse PKIX public key: %w", err)
	}

	ecPub, ok := pub.(*ecdsa.PublicKey)
	if !ok {
		return nil, fmt.Errorf("signer: key is %T, expected *ecdsa.PublicKey", pub)
	}

	return ecPub, nil
}
