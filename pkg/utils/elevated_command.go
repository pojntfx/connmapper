package utils

import (
	"context"
	"errors"
	"fmt"
	"os/exec"
	"runtime"
)

var (
	ErrCouldNotExecuteCommand  = errors.New("could not execute command")
	ErrNoEscalationMethodFound = errors.New("no escalation method could be found")
	ErrNoTerminalFound         = errors.New("no terminal could be found")
)

const (
	FlatpakSpawnCmd = "flatpak-spawn"
)

// RunElevatedCommand runs a command with elevated (e.g. administrator or root) permissions
// Note that `title` and `body` will be passed into the shell without validation or escapes, so make sure
// to not enter any user-provided strings
func RunElevatedCommand(ctx context.Context, title, body, command string) error {
	switch runtime.GOOS {
	case "windows":
		powerShellBinary, err := exec.LookPath("pwsh.exe")
		if err != nil {
			powerShellBinary = "powershell.exe"
		}

		if output, err := exec.Command(powerShellBinary, `-Command`, fmt.Sprintf(`Start-Process '%v' -Verb RunAs -Wait -ArgumentList "%v"`, powerShellBinary, command)).CombinedOutput(); err != nil {
			return errors.Join(ErrCouldNotExecuteCommand, fmt.Errorf("could not execute command with output: %s", output), err)
		}

	case "darwin":
		if output, err := exec.Command(
			"osascript",
			"-e",
			fmt.Sprintf(`do shell script "%v" with administrator privileges with prompt "%v: %v"`, command, title, body),
		).CombinedOutput(); err != nil {
			return errors.Join(ErrCouldNotExecuteCommand, fmt.Errorf("could not execute command with output: %s", output), err)
		}

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
				return errors.Join(ErrNoTerminalFound, err)
			}

			suid, err := exec.LookPath("run0")
			if err != nil {
				suid, err = exec.LookPath("sudo")
				if err != nil {
					suid, err = exec.LookPath("doas")
					if err != nil {
						return errors.Join(ErrNoEscalationMethodFound, err)
					}
				}
			}

			command = terminal + " -T '" + title + `' -e "echo '` + body + `' && ` + suid + " " + command + `"`
		}

		if output, err := exec.Command(binaryName, append(prefix, []string{command}...)...).CombinedOutput(); err != nil {
			return errors.Join(ErrCouldNotExecuteCommand, fmt.Errorf("could not execute command with output: %s", output), err)
		}
	}

	return nil
}
