package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/pojntfx/connmapper/pkg/rpc"
	"github.com/pojntfx/connmapper/pkg/rpcdemo"
	"github.com/zserge/lorca"
)

type exampleStruct struct {
	Name string `json:"name"`
}

func main() {
	baddr := flag.String("baddr", "", "Backend address to listen on")
	faddr := flag.String("faddr", "", "Frontend URL to open instead of the embedded webserver")
	heartbeat := flag.Duration("heartbeat", time.Second*10, "Heartbeat interval to keep WebSocket connections alive")

	flag.Parse()

	stopBackend := make(chan os.Signal, 1)
	signal.Notify(stopBackend, os.Interrupt, syscall.SIGTERM)

	clients := 0

	registry := rpc.NewRegistry(*heartbeat, &rpc.Callbacks{
		OnReceivePong: func() {
			log.Println("Received pong from client")
		},
		OnSendingPing: func() {
			log.Println("Sending ping to client")
		},
		OnFunctionCall: func(requestID, functionName string, functionArgs []json.RawMessage) {
			log.Printf("Got request ID %v for function %v with args %v", requestID, functionName, functionArgs)
		},
	})

	if err := registry.Bind("examplePrintString", func(msg string) {
		fmt.Println(msg)
	}); err != nil {
		panic(err)
	}

	if err := registry.Bind("examplePrintStruct", func(
		input exampleStruct,
	) {
		fmt.Println(input)
	}); err != nil {
		panic(err)
	}

	if err := registry.Bind("exampleReturnError", func() error {
		return errors.New("test error")
	}); err != nil {
		panic(err)
	}

	if err := registry.Bind("exampleReturnString", func() string {
		return "Test string"
	}); err != nil {
		panic(err)
	}

	if err := registry.Bind("exampleReturnStruct", func() exampleStruct {
		return exampleStruct{
			Name: "Alice",
		}
	}); err != nil {
		panic(err)
	}

	if err := registry.Bind("exampleReturnStringAndError", func() (string, error) {
		return "Test string", errors.New("test error")
	}); err != nil {
		panic(err)
	}

	if err := registry.Bind("exampleReturnStringAndNil", func() (string, error) {
		return "Test string", nil
	}); err != nil {
		panic(err)
	}

	var notificationChan chan string
	if err := registry.Bind("exampleNotification", func() (string, error) {
		if notificationChan == nil {
			notificationChan = make(chan string)

			ticker := time.NewTicker(time.Second * 2)
			i := 0
			go func() {
				for {
					<-ticker.C

					if i >= 3 {
						notificationChan <- ""

						ticker.Stop()

						notificationChan = nil

						return
					}

					notificationChan <- "Go server time: " + time.Now().Format(time.RFC3339)

					i++
				}
			}()
		}

		return <-notificationChan, nil
	}); err != nil {
		panic(err)
	}

	var backendListener net.Listener
	if strings.TrimSpace(*baddr) != "" {
		var err error
		backendListener, err = net.Listen("tcp", *baddr)
		if err != nil {
			panic(err)
		}
	} else {
		var err error
		backendListener, err = net.Listen("tcp", ":0")
		if err != nil {
			panic(err)
		}
	}

	go func() {
		if err := http.Serve(backendListener, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			clients++

			log.Printf("%v clients connected", clients)

			defer func() {
				clients--

				if err := recover(); err != nil {
					w.WriteHeader(http.StatusInternalServerError)

					log.Printf("Client disconnected with error: %v", err)
				}

				log.Printf("%v clients connected", clients)
			}()

			switch r.Method {
			case http.MethodGet:
				if err := registry.HandlerFunc(w, r); err != nil {
					panic(err)
				}
			default:
				w.WriteHeader(http.StatusMethodNotAllowed)
			}
		})); err != nil {
			panic(err)
		}
	}()

	go func() {
		<-stopBackend

		if err := backendListener.Close(); err != nil {
			panic(err)
		}
	}()

	backendURL, err := url.Parse("ws://" + backendListener.Addr().String())
	if err != nil {
		panic(err)
	}

	var frontendURL *url.URL
	if strings.TrimSpace(*faddr) != "" {
		var err error
		frontendURL, err = url.Parse(*faddr)
		if err != nil {
			panic(err)
		}
	} else {
		stopFrontend := make(chan os.Signal, 1)
		signal.Notify(stopFrontend, os.Interrupt, syscall.SIGTERM)

		frontendListener, err := net.Listen("tcp", ":0")
		if err != nil {
			panic(err)
		}

		root := fs.FS(rpcdemo.UI)
		dist, err := fs.Sub(root, "dist")
		if err != nil {
			panic(err)
		}

		go func() {
			if err := http.Serve(frontendListener, http.FileServer(http.FS(dist))); err != nil {
				panic(err)
			}
		}()

		go func() {
			<-stopFrontend

			if err := frontendListener.Close(); err != nil {
				panic(err)
			}
		}()

		frontendURL, err = url.Parse("http://" + frontendListener.Addr().String())
		if err != nil {
			panic(err)
		}
	}

	values := frontendURL.Query()

	values.Set("socketURL", backendURL.String())

	frontendURL.RawQuery = values.Encode()

	log.Println("Backend URL:", backendURL.String())
	log.Println("Frontend URL:", frontendURL.String())

	ui, err := lorca.New(frontendURL.String(), "", 1024, 768, flag.Args()...)
	if err != nil {
		panic(err)
	}
	defer ui.Close()

	<-ui.Done()
}
