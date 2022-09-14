package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log"
	"net/http"
	"reflect"
	"time"

	"github.com/gorilla/websocket"
)

type exampleStruct struct {
	Name string `json:"name"`
}

var (
	upgrader = websocket.Upgrader{}

	// TODO: Validate that functions have either one or two return values before adding them to this map
	functions = map[string]any{
		"examplePrintString": func(msg string) {
			fmt.Println(msg)
		},
		"examplePrintStruct": func(input exampleStruct) {
			fmt.Println(input)
		},
		"exampleReturnError": func() error {
			return errors.New("test error")
		},
		"exampleReturnString": func() string {
			return "Test string"
		},
		"exampleReturnStruct": func() exampleStruct {
			return exampleStruct{
				Name: "Alice",
			}
		},
		"exampleReturnStringAndError": func() (string, error) {
			return "Test string", errors.New("test error")
		},
		"exampleReturnStringAndNil": func() (string, error) {
			return "Test string", nil
		},
	}

	errorType = reflect.TypeOf((*error)(nil)).Elem()
)

func main() {
	laddr := flag.String("laddr", "localhost:1337", "Address for the IPC WebSocket server to listen on")
	heartbeat := flag.Duration("heartbeat", time.Second*10, "Heartbeat interval to keep WebSocket connections alive")

	flag.Parse()

	log.Printf("Listening on %v", *laddr)

	clients := 0

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
			conn, err := upgrader.Upgrade(w, r, nil)
			if err != nil {
				panic(err)
			}

			if err := conn.SetReadDeadline(time.Now().Add(*heartbeat)); err != nil {
				panic(err)
			}

			conn.SetPongHandler(func(string) error {
				log.Println("Received pong from client")

				return conn.SetReadDeadline(time.Now().Add(*heartbeat))
			})

			pings := time.NewTicker(*heartbeat / 2)
			defer pings.Stop()

			errs := make(chan error)
			go func() {
				defer conn.Close()

				for {
					var functionRequest []json.RawMessage
					if err := conn.ReadJSON(&functionRequest); err != nil {
						errs <- err

						return
					}

					if len(functionRequest) != 3 {
						errs <- fmt.Errorf("%v", http.StatusUnprocessableEntity)

						return
					}

					var requestID string
					if err := json.Unmarshal(functionRequest[0], &requestID); err != nil {
						errs <- fmt.Errorf("%v", http.StatusUnprocessableEntity)

						return
					}

					var functionName string
					if err := json.Unmarshal(functionRequest[1], &functionName); err != nil {
						errs <- fmt.Errorf("%v", http.StatusUnprocessableEntity)

						return
					}

					var functionArgs []json.RawMessage
					if err := json.Unmarshal(functionRequest[2], &functionArgs); err != nil {
						errs <- fmt.Errorf("%v", http.StatusUnprocessableEntity)

						return
					}

					log.Printf("Got request ID %v for function %v with args %v", requestID, functionName, functionArgs)

					rawFunctions, ok := functions[functionName]
					if !ok {
						errs <- fmt.Errorf("%v", http.StatusNotFound)

						return
					}

					function := reflect.ValueOf(rawFunctions)

					if len(functionArgs) != function.Type().NumIn() {
						errs <- fmt.Errorf("%v", http.StatusUnprocessableEntity)

						return
					}

					args := []reflect.Value{}
					for i := range functionArgs {
						arg := reflect.New(function.Type().In(i))
						if err := json.Unmarshal(functionArgs[i], arg.Interface()); err != nil {
							errs <- err

							return
						}

						args = append(args, arg.Elem())
					}

					res := function.Call(args)
					switch len(res) {
					case 0:
						if err := conn.WriteJSON([]any{requestID, nil, ""}); err != nil {
							errs <- err

							return
						}
					case 1:
						if res[0].Type().Implements(errorType) {
							if err := conn.WriteJSON([]any{requestID, nil, res[0].Interface().(error).Error()}); err != nil {
								errs <- err

								return
							}
						} else {
							v, err := json.Marshal(res[0].Interface())
							if err != nil {
								errs <- err

								return
							}

							if err := conn.WriteJSON([]any{requestID, json.RawMessage(string(v)), ""}); err != nil {
								errs <- err

								return
							}
						}
					case 2:
						v, err := json.Marshal(res[0].Interface())
						if err != nil {
							errs <- err

							return
						}

						if res[1].Interface() == nil {
							if err := conn.WriteJSON([]any{requestID, json.RawMessage(string(v)), ""}); err != nil {
								errs <- err

								return
							}
						} else {
							if err := conn.WriteJSON([]any{requestID, json.RawMessage(string(v)), res[1].Interface().(error).Error()}); err != nil {
								errs <- err

								return
							}
						}
					}
				}
			}()

			for {
				select {
				case err := <-errs:
					panic(err)
				case <-pings.C:
					log.Println("Sending ping to client")

					if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
						panic(err)
					}

					if err := conn.SetWriteDeadline(time.Now().Add(*heartbeat)); err != nil {
						panic(err)
					}
				}
			}
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	}))
}
