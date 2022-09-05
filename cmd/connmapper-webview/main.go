package main

import (
	"flag"

	"github.com/webview/webview"
)

func main() {
	debug := flag.Bool("verbose", false, "Enable verbose logging")

	flag.Parse()

	w := webview.New(*debug)
	defer w.Destroy()

	w.SetTitle("Connmapper")
	w.SetSize(1024, 768, webview.HintNone)
	w.Navigate("https://vasturiano.github.io/react-globe.gl/example/world-population/")

	w.Run()
}
