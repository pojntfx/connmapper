package utils

import (
	"context"
	"fmt"
	"os/exec"
	"runtime"
)

func RunElevatedCommand(ctx context.Context, command string) error {
	switch runtime.GOOS {
	case "windows":
		if output, err := exec.CommandContext(ctx, "cmd.exe", "/C", "runas", "/user:Administrator", command).CombinedOutput(); err != nil {
			return fmt.Errorf("could run command with output: %s: %w", output, err)
		}
	case "darwin":
		if output, err := exec.CommandContext(ctx, "osascript", "-e", fmt.Sprintf(`do shell script "%v" with administrator privileges`, command)).CombinedOutput(); err != nil {
			return fmt.Errorf("could run command with output: %s: %w", output, err)
		}
	default:
		// Escalate using Polkit
		if pkexec, err := exec.LookPath("pkexec"); err == nil {
			if output, err := exec.CommandContext(ctx, pkexec, "sh", "-c", command).CombinedOutput(); err != nil {
				return fmt.Errorf("could run command with output: %s: %w", output, err)
			}
		} else {
			// Escalate using using terminal emulator
			xterm, err := exec.LookPath("xterm")
			if err != nil {
				return err
			}

			suid, err := exec.LookPath("sudo")
			if err != nil {
				suid, err = exec.LookPath("doas")
				if err != nil {
					return err
				}
			}

			if output, err := exec.CommandContext(
				ctx,
				xterm, "-T", "Authentication Required", "-e", fmt.Sprintf(`echo 'Authentication is needed.' && %v %v`, suid, command),
			).CombinedOutput(); err != nil {
				return fmt.Errorf("could run command with output: %s: %w", output, err)
			}
		}
	}

	return nil
}
