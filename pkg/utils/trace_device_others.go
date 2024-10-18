//go:build !flatpak
// +build !flatpak

package utils

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/gopacket/gopacket"
	"github.com/gopacket/gopacket/pcap"
)

func TraceDevice(mtu int, device string) error {
	handle, err := pcap.OpenLive(device, int32(mtu), true, pcap.BlockForever)
	if err != nil {
		// GoPacket doesn't export the permission error, so we need to compare error strings
		if strings.HasSuffix(err.Error(), "(socket: Operation not permitted)") || // Linux
			strings.HasSuffix(err.Error(), "root privileges may be required)") { // macOS
			fmt.Print(TraceCommandHandshakeHandlePermissionDenied)
		} else {
			fmt.Print(TraceCommandHandshakeHandleUnexpectedError)
		}

		return err
	}
	defer handle.Close()

	fmt.Print(TraceCommandHandshakeHandleAcquired)

	source := gopacket.NewPacketSource(handle, handle.LinkType())

	encoder := json.NewEncoder(os.Stdout)
	for packet := range source.Packets() {
		rawPacket := &Packet{
			Data:          packet.Data(),
			Length:        packet.Metadata().Length,
			LinkType:      handle.LinkType(),
			DecodeOptions: source.DecodeOptions,
		}

		if err := encoder.Encode(rawPacket); err != nil {
			fmt.Print(TraceCommandHandshakeHandleUnexpectedError)

			return err
		}
	}

	return nil
}
