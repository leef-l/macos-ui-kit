package main

import (
	"fmt"
	"runtime"
	"sync"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

// WindowState reports the window state the frontend needs to render the
// traffic lights: a zoomed window swaps the green light's glyph, an unfocused
// window dims all three lights, and fullscreen is shown in the status card.
type WindowState struct {
	// Maximised is true when the window fills the screen work area.
	Maximised bool `json:"maximised"`
	// Fullscreen is true when the window is in macOS fullscreen.
	Fullscreen bool `json:"fullscreen"`
	// Focused is true when the window is the active window.
	Focused bool `json:"focused"`
	// Platform is GOOS ("windows", "darwin", "linux"), so the frontend can show
	// the platform name and apply platform-specific chrome tweaks.
	Platform string `json:"platform"`
}

// WindowService exposes the macOS-style window chrome (traffic lights drawn in
// the custom title bar) to the frontend.
//
// The native title bar is hidden and the window is frameless, so the three
// buttons rendered by the webview are the only way to close, minimise and zoom
// the window. Every exported method becomes a promise-returning binding.
//
// The service is thin on purpose: it validates what it is given and forwards to
// the native window, keeping one source of truth for window state.
type WindowService struct {
	app        *application.App
	windowName string

	// watchOnce guards wiring the native window event listeners twice: the
	// startup hook and the first State() call can both try.
	watchOnce sync.Once
}

// NewWindowService creates the window service. main creates the window before
// Run, so the service resolves it lazily by name.
func NewWindowService(app *application.App, windowName string) *WindowService {
	return &WindowService{app: app, windowName: windowName}
}

// window resolves the native window this service controls.
func (s *WindowService) window() (*application.WebviewWindow, error) {
	win, ok := s.app.Window.GetByName(s.windowName)
	if !ok {
		return nil, fmt.Errorf("window %q not found", s.windowName)
	}
	webview, ok := win.(*application.WebviewWindow)
	if !ok {
		return nil, fmt.Errorf("window %q is not a webview window", s.windowName)
	}
	return webview, nil
}

// stateOf builds the payload from a resolved window.
func stateOf(win *application.WebviewWindow) WindowState {
	return WindowState{
		Maximised:  win.IsMaximised(),
		Fullscreen: win.IsFullscreen(),
		Focused:    win.IsFocused(),
		Platform:   runtime.GOOS,
	}
}

// State returns the current window state. The frontend calls it on load; the
// service also pushes the same payload through the "window:state" event on
// every native window change.
func (s *WindowService) State() (WindowState, error) {
	win, err := s.window()
	if err != nil {
		return WindowState{}, err
	}
	s.watch()
	return stateOf(win), nil
}

// Minimise sends the window to the dock (the yellow traffic light).
func (s *WindowService) Minimise() error {
	win, err := s.window()
	if err != nil {
		return err
	}
	win.Minimise()
	return nil
}

// ToggleZoom implements the green traffic light: it zooms the window into the
// screen work area and restores it on the next call, which is what macOS does
// rather than a Windows-style maximise toggle.
func (s *WindowService) ToggleZoom() error {
	win, err := s.window()
	if err != nil {
		return err
	}
	if win.IsMaximised() {
		win.UnMaximise()
	} else {
		win.Maximise()
	}
	return nil
}

// ToggleFullscreen enters or leaves fullscreen, which is what the green traffic
// light does while the Option key is held on macOS.
func (s *WindowService) ToggleFullscreen() error {
	win, err := s.window()
	if err != nil {
		return err
	}
	win.ToggleFullscreen()
	return nil
}

// Close closes the window (the red traffic light).
func (s *WindowService) Close() error {
	win, err := s.window()
	if err != nil {
		return err
	}
	win.Close()
	return nil
}

// IsMacOS reports whether the app runs on macOS. The traffic lights sit on the
// left on every platform (the macOS layout this app imitates), so the frontend
// uses this only for platform-specific wording, not for layout.
func (s *WindowService) IsMacOS() bool {
	return runtime.GOOS == "darwin"
}

// Navigate switches the app to a section by id.
//
// It exists so native entry points can drive the UI: the macOS menu bar has no
// other way to reach an in-window pane. The frontend listens for the request and
// performs the switch, keeping navigation state ownership on one side.
func (s *WindowService) Navigate(section string) error {
	if section == "" {
		return fmt.Errorf("window service: empty section")
	}
	s.app.Event.Emit(eventNavigate, section)
	return nil
}

// watch wires the native window event listeners that keep the traffic lights in
// sync with native state changes (zoom by double-clicking the title bar, focus
// loss, fullscreen from the menu bar). OnWindowEvent stores callbacks even
// before the window runs, so this is safe from either startup path.
func (s *WindowService) watch() {
	s.watchOnce.Do(func() {
		win, err := s.window()
		if err != nil {
			return
		}
		notify := func(*application.WindowEvent) {
			if current, err := s.window(); err == nil {
				s.app.Event.Emit(eventWindowState, stateOf(current))
			}
		}
		for _, eventType := range []events.WindowEventType{
			events.Common.WindowMaximise,
			events.Common.WindowUnMaximise,
			events.Common.WindowFullscreen,
			events.Common.WindowUnFullscreen,
			events.Common.WindowMinimise,
			events.Common.WindowRestore,
			events.Common.WindowFocus,
			events.Common.WindowLostFocus,
		} {
			win.OnWindowEvent(eventType, notify)
		}
	})
}
