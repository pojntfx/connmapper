package frontend

import "embed"

var (
	//go:embed dist
	UI embed.FS
)
