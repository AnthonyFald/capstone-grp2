import sys
import types
import unittest
from unittest.mock import MagicMock, patch

import desktop


class DesktopTests(unittest.TestCase):
    def test_startup_does_not_open_a_browser_but_button_does(self):
        window = MagicMock()
        scheduled, buttons = [], {}
        window.after.side_effect = lambda delay, callback: scheduled.append(callback)
        ttk = MagicMock()
        def button(parent, **kwargs):
            buttons[kwargs['text']] = kwargs.get('command')
            return MagicMock()
        ttk.Button.side_effect = button
        tk = types.ModuleType('tkinter')
        tk.Tk = lambda: window
        tk.StringVar = MagicMock()
        tk.ttk, tk.messagebox = ttk, MagicMock()
        service = MagicMock()
        with patch.dict(sys.modules, {'tkinter': tk}), patch.object(desktop, 'start_service', return_value=(service, 'http://127.0.0.1:4176/demo-1/')), patch.object(desktop, 'open_demo') as open_demo:
            desktop.run_window()
            scheduled.pop(0)()  # run the actual startup callback
            open_demo.assert_not_called()
            buttons['Open demo']()
            open_demo.assert_called_once_with('http://127.0.0.1:4176/demo-1/')

    def test_explicit_open_uses_default_browser(self):
        with patch.object(desktop.webbrowser, 'open', return_value=True) as browser, patch.object(desktop.subprocess, 'Popen') as spawn, patch.object(desktop.time, 'time_ns', side_effect=[100, 200, 300]):
            desktop.open_demo('http://127.0.0.1:4176/demo-1/')
            desktop.open_demo('http://127.0.0.1:4176/demo-1/')
            desktop.open_demo('http://127.0.0.1:4176/demo-1/?v=notes-4')
            self.assertEqual([call.args[0] for call in browser.call_args_list], [
                'http://127.0.0.1:4176/demo-1/?launch=100',
                'http://127.0.0.1:4176/demo-1/?launch=200',
                'http://127.0.0.1:4176/demo-1/?v=notes-4&launch=300'])
            spawn.assert_not_called()
