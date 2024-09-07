package utils

import (
	"github.com/gopacket/gopacket"
	"github.com/gopacket/gopacket/layers"
)

const (
	TraceCommandHandshakeHandleAcquired         = "AQ"
	TraceCommandHandshakeHandlePermissionDenied = "PD"
	TraceCommandHandshakeHandleUnexpectedError  = "UE"
)

type Packet struct {
	Data          []byte                 `json:"data"`
	LinkType      layers.LinkType        `json:"linkType"`
	DecodeOptions gopacket.DecodeOptions `json:"decodeOptions"`
}
