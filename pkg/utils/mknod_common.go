//go:build !windows

package utils

import "golang.org/x/sys/unix"

func MknodStdout(path string) error {
	return unix.Mknod(path, unix.S_IFIFO|0666, 0)
}
