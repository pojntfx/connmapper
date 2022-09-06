package main

import (
	"flag"
	"io/fs"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/phayes/freeport"
	"github.com/pojntfx/connmapper/pkg/frontend"
	"github.com/webview/webview"
)

func main() {
	debug := flag.Bool("verbose", false, "Enable verbose logging")
	addr := flag.String("addr", "", "URL to open instead of the embedded webserver")

	flag.Parse()

	var u *url.URL
	if strings.TrimSpace(*addr) != "" {
		var err error
		u, err = url.Parse(*addr)
		if err != nil {
			panic(err)
		}
	} else {
		addr, err := net.ResolveTCPAddr("tcp", "localhost:0")
		if err != nil {
			panic(err)
		}

		port, err := freeport.GetFreePort()
		if err != nil {
			panic(err)
		}
		addr.Port = port

		stop := make(chan os.Signal, 1)
		signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

		root := fs.FS(frontend.UI)
		dist, err := fs.Sub(root, "dist")
		if err != nil {
			panic(err)
		}

		srv := http.Server{
			Addr:    addr.String(),
			Handler: http.FileServer(http.FS(dist)),
		}

		go func() {
			if err := srv.ListenAndServe(); err != nil {
				panic(err)
			}
		}()

		go func() {
			<-stop

			if err := srv.Close(); err != nil {
				panic(err)
			}
		}()

		u, err = url.Parse("http://" + addr.String())
		if err != nil {
			panic(err)
		}
	}

	w := webview.New(*debug)
	defer w.Destroy()

	w.SetTitle("Connmapper")
	w.SetSize(1024, 768, webview.HintNone)
	w.Navigate(u.String())

	w.Run()
}
