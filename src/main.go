package main

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	_ "embed"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
)

//go:embed venv.tar.gz
var venvTarball []byte
var venvTarballSha256 = "45f711b17d421783be276c284e52199d64becf19a51c522e5dc6a69e055dbda3"

func main() {
	// Create temp directory path based on SHA256
	tempDir := filepath.Join(os.TempDir(), "azure-cli-venv-"+venvTarballSha256)

	// Check if the venv directory already exists
	if _, err := os.Stat(tempDir); err != nil {
		if err := extractTarball(venvTarball, tempDir); err != nil {
			fmt.Fprintf(os.Stderr, "Failed to extract venv: %v\n", err)
			os.Exit(1)
		}

		// Extract the bundled pixi environment
		pixiScript := filepath.Join(tempDir, "pixi.sh")
		if _, err := os.Stat(pixiScript); err == nil {
			cmd := exec.Command(pixiScript, "-o", tempDir)
			var output bytes.Buffer
			cmd.Stdout = &output
			cmd.Stderr = &output
			if err := cmd.Run(); err != nil {
				fmt.Fprintf(os.Stderr, "Failed to extract pixi env: %v\n%s", err, output.String())
				os.Exit(1)
			}
		}
	}

	// Clean up old venv directories from previous versions
	cleanupOldVenvs(tempDir)

	// Execute Python with azure.cli module
	pythonPath := filepath.Join(tempDir, "env", "bin", "python")
	if runtime.GOOS == "windows" {
		pythonPath = filepath.Join(tempDir, "python.exe")
	}
	args := append([]string{pythonPath, "-m", "azure.cli"}, os.Args[1:]...)

	// Discover Python version dynamically
	pythonVersion := getPythonVersion(tempDir)
	env := append(os.Environ(), "PYTHONPATH="+tempDir+"/lib/python"+pythonVersion+"/site-packages:"+tempDir+"/env/lib/python"+pythonVersion)

	if runtime.GOOS != "windows" {
		// On Unix-like systems, replace the current process
		if err := syscall.Exec(pythonPath, args, env); err != nil {
			fmt.Fprintf(os.Stderr, "Failed to exec python: %v\n", err)
			os.Exit(1)
		}
	} else {
		// On Windows, spawn a child process
		cmd := exec.Command(pythonPath, args[1:]...)
		cmd.Stdin = os.Stdin
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		cmd.Env = env

		if err := cmd.Run(); err != nil {
			if exitErr, ok := err.(*exec.ExitError); ok {
				os.Exit(exitErr.ExitCode())
			}
			fmt.Fprintf(os.Stderr, "Failed to run python: %v\n", err)
			os.Exit(1)
		}
	}
}

func extractTarball(data []byte, destDir string) error {
	// Create destination directory
	if err := os.MkdirAll(destDir, 0755); err != nil {
		return fmt.Errorf("failed to create directory: %w", err)
	}

	// Create gzip reader
	gzipReader, err := gzip.NewReader(bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("failed to create gzip reader: %w", err)
	}
	defer gzipReader.Close()

	// Create tar reader
	tarReader := tar.NewReader(gzipReader)

	// Extract each file from the tarball
	for {
		header, err := tarReader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return fmt.Errorf("failed to read tar header: %w", err)
		}

		// Construct target path
		target := filepath.Join(destDir, header.Name)

		// Ensure the target is within destDir (security check)
		rel, err := filepath.Rel(destDir, target)
		if err != nil || strings.HasPrefix(rel, "..") {
			return fmt.Errorf("invalid file path: %s", header.Name)
		}

		switch header.Typeflag {
		case tar.TypeDir:
			// Create directory
			if err := os.MkdirAll(target, os.FileMode(header.Mode)); err != nil {
				return fmt.Errorf("failed to create directory %s: %w", target, err)
			}

		case tar.TypeReg:
			// Create parent directory if needed
			if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
				return fmt.Errorf("failed to create parent directory for %s: %w", target, err)
			}

			// Create file
			outFile, err := os.OpenFile(target, os.O_CREATE|os.O_RDWR|os.O_TRUNC, os.FileMode(header.Mode))
			if err != nil {
				return fmt.Errorf("failed to create file %s: %w", target, err)
			}

			// Copy file contents
			if _, err := io.Copy(outFile, tarReader); err != nil {
				outFile.Close()
				return fmt.Errorf("failed to write file %s: %w", target, err)
			}
			outFile.Close()

		case tar.TypeSymlink:
			// Create symlink
			if err := os.Symlink(header.Linkname, target); err != nil {
				return fmt.Errorf("failed to create symlink %s: %w", target, err)
			}
		}
	}

	return nil
}

func getPythonVersion(tempDir string) string {
	// Check the lib directory for python version subdirectories
	libDir := filepath.Join(tempDir, "lib")
	entries, err := os.ReadDir(libDir)
	if err == nil {
		for _, entry := range entries {
			if entry.IsDir() && strings.HasPrefix(entry.Name(), "python") {
				// Extract version from directory name (e.g., "python3.14" -> "3.14")
				version := strings.TrimPrefix(entry.Name(), "python")
				if version != "" && version != entry.Name() {
					return version
				}
			}
		}
	}
	return ""
}

func cleanupOldVenvs(currentVenvDir string) {
	tempBase := os.TempDir()
	currentDirName := filepath.Base(currentVenvDir)

	entries, err := os.ReadDir(tempBase)
	if err != nil {
		// If we can't read the temp dir, just continue - this is best-effort cleanup
		return
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		name := entry.Name()
		// Check if it matches the pattern and is not the current directory
		if strings.HasPrefix(name, "azure-cli-venv-") && name != currentDirName {
			oldPath := filepath.Join(tempBase, name)
			os.RemoveAll(oldPath) // Best-effort removal, ignore errors
		}
	}
}
