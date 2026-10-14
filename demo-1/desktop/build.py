"""Build and smoke-test a self-contained desktop package on its target OS."""
import argparse
import hashlib
import importlib.metadata
import json
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NAME = 'Evergreen Meeting Demo'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--audio-test', action='store_true')
    args = parser.parse_args()
    if sys.platform == 'win32':
        target = 'Windows'
    elif sys.platform == 'darwin' and platform.machine() == 'arm64':
        target = 'Mac-Apple-Silicon'
    else:
        raise SystemExit('Build on Windows x64 or an Apple silicon Mac.')
    build = ROOT / 'desktop-build'
    site = build / 'site'
    site.mkdir(parents=True, exist_ok=True)
    # Explicit public-file allowlist: never bundle environments, caches or recordings.
    files = [ROOT / name for name in ['index.html', 'styles.css', 'app.js', 'assets/evergreen-rendering.png']]
    for pattern in ['*.html', '*.css', '*.js', 'data/*.js', 'data/*.txt', 'data/synthetic-introduction.wav']:
        files.extend((ROOT / 'demo-1').glob(pattern))
    for source in set(files):
        dest = site / source.relative_to(ROOT)
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, dest)
    notices = build / 'third-party-licenses'
    notices.mkdir(exist_ok=True)
    for dist in importlib.metadata.distributions():
        for entry in dist.files or []:
            if '.dist-info' in str(entry) and any(token in str(entry).lower() for token in ['license', 'copying', 'notice']):
                source = Path(dist.locate_file(entry))
                if source.is_file():
                    dest = notices / str(entry)
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(source, dest)
    command = [sys.executable, '-m', 'PyInstaller', '--noconfirm', '--clean', '--onedir', '--windowed',
               '--name', NAME, '--distpath', str(build / 'dist'), '--workpath', str(build / 'work'),
               '--specpath', str(build), '--paths', str(ROOT / 'demo-1/local-audio'),
               '--add-data', str(site) + ':site', '--add-data', str(notices) + ':third-party-licenses',
               '--recursive-copy-metadata', 'faster-whisper', '--recursive-copy-metadata', 'sherpa-onnx']
    command += ['--collect-data', 'certifi']
    for package in ['faster_whisper', 'sherpa_onnx', 'ctranslate2', 'av', 'onnxruntime', 'tokenizers']:
        command += ['--collect-all', package]
    # ML packages expose optional integrations; do not ship unrelated frameworks.
    for package in ['torch', 'tensorflow', 'pandas', 'matplotlib', 'scipy', 'IPython', 'pytest']:
        command += ['--exclude-module', package]
    if sys.platform == 'darwin':
        command += ['--osx-bundle-identifier', 'edu.capstone.team2.meetingdemo', '--target-architecture', 'arm64']
    command.append(str(ROOT / 'demo-1/local-audio/desktop.py'))
    subprocess.run(command, check=True)
    if sys.platform == 'win32':
        application = build / 'dist' / NAME
        executable = application / (NAME + '.exe')
    else:
        application = build / 'dist' / (NAME + '.app')
        executable = application / 'Contents/MacOS' / NAME
    report = build / ('smoke-' + target + '.json')
    check = [str(executable), '--self-test', str(report)]
    if args.audio_test:
        check.append('--audio-test')
    env = dict(os.environ, EVERGREEN_DEMO_DATA_DIR=str(build / 'smoke-data'))
    try:
        subprocess.run(check, check=True, env=env, timeout=720,
                       creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0)
    except Exception:
        log = build / 'smoke-data/launcher.log'
        if log.exists():
            print(log.read_text(encoding='utf-8'), flush=True)
        raise
    result = json.loads(report.read_text(encoding='utf-8'))
    assert result['success'] and result['frozen'], result
    if args.audio_test:
        assert result['transcription_and_diarization'], result
        assert result['bundled_certificates_https'], result
    release = build / 'release'
    release.mkdir(exist_ok=True)
    stem = 'Evergreen-Meeting-Demo-' + target
    archive = release / (stem + '.zip')
    if sys.platform == 'darwin':
        subprocess.run(['ditto', '-c', '-k', '--sequesterRsrc', '--keepParent', str(application), str(archive)], check=True)
    else:
        shutil.copy2(ROOT / 'demo-1/desktop/START-HERE.txt', application / 'START-HERE.txt')
        shutil.make_archive(str(release / stem), 'zip', root_dir=application.parent, base_dir=application.name)
    with archive.open('rb') as stream:
        checksum = hashlib.file_digest(stream, 'sha256').hexdigest()
    (release / (stem + '.sha256')).write_text(checksum + '  ' + archive.name + '\n', encoding='utf-8')
    shutil.copy2(report, release / report.name)
    print(json.dumps({'archive': str(archive), 'bytes': archive.stat().st_size, 'sha256': checksum, 'smoke': result}), flush=True)


if __name__ == '__main__':
    main()
