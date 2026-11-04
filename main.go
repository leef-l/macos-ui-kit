package main

import (
	"embed"
	"log"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// Wails embeds the built frontend into the binary, so the shipped app has no
// external asset directory.
//
//go:embed all:frontend/dist
var assets embed.FS

// globalApp is the running application, published for the native menu callbacks.
// Those callbacks are plain functions invoked by the platform menu, not methods
// on a registered service, so they need a package-level route back to the event
// bus. It is assigned once in main before Run and never written again.
var globalApp *application.App

const (
	// mainWindowName identifies the app window. WindowService resolves the
	// window by this name, so keep the two in step.
	mainWindowName = "main"

	// eventWindowState carries window state to the frontend so the macOS-style
	// traffic lights follow native changes (zoom by double-clicking the title
	// bar, focus loss, fullscreen from the menu bar).
	eventWindowState = "window:state"

	// eventTime carries the current time, pushed once a second by the backend.
	eventTime = "time"

	// eventNavigate asks the frontend to switch to a section. Native entry
	// points (the macOS application menu) have no other route into the webview.
	eventNavigate = "app:navigate"
)

func init() {
	// Register the events with their payload types so the generator emits
	// typed payloads and Emit type-checks the value it is given.
	application.RegisterEvent[WindowState](eventWindowState)
	application.RegisterEvent[string](eventTime)
	application.RegisterEvent[string](eventNavigate)
}

// main creates the application and its single window, then runs the event loop.
//
// The window is frameless with a hidden title bar, so the app draws its own
// macOS-style title bar and the traffic lights in the webview are the window's
// only close, minimise and zoom controls.
func main() {
	app := application.New(application.Options{
		Name:        "myapp",
		Description: "A macOS-style desktop app built with Go and Wails",
		Services: []application.Service{
			application.NewService(&GreetService{}),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			// A window app: closing the last window quits, like any macOS app.
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
		Windows: application.WindowsOptions{
			// Closing the last window quits, matching the macOS behaviour.
			DisableQuitOnLastWindowClosed: false,
		},
	})

	// The window service needs the App to reach the native window, and the App
	// is built with its services, so register it once the App exists. Services
	// must be registered before Run: one registered after Run starts is dropped.
	app.RegisterService(application.NewService(NewWindowService(app, mainWindowName)))

	// Publish the app for the native menu callbacks, which are plain functions
	// rather than methods on a service and so need a way back to the bus.
	globalApp = app

	// Install the macOS application menu bar.
	//
	// This is the one piece of chrome the app does NOT draw: on macOS the menu
	// bar belongs to the screen, not the window, so it cannot be rendered in the
	// webview. Without it the app loses ⌘Q, ⌘M, ⌘H and the standard editing
	// shortcuts. Windows and Linux disable the native menu and use the sidebar,
	// so no platform ever shows two navigation surfaces.
	app.Menu.Set(buildApplicationMenu())

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:  mainWindowName,
		Title: "myapp",

		// Golden-ratio-ish window this UI is laid out for.
		Width:     1100,
		Height:    680,
		MinWidth:  780,
		MinHeight: 480,

		// The whole frame is web content: no native title bar, no native border.
		// The app paints the title bar and the traffic lights.
		Frameless: true,

		InitialPosition: application.WindowCentered,

		// Matches the app background so the first paint does not flash white.
		BackgroundColour: application.NewRGB(28, 28, 30),

		Mac: application.MacWindow{
			// Content reaches the top of the window, so the custom title bar
			// sits where a macOS title bar would.
			TitleBar: application.MacTitleBarHiddenInset,
			// Frosted backdrop and the system appearance, so the app looks
			// native in both light and dark mode.
			Backdrop:                application.MacBackdropTranslucent,
			Appearance:              application.DefaultAppearance,
			InvisibleTitleBarHeight: 38,
		},

		Windows: application.WindowsWindow{
			// Follow the system light/dark setting, like the CSS palette does.
			Theme: application.SystemDefault,
			// Keep the Aero shadow and the Windows 11 rounded corners while the
			// window itself is frameless.
			DisableFramelessWindowDecorations: false,
			// No native menu bar: the app draws its own chrome.
			DisableMenu: true,
		},

		Linux: application.LinuxWindow{
			WindowIsTranslucent: true,
		},
	})

	// Push the current time once a second: it proves the Go backend is live and
	// drives the clock in the status bar and the overview card.
	go func() {
		for {
			app.Event.Emit(eventTime, time.Now().Format(time.RFC1123))
			time.Sleep(time.Second)
		}
	}()

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
