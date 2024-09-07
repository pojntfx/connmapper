//go:build !flatpak
// +build !flatpak

package utils

import (
	"context"
	"net"
	"slices"

	"github.com/gopacket/gopacket/pcap"
)

func ListDevices(ctx context.Context) ([]Device, error) {
	pcapDevices, err := pcap.FindAllDevs()
	if err != nil {
		return []Device{}, err
	}

	netIfaces, err := net.Interfaces()
	if err != nil {
		return []Device{}, err
	}

	devices := []Device{}
	for _, pcapDevice := range pcapDevices {
		pcapAddresses := []string{}
		for _, cidr := range pcapDevice.Addresses {
			pcapAddresses = append(pcapAddresses, cidr.IP.String())
		}

		var netIface *net.Interface
		for _, candidate := range netIfaces {
			rawNetAddresses, err := candidate.Addrs()
			if err != nil {
				return []Device{}, err
			}

			netAddresses := []string{}
			for _, rawCandidateAddress := range rawNetAddresses {
				ip, _, err := net.ParseCIDR(rawCandidateAddress.String())
				if err != nil {
					return []Device{}, err
				}

				netAddresses = append(netAddresses, ip.String())
			}

			if slices.EqualFunc(netAddresses, pcapAddresses, func(a string, b string) bool {
				return a == b
			}) {
				netIface = &candidate

				break
			}
		}

		if netIface != nil {
			devices = append(devices, Device{
				PcapName: pcapDevice.Name,
				NetName:  netIface.Name,
				MTU:      netIface.MTU,
			})
		}
	}

	return devices, nil
}
