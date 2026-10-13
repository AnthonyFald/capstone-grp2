"""Read-only application resources and writable per-user audio storage."""
import os
import sys
from pathlib import Path


def resource_root():
    if getattr(sys, 'frozen', False):
        # macOS bundles link data from Frameworks into Resources. Compare real paths.
        return (Path(sys._MEIPASS) / 'site').resolve()
    return Path(__file__).resolve().parents[2]


def data_root():
    # Explicit override is used by isolated packaging tests, never set by a web request.
    if os.environ.get('EVERGREEN_DEMO_DATA_DIR'):
        return Path(os.environ['EVERGREEN_DEMO_DATA_DIR']).resolve()
    if not getattr(sys, 'frozen', False):
        return Path(__file__).resolve().parent
    if sys.platform == 'win32':
        local_app_data = os.environ.get('LOCALAPPDATA')
        base = Path(local_app_data) if local_app_data else Path.home() / 'AppData/Local'
        return base / 'Evergreen Meeting Demo'
    if sys.platform == 'darwin':
        return Path.home() / 'Library/Application Support/Evergreen Meeting Demo'
    return Path.home() / '.local/share/evergreen-meeting-demo'
