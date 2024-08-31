//go:build !android
// +build !android

package main

import (
	"bytes"
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/google/gopacket"
	"github.com/google/gopacket/pcap"
	"github.com/pojntfx/connmapper/pkg/backend"
	"github.com/pojntfx/connmapper/pkg/frontend"
	"github.com/pojntfx/hydrapp/hydrapp/pkg/config"
	_ "github.com/pojntfx/hydrapp/hydrapp/pkg/fixes"
	"github.com/pojntfx/hydrapp/hydrapp/pkg/ui"
)

//go:embed hydrapp.yaml
var configFile []byte

var (
	ErrNotEnoughArguments = errors.New("not enough arguments")
)

func main() {
	if trace := os.Getenv(backend.TraceCommandEnv); trace == "true" {
		flag.Parse()

		if flag.NArg() < 2 {
			panic(ErrNotEnoughArguments)
		}

		mtu, err := strconv.Atoi(flag.Arg(1))
		if err != nil {
			panic(err)
		}

		handle, err := pcap.OpenLive(flag.Arg(0), int32(mtu), true, pcap.BlockForever)
		if err != nil {
			// GoPacket doesn't export the permission error, so we need to compare error strings
			if strings.HasSuffix(err.Error(), "(socket: Operation not permitted)") {
				fmt.Print(backend.TraceCommandHandshakeHandlePermissionDenied)
			} else {
				fmt.Print(backend.TraceCommandHandshakeHandleUnexpectedError)
			}

			panic(err)
		}
		defer handle.Close()

		fmt.Print(backend.TraceCommandHandshakeHandleAcquired)

		source := gopacket.NewPacketSource(handle, handle.LinkType())

		encoder := json.NewEncoder(os.Stdout)
		for packet := range source.Packets() {
			rawPacket := &backend.Packet{
				Data:          packet.Data(),
				LinkType:      handle.LinkType(),
				DecodeOptions: source.DecodeOptions,
			}

			if err := encoder.Encode(rawPacket); err != nil {
				panic(err)
			}
		}

		return
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	cfg, err := config.Parse(bytes.NewBuffer(configFile))
	if err != nil {
		ui.HandleFatalPanic("App", errors.Join(fmt.Errorf("could not parse config file"), err))

		return
	}

	// Apply the self-update
	browserState := &ui.BrowserState{}
	go func() {
		if err := ui.SelfUpdate(
			ctx,

			cfg,
			browserState,
		); err != nil {
			ui.HandleFatalPanic(cfg.App.Name, err)
		}
	}()

	// Start the backend
	backendURL, stopBackend, err := backend.StartServer(ctx, os.Getenv(ui.EnvBackendLaddr), time.Second*10, true, browserState)
	if err != nil {
		ui.HandleFatalPanic(cfg.App.Name, errors.Join(fmt.Errorf("could not start backend"), err))
	}
	defer stopBackend()

	log.Println("Backend URL:", backendURL)

	// Start the frontend
	frontendURL, stopFrontend, err := frontend.StartServer(ctx, os.Getenv(ui.EnvFrontendLaddr), backendURL, true)
	if err != nil {
		ui.HandleFatalPanic(cfg.App.Name, errors.Join(fmt.Errorf("could not start frontend"), err))
	}
	defer stopFrontend()

	log.Println("Frontend URL:", frontendURL)

	for {
		retry, err := ui.LaunchBrowser(
			ctx,

			frontendURL,
			cfg.App.Name,
			cfg.App.ID,

			os.Getenv(ui.EnvBrowser),
			os.Getenv(ui.EnvType),

			ui.ChromiumLikeBrowsers,
			ui.FirefoxLikeBrowsers,
			ui.EpiphanyLikeBrowsers,
			ui.LynxLikeBrowsers,

			browserState,
			ui.ConfigureBrowser,
		)

		if err != nil {
			ui.HandleFatalPanic(cfg.App.Name, err)
		}

		if !retry {
			return
		}
	}
}
