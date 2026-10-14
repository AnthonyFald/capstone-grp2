"""Model downloads must work without a developer's Python certificate install."""
import ssl

import certifi


def download_context():
    # An explicit CA file works inside PyInstaller on clean Mac/Windows installs.
    # Keep both certificate verification and hostname checks enabled.
    return ssl.create_default_context(cafile=certifi.where())
