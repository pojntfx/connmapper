package main

import (
	_ "embed"

	"flag"
	"io/ioutil"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

var (
	//go:embed prefs.js
	prefsJSContent []byte

	//go:embed userChrome.css
	userChromeCSSContent []byte
)

func main() {
	id := flag.String("id", "com.pojtinger.felicitas.connmapper.browser", "ID of the profile to create")
	url := flag.String("url", "https://www.youtube.com/", "URL to open")

	flag.Parse()

	if err := exec.Command("firefox", "--createprofile", *id).Run(); err != nil {
		panic(err)
	}

	home, err := os.UserHomeDir()
	if err != nil {
		panic(err)
	}

	profilesDir := filepath.Join(home, ".mozilla", "firefox")
	profiles, err := ioutil.ReadDir(profilesDir)
	if err != nil {
		panic(err)
	}

	profileDir := ""
	for _, profile := range profiles {
		if strings.HasSuffix(profile.Name(), *id) {
			profileDir = filepath.Join(profilesDir, profile.Name())

			break
		}
	}

	if err := os.WriteFile(filepath.Join(profileDir, "prefs.js"), prefsJSContent, os.ModePerm); err != nil {
		panic(err)
	}

	chromeDir := filepath.Join(profileDir, "chrome")
	if err := os.MkdirAll(chromeDir, os.ModePerm); err != nil {
		panic(err)
	}

	if err := os.WriteFile(filepath.Join(chromeDir, "userChrome.css"), userChromeCSSContent, os.ModePerm); err != nil {
		panic(err)
	}

	cmd := exec.Command("firefox", append([]string{"-P", *id, "--new-window", "--no-first-run", *url}, flag.Args()...)...)

	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Run(); err != nil {
		panic(err)
	}
}
