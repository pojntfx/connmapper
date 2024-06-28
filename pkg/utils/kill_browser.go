package utils

import (
	"fmt"
	"os/exec"
	"runtime"
	"strconv"
	"syscall"

	"github.com/pojntfx/hydrapp/hydrapp/pkg/ui"
)

func KillBrowser(browserState *ui.BrowserState) error {
	if browserState != nil && browserState.Cmd != nil && browserState.Cmd.Process != nil {
		// Windows does not support the `SIGTERM` signal
		if runtime.GOOS == "windows" {
			if output, err := exec.Command("taskkill", "/pid", strconv.Itoa(browserState.Cmd.Process.Pid)).CombinedOutput(); err != nil {
				return fmt.Errorf("could not close old version: %v: %v", string(output), err)
			}
		} else {
			// We ignore errors here as the old process might already have finished etc.
			_ = browserState.Cmd.Process.Signal(syscall.SIGTERM)
		}
	}

	return nil
}
