package updater

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"

	"github.com/rs/zerolog"
)

const (
	// httpTimeout is applied to every HTTP request the updater makes.
	httpTimeout = 60 * time.Second

	// downloadPermissions is the mode applied to the downloaded binary.
	downloadPermissions = 0o755
)

// VersionInfo is the JSON structure served by the /version endpoint.
type VersionInfo struct {
	// Version is a semver string, e.g. "1.2.3".
	Version string `json:"version"`

	// Downloads is a map from "os/arch" to download URL.
	// Example key: "linux/amd64".
	Downloads map[string]string `json:"downloads"`

	// SHA256Sums maps download URL to its expected SHA-256 hex digest.
	SHA256Sums map[string]string `json:"sha256sums"`
}

// Updater checks the cloud for a newer agent binary, downloads it, verifies
// its SHA-256 checksum, and replaces the running executable via an atomic
// rename + exec.
type Updater struct {
	currentVersion string
	updateURL      string // base URL; /version is appended for the manifest
	log            zerolog.Logger
	httpClient     *http.Client
}

// New creates an Updater. currentVersion should match the value injected by
// ldflags (e.g. "1.0.0"). updateURL should be a base URL without a trailing
// slash (e.g. "https://updates.example.com/agent").
func New(currentVersion, updateURL string, log zerolog.Logger) *Updater {
	return &Updater{
		currentVersion: currentVersion,
		updateURL:      strings.TrimRight(updateURL, "/"),
		log:            log.With().Str("component", "updater").Logger(),
		httpClient: &http.Client{
			Timeout: httpTimeout,
		},
	}
}

// CheckAndUpdate fetches the version manifest, compares versions, and
// performs an in-place binary replacement if a newer version is available.
//
// On a successful update it replaces the running process via exec(2) so the
// new binary takes over without leaving zombie processes.
//
// Returns nil when the agent is already up to date or when an update is not
// available. Returns a non-nil error only for unexpected failures.
func (u *Updater) CheckAndUpdate(ctx context.Context) error {
	u.log.Info().Str("current_version", u.currentVersion).Msg("checking for updates")

	info, err := u.fetchVersionInfo(ctx)
	if err != nil {
		return fmt.Errorf("updater: fetch version info: %w", err)
	}

	if !isNewer(u.currentVersion, info.Version) {
		u.log.Info().
			Str("current", u.currentVersion).
			Str("latest", info.Version).
			Msg("agent is up to date")
		return nil
	}

	u.log.Info().
		Str("current", u.currentVersion).
		Str("latest", info.Version).
		Msg("newer version available, starting update")

	platform := runtime.GOOS + "/" + runtime.GOARCH
	downloadURL, ok := info.Downloads[platform]
	if !ok {
		return fmt.Errorf("updater: no download URL for platform %s", platform)
	}

	expectedSum, ok := info.SHA256Sums[downloadURL]
	if !ok {
		return fmt.Errorf("updater: no SHA-256 checksum for %s", downloadURL)
	}

	// Determine paths.
	execPath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("updater: determine executable path: %w", err)
	}
	execPath, err = filepath.EvalSymlinks(execPath)
	if err != nil {
		return fmt.Errorf("updater: resolve symlinks for %q: %w", execPath, err)
	}

	tmpPath := execPath + ".new"

	u.log.Info().Str("url", downloadURL).Msg("downloading new binary")
	if err := u.downloadBinary(ctx, downloadURL, tmpPath); err != nil {
		return fmt.Errorf("updater: download: %w", err)
	}

	// Verify checksum before touching the live binary.
	if err := verifyChecksum(tmpPath, expectedSum); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("updater: checksum mismatch: %w", err)
	}

	u.log.Info().Str("path", tmpPath).Msg("checksum verified, replacing binary")

	// Backup the current binary so we can recover on a failed exec.
	backupPath := execPath + ".old"
	if err := os.Rename(execPath, backupPath); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("updater: backup current binary: %w", err)
	}

	if err := os.Rename(tmpPath, execPath); err != nil {
		// Try to restore the backup.
		_ = os.Rename(backupPath, execPath)
		os.Remove(tmpPath)
		return fmt.Errorf("updater: replace binary: %w", err)
	}

	// Cleanup backup on success.
	_ = os.Remove(backupPath)

	u.log.Info().
		Str("new_version", info.Version).
		Str("path", execPath).
		Msg("binary replaced, re-executing")

	// Re-exec the new binary with the same arguments. This is the standard
	// self-update pattern on Linux/macOS. The OS atomically closes the old
	// file descriptors and starts fresh.
	return execNewBinary(execPath)
}

// fetchVersionInfo GETs the /version endpoint and decodes the JSON response.
func (u *Updater) fetchVersionInfo(ctx context.Context) (*VersionInfo, error) {
	url := u.updateURL + "/version"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Accept", "application/json")

	resp, err := u.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("GET %s: %w", url, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GET %s returned HTTP %d", url, resp.StatusCode)
	}

	var info VersionInfo
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return nil, fmt.Errorf("decode version JSON: %w", err)
	}
	return &info, nil
}

// downloadBinary streams a binary from url into destPath, setting executable
// permissions.
func (u *Updater) downloadBinary(ctx context.Context, url, destPath string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}

	resp, err := u.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("GET %s: %w", url, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("GET %s returned HTTP %d", url, resp.StatusCode)
	}

	// #nosec G304 — destPath is derived from os.Executable(), not user input.
	f, err := os.OpenFile(destPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, downloadPermissions)
	if err != nil {
		return fmt.Errorf("create %q: %w", destPath, err)
	}
	defer f.Close()

	if _, err := io.Copy(f, resp.Body); err != nil {
		return fmt.Errorf("write to %q: %w", destPath, err)
	}

	return f.Sync()
}

// verifyChecksum computes the SHA-256 of the file at path and compares it
// against expected (hex-encoded).
func verifyChecksum(path, expected string) error {
	f, err := os.Open(path) // #nosec G304
	if err != nil {
		return fmt.Errorf("open %q: %w", path, err)
	}
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return fmt.Errorf("hash %q: %w", path, err)
	}

	actual := hex.EncodeToString(h.Sum(nil))
	if actual != strings.ToLower(expected) {
		return fmt.Errorf("expected %s, got %s", expected, actual)
	}
	return nil
}

// isNewer returns true when candidate is strictly newer than current.
// Both are expected to be simple "MAJOR.MINOR.PATCH" strings; any parse error
// falls back to a string comparison.
func isNewer(current, candidate string) bool {
	if current == "dev" || current == "" {
		return false // never auto-update dev builds
	}
	cv := parseVersion(current)
	nv := parseVersion(candidate)
	for i := range cv {
		if nv[i] > cv[i] {
			return true
		}
		if nv[i] < cv[i] {
			return false
		}
	}
	return false
}

// parseVersion converts "1.2.3" into [3]int{1, 2, 3}. Malformed segments
// are treated as 0.
func parseVersion(v string) [3]int {
	v = strings.TrimPrefix(v, "v")
	parts := strings.SplitN(v, ".", 3)
	var result [3]int
	for i := 0; i < len(parts) && i < 3; i++ {
		n := 0
		for _, ch := range parts[i] {
			if ch >= '0' && ch <= '9' {
				n = n*10 + int(ch-'0')
			}
		}
		result[i] = n
	}
	return result
}

// execNewBinary replaces the current process image with the binary at path
// using syscall.Exec (unix exec(2)). This is a Linux/macOS-only operation.
func execNewBinary(path string) error {
	args := os.Args
	env := os.Environ()
	return syscall.Exec(path, args, env) // #nosec G204
}
