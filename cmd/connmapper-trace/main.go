package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"strings"

	"github.com/google/gopacket"
	"github.com/google/gopacket/layers"
	"github.com/google/gopacket/pcap"
)

var (
	ErrCouldNotCapturePermissionDenied = errors.New("could not start capturing, capture permission denied")
)

type Packet struct {
	Data          []byte                 `json:"data"`
	LinkType      layers.LinkType        `json:"linkType"`
	DecodeOptions gopacket.DecodeOptions `json:"decodeOptions"`
}

func main() {
	pcapName := flag.String("pcap-name", "wlp0s20f3", "Name of the device to trace")
	mtu := flag.Int("mtu", 1500, "MTU of the device to trace")

	flag.Parse()

	handle, err := pcap.OpenLive(*pcapName, int32(*mtu), true, pcap.BlockForever)
	if err != nil {
		// GoPacket doesn't export the permission error, so we need to compare error strings
		if strings.HasSuffix(err.Error(), "(socket: Operation not permitted)") {
			fmt.Println(errors.Join(ErrCouldNotCapturePermissionDenied, err))

			os.Exit(1)
		} else {
			panic(err)
		}
	}
	defer handle.Close()

	source := gopacket.NewPacketSource(handle, handle.LinkType())

	encoder := json.NewEncoder(os.Stdout)
	for packet := range source.Packets() {
		rawPacket := &Packet{
			Data:          packet.Data(),
			LinkType:      handle.LinkType(),
			DecodeOptions: source.DecodeOptions,
		}

		if err := encoder.Encode(rawPacket); err != nil {
			panic(err)
		}
	}
}
