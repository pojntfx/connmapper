package utils

import "errors"

var (
	ErrMknodUnimplemented = errors.New("mknod is unimplemented on this platform")
)
