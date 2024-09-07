//go:build flatpak
// +build flatpak

package utils

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"

	"github.com/gopacket/gopacket"
	"github.com/gopacket/gopacket/afpacket"
	"github.com/gopacket/gopacket/layers"
)

func TraceDevice(mtu int, device string) error {
	pageSize := os.Getpagesize()

	var frameSize int
	if mtu < pageSize {
		frameSize = pageSize / (pageSize / mtu)
	} else {
		frameSize = (mtu/pageSize + 1) * pageSize
	}
	blockSize := frameSize * 128

	handle, err := afpacket.NewTPacket(
		afpacket.OptInterface(device),
		afpacket.OptFrameSize(frameSize),
		afpacket.OptBlockSize(blockSize),
		afpacket.OptNumBlocks((1024*1024)/blockSize),
		afpacket.SocketDgram,
		afpacket.TPacketVersion3,
	)
	if err != nil {
		if errors.Is(err, os.ErrPermission) {
			fmt.Print(TraceCommandHandshakeHandlePermissionDenied)
		} else {
			fmt.Print(TraceCommandHandshakeHandleUnexpectedError)
		}

		return err
	}
	defer handle.Close()

	fmt.Print(TraceCommandHandshakeHandleAcquired)

	source := gopacket.NewZeroCopyPacketSource(gopacket.ZeroCopyPacketDataSource(handle), layers.LinkTypeRaw)

	encoder := json.NewEncoder(os.Stdout)
	for packet := range source.Packets() {
		rawPacket := &Packet{
			Data:          packet.Data(),
			LinkType:      layers.LinkTypeRaw,
			DecodeOptions: source.DecodeOptions,
		}

		if err := encoder.Encode(rawPacket); err != nil {
			fmt.Print(TraceCommandHandshakeHandleUnexpectedError)

			return err
		}
	}

	return nil
}
