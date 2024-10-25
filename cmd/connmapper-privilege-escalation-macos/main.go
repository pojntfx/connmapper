package main

import (
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"

	"golang.org/x/sys/unix"
)

func main() {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	fifoTmpDir, err := os.MkdirTemp(os.TempDir(), "")
	if err != nil {
		panic(err)
	}
	defer os.RemoveAll(fifoTmpDir)

	stdoutPath := filepath.Join(fifoTmpDir, "stdout.fifo")
	if err := unix.Mknod(stdoutPath, unix.S_IFIFO|0666, 0); err != nil {
		panic(err)
	}

	stdout, err := os.OpenFile(stdoutPath, os.O_RDWR, os.ModePerm)
	if err != nil {
		panic(err)
	}
	defer stdout.Close()

	stderrPath := filepath.Join(fifoTmpDir, "stderr.fifo")
	if err := unix.Mknod(stderrPath, unix.S_IFIFO|0666, 0); err != nil {
		panic(err)
	}

	stderr, err := os.OpenFile(stderrPath, os.O_RDWR, os.ModePerm)
	if err != nil {
		panic(err)
	}
	defer stderr.Close()

	command := fmt.Sprintf(`tail -f /var/log/system.log 1> '%v' 2> '%v'`, stdoutPath, stderrPath)
	title := "Authentication Required"
	body := "Authentication is needed to capture packets."

	cmd := exec.CommandContext(
		ctx,
		"osascript",
		"-e",
		fmt.Sprintf(`do shell script "%v" with administrator privileges with prompt "%v: %v"`, command, title, body),
	)

	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		panic(err)
	}

	go func() {
		if cmd.Stdout != nil {
			if _, err := io.Copy(cmd.Stdout, stdout); err != nil {
				panic(err)
			}
		}
	}()

	go func() {
		if cmd.Stderr != nil {
			if _, err := io.Copy(cmd.Stderr, stderr); err != nil {
				panic(err)
			}
		}
	}()

	if err := cmd.Wait(); err != nil {
		panic(err)
	}
}
