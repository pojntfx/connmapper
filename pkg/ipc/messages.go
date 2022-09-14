package ipc

import "encoding/json"

type FunctionRequest struct {
	RequestID string            `json:"requestID"`
	Name      string            `json:"name"`
	Args      []json.RawMessage `json:"args"`
}

type FunctionResponse struct {
	RequestID string          `json:"requestID"`
	Value     json.RawMessage `json:"value"`
	Error     string          `json:"error"`
}
