package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/pojntfx/connmapper/pkg/ipc"
)

type exampleStruct struct {
	Name string `json:"name"`
}

func main() {
	laddr := flag.String("laddr", "localhost:1337", "Address for the IPC WebSocket server to listen on")
	heartbeat := flag.Duration("heartbeat", time.Second*10, "Heartbeat interval to keep WebSocket connections alive")

	flag.Parse()

	log.Printf("Listening on %v", *laddr)

	clients := 0

	handler := ipc.NewHandler(*heartbeat, &ipc.Callbacks{
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

	if err := handler.Bind("examplePrintString", func(msg string) {
		fmt.Println(msg)
	},
	); err != nil {
		panic(err)
	}

	if err := handler.Bind("examplePrintStruct", func(
		input exampleStruct,
	) {
		fmt.Println(input)
	},
	); err != nil {
		panic(err)
	}

	if err := handler.Bind("exampleReturnError", func() error {
		return errors.New("test error")
	},
	); err != nil {
		panic(err)
	}

	if err := handler.Bind("exampleReturnString", func() string {
		return "Test string"
	},
	); err != nil {
		panic(err)
	}

	if err := handler.Bind("exampleReturnStruct", func() exampleStruct {
		return exampleStruct{
			Name: "Alice",
		}
	},
	); err != nil {
		panic(err)
	}

	if err := handler.Bind("exampleReturnStringAndError", func() (string, error) {
		return "Test string", errors.New("test error")
	},
	); err != nil {
		panic(err)
	}

	if err := handler.Bind("exampleReturnStringAndNil", func() (string, error) {
		return "Test string", nil
	},
	); err != nil {
		panic(err)
	}

	log.Fatal(
		http.ListenAndServe(*laddr, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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
				if err := handler.HandlerFunc(w, r); err != nil {
					panic(err)
				}
			default:
				w.WriteHeader(http.StatusMethodNotAllowed)
			}
		})),
	)
}
