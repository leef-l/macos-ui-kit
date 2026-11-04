package main

import (
	"github.com/wailsapp/wails/v3/pkg/application"
)

// openSettings asks the frontend to show the in-app settings pane.
//
// The macOS menu bar's "Preferences…" item (⌘,) lives outside the webview, so it
// cannot touch the UI directly. Routing through the navigate event keeps the
// menu a pure native surface and puts the actual pane switch in one place, the
// same code path the sidebar uses.
func openSettings() {
	sendNavigate("settings")
}

// sendNavigate emits the navigate request on the application bus.
func sendNavigate(section string) {
	if globalApp == nil {
		return
	}
	globalApp.Event.Emit(eventNavigate, section)
}

// buildApplicationMenu returns the native application menu.
//
// Why this exists at all: the window is frameless and the app draws its own
// title bar and controls, but macOS *always* has an application menu bar at the
// top of the screen. That menu is application scope, not window scope — it
// cannot be drawn by the webview, and without one a mac user loses the standard
// shortcuts (⌘Q, ⌘H, ⌘M) and the Help/Window menus they expect.
//
// On Windows and Linux the window declares `DisableMenu: true` and the app's own
// sidebar handles navigation. There is therefore exactly one set of controls per
// platform, never two:
//
//	macOS           native menu bar (top of screen) + self-drawn in-window chrome
//	Windows/Linux   self-drawn chrome only
//
// Installing the menu is harmless on platforms without a system menu bar; the
// roles simply go unused.
func buildApplicationMenu() *application.Menu {
	menu := application.NewMenu()

	// --- App menu -------------------------------------------------------------
	// The first submenu is the application menu on macOS: About, Hide/Hide
	// Others and Quit live here by convention, and its title is the app name.
	appMenu := menu.AddSubmenu("myapp")
	appMenu.AddRole(application.About)
	appMenu.AddSeparator()
	appMenu.AddRole(application.Hide)
	appMenu.AddRole(application.HideOthers)
	appMenu.AddRole(application.ShowAll)
	appMenu.AddSeparator()
	appMenu.AddRole(application.Quit) // ⌘Q

	// --- File -----------------------------------------------------------------
	fileMenu := menu.AddSubmenu("文件")
	fileMenu.AddRole(application.CloseWindow) // ⌘W
	fileMenu.AddSeparator()
	// Preferences belongs in the app menu on macOS and carries ⌘, by system
	// convention. It routes to the in-window settings pane.
	preferences := fileMenu.Add("偏好设置…")
	preferences.SetAccelerator("CmdOrCtrl+,")
	preferences.OnClick(func(*application.Context) {
		openSettings()
	})

	// --- Edit -----------------------------------------------------------------
	// These matter beyond the menu itself: without the editing roles, ⌘C/⌘V do
	// not work inside the webview on macOS.
	editMenu := menu.AddSubmenu("编辑")
	editMenu.AddRole(application.Undo)
	editMenu.AddRole(application.Redo)
	editMenu.AddSeparator()
	editMenu.AddRole(application.Cut)
	editMenu.AddRole(application.Copy)
	editMenu.AddRole(application.Paste)
	editMenu.AddRole(application.SelectAll)

	// --- View -----------------------------------------------------------------
	viewMenu := menu.AddSubmenu("显示")
	viewMenu.AddRole(application.Reload)
	viewMenu.AddSeparator()
	viewMenu.AddRole(application.ResetZoom)
	viewMenu.AddRole(application.ZoomIn)
	viewMenu.AddRole(application.ZoomOut)
	viewMenu.AddSeparator()
	viewMenu.AddRole(application.ToggleFullscreen)

	// --- Window ---------------------------------------------------------------
	windowMenu := menu.AddSubmenu("窗口")
	windowMenu.AddRole(application.Minimise) // ⌘M
	windowMenu.AddRole(application.Zoom)
	windowMenu.AddSeparator()
	windowMenu.AddRole(application.BringAllToFront)

	return menu
}
