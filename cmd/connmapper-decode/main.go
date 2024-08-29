package main

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/google/gopacket"
	"github.com/google/gopacket/layers"
)

type Packet struct {
	Data          []byte                 `json:"data"`
	LinkType      layers.LinkType        `json:"linkType"`
	DecodeOptions gopacket.DecodeOptions `json:"decodeOptions"`
}

func main() {
	decoder := json.NewDecoder(os.Stdin)

	for {
		var rawPacket Packet
		if err := decoder.Decode(&rawPacket); err != nil {
			panic(err)
		}

		packet := gopacket.NewPacket(rawPacket.Data, rawPacket.LinkType, rawPacket.DecodeOptions)

		fmt.Println(packet)
	}
}
