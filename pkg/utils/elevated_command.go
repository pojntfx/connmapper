package utils

import (
	"context"
	"errors"
	"fmt"
	"os/exec"
	"runtime"
)

var (
	ErrNoEscalationMethodFound = errors.New("no escalation method could be found")
	ErrNoTerminalFound         = errors.New("no terminal could be found")
)

const (
	FlatpakSpawnCmd = "flatpak-spawn"
)

// CreateElevatedCommand creates a command that runs with with elevated (e.g. administrator or root) permissions
// Note that `title` and `body` will be passed into the shell without validation or escapes, so make sure
// to not enter any user-provided strings
func CreateElevatedCommand(ctx context.Context, title, body, command string) (*exec.Cmd, error) {
	switch runtime.GOOS {
	case "windows":
		powerShellBinary, err := exec.LookPath("pwsh.exe")
		if err != nil {
			powerShellBinary = "powershell.exe"
		}

		return exec.CommandContext(ctx, powerShellBinary, `-Command`, fmt.Sprintf(`Start-Process '%v' -Verb RunAs -Wait -ArgumentList "%v"`, powerShellBinary, command)), nil

	case "darwin":
		return exec.CommandContext(
			ctx,
			"osascript",
			"-e",
			fmt.Sprintf(`do shell script "%v" with administrator privileges with prompt "%v: %v"`, command, title, body),
		), nil

	default:
		var (
			binaryName string
			prefix     = []string{}
		)
		if _, err := exec.LookPath(FlatpakSpawnCmd); err == nil {
			binaryName = FlatpakSpawnCmd
			prefix = append(prefix, "--host")
		} else {
			binaryName = "sh"
			prefix = append(prefix, "-c")
		}

		// Escalate using Polkit
		if pkexec, err := exec.LookPath("pkexec"); err == nil {
			command = pkexec + " " + command
		} else {
			// Escalate manually using using terminal emulator as a fallback
			// This doesn't work inside Flatpak - for Flatpak systems we asume that `pkexec` is available, so this code would never be reached
			terminal, err := exec.LookPath("xterm")
			if err != nil {
				return nil, errors.Join(ErrNoTerminalFound, err)
			}

			suid, err := exec.LookPath("run0")
			if err != nil {
				suid, err = exec.LookPath("sudo")
				if err != nil {
					suid, err = exec.LookPath("doas")
					if err != nil {
						return nil, errors.Join(ErrNoEscalationMethodFound, err)
					}
				}
			}

			command = terminal + " -T '" + title + `' -e "echo '` + body + `' && ` + suid + " " + command + `"`
		}

		return exec.Command(binaryName, append(prefix, []string{command}...)...), nil
	}
}
