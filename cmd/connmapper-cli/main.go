package main

import (
	"flag"
	"fmt"
	"log"
	"net"
	"os"
	"path/filepath"

	"github.com/google/gopacket"
	"github.com/google/gopacket/layers"
	"github.com/google/gopacket/pcap"
)

func main() {
	home, err := os.UserHomeDir()
	if err != nil {
		panic(err)
	}

	dev := flag.String("dev", "eth0", "Network device to get packets from")
	db := flag.String("db", filepath.Join(home, ".local", "share", "connmapper", "GeoLite2-City.mmdb"), "Path to the GeoLite database to use")

	flag.Parse()

	if _, err := os.Stat(*db); err != nil {
		log.Fatal("Could not find database at path ", *db)
	}

	iface, err := net.InterfaceByName(*dev)
	if err != nil {
		panic(err)
	}

	handle, err := pcap.OpenLive(*dev, int32(iface.MTU), true, pcap.BlockForever)
	if err != nil {
		panic(err)
	}
	defer handle.Close()

	source := gopacket.NewPacketSource(handle, handle.LinkType())
	for packet := range source.Packets() {
		if ipv4 := packet.Layer(layers.LayerTypeIPv4); ipv4 != nil {
			layer, ok := ipv4.(*layers.IPv4)
			if !ok {
				continue
			}

			fmt.Printf("IPv4/%v %vB %v -> %v\n", layer.NextLayerType().String(), layer.Length, layer.SrcIP.String(), layer.DstIP.String())
		} else if ipv6 := packet.Layer(layers.LayerTypeIPv6); ipv6 != nil {
			layer, ok := ipv6.(*layers.IPv6)
			if !ok {
				continue
			}

			fmt.Printf("IPv6/%v %vB %v -> %v\n", layer.NextLayerType().String(), layer.Length, layer.SrcIP.String(), layer.DstIP.String())
		}
	}
}
