//go:build flatpak
// +build flatpak

package utils

import (
	"context"
	"net"
)

func ListDevices(ctx context.Context) ([]Device, error) {
	netIfaces, err := net.Interfaces()
	if err != nil {
		return []Device{}, err
	}

	devices := []Device{}
	for _, candidate := range netIfaces {
		rawNetAddresses, err := candidate.Addrs()
		if err != nil {
			return []Device{}, err
		}

		if len(rawNetAddresses) <= 0 {
			continue
		}

		devices = append(devices, Device{
			PcapName: candidate.Name, // No difference here between `PcapName` and `NetName` since we use `AF_PACKET` to read packets, not libpcap
			NetName:  candidate.Name,
			MTU:      candidate.MTU,
		})
	}

	return devices, nil
}
