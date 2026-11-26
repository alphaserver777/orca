#!/usr/bin/env python3
"""Explicit apply/rollback after independent review; no service operations."""
import argparse
import json
import os
from pathlib import Path
import shutil
import tarfile
from prepare import check, sha, TASK, cache_index


def atomic_copy(source, target):
    temporary = target.with_name(target.name + '.timeline-tmp')
    if temporary.exists():
        raise ValueError(f'Temporary file exists: {temporary}')
    shutil.copyfile(source, temporary)
    temporary.chmod(0o644)
    os.replace(temporary, target)


def apply(runtime, overlay, backup, profile):
    renderer = check(runtime, allow_previous_overlay=True)
    manifest = json.loads((overlay / 'overlay.json').read_text())
    expected_names = {'web-index.html', TASK}
    if set(manifest['files']) != expected_names:
        raise ValueError('Unexpected overlay file set')
    for name, digest in manifest['files'].items():
        if sha(overlay / name) != digest:
            raise ValueError(f'Overlay checksum mismatch: {name}')
    if not profile.is_dir() or backup.exists():
        raise ValueError('Profile must exist; backup must be a new private directory')
    backup.mkdir(mode=0o700, parents=True)
    shutil.copy2(runtime / 'VERSION', backup / 'VERSION')
    # Native SQLite online backup, so the WAL is included consistently without stopping tasks.
    import sqlite3
    with tarfile.open(backup / 'profile.tar.gz', 'w:gz') as archive:
        def exclude_db(info):
            if info.issym():
                return info  # Preserve the link itself; tarfile does not follow it.
            return None if info.name.endswith(('.db', '.db-wal', '.db-shm', '.sock')) else info
        archive.add(profile, arcname='profile', filter=exclude_db)
    (backup / 'profile.tar.gz').chmod(0o600)
    dbdir = backup / 'databases'
    dbdir.mkdir(mode=0o700)
    for index, db in enumerate(profile.rglob('*.db')):
        if db.is_symlink():
            continue
        out = dbdir / f'{index}.db'
        with sqlite3.connect(f'file:{db}?mode=ro', uri=True) as source, sqlite3.connect(out) as target:
            source.backup(target)
        out.chmod(0o600)
        with (dbdir / 'paths.jsonl').open('a') as paths:
            paths.write(json.dumps([out.name, str(db.relative_to(profile))]) + '\n')
    (backup / 'originals').mkdir()
    original = {}
    for name in manifest['files']:
        # Preserve compressed siblings too, then remove stale precompressed responses.
        for variant in (name, name + '.br', name + '.gz'):
            target = renderer / variant
            original[variant] = sha(target) if target.exists() else None
            if target.exists():
                saved = backup / 'originals' / variant
                saved.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(target, saved)
    restored_index = cache_index((backup / 'originals/web-index.html').read_text(),original[TASK])
    (backup / 'rollback-index.html').write_text(restored_index)
    rollback_files = dict(original)
    rollback_files['web-index.html'] = sha(backup / 'rollback-index.html')
    receipt = {'version': '1.4.274', 'files': manifest['files'], 'original': original,'rollback':rollback_files,
               'server': sha(runtime / 'orcad/orcad-server.js')}
    (backup / 'receipt.json').write_text(json.dumps(receipt, indent=2))
    for name in manifest['files']:
        atomic_copy(overlay / name, renderer / name)
        for suffix in ('.br', '.gz'):
            (renderer / (name + suffix)).unlink(missing_ok=True)
    verify(runtime, backup, installed=True)


def verify_version(runtime, backup):
    if runtime.joinpath('VERSION').read_bytes() != backup.joinpath('VERSION').read_bytes():
        raise ValueError('Runtime version changed; manual review required')
    receipt = json.loads((backup / 'receipt.json').read_text())
    if sha(runtime / 'orcad/orcad-server.js') != receipt['server']:
        raise ValueError('Server changed; manual review required')
    return receipt


def verify(runtime, backup, installed):
    receipt = verify_version(runtime, backup)
    renderer = runtime / 'orcad/out/renderer'
    for name, digest in (receipt['files'] if installed else receipt['rollback']).items():
        path = renderer / name
        if (sha(path) if path.exists() else None) != digest:
            raise ValueError(f'Installed file changed: {name}')


def rollback(runtime, backup):
    receipt = verify_version(runtime, backup)
    renderer = runtime / 'orcad/out/renderer'
    if sha(backup / 'rollback-index.html') != receipt['rollback']['web-index.html']:
        raise ValueError('Rollback cache index changed')
    for name, digest in receipt['original'].items():
        target = renderer / name
        current = sha(target) if target.exists() else None
        # Also recover an interrupted apply; refuse unrelated changes.
        if current not in (digest, receipt['files'].get(name), receipt['rollback'].get(name)):
            raise ValueError(f'Installed file changed: {name}')
        if digest is not None and sha(backup / 'originals' / name) != digest:
            raise ValueError(f'Backup changed: {name}')
    for name, digest in receipt['original'].items():
        if digest is None:
            (renderer / name).unlink(missing_ok=True)
        else:
            atomic_copy(backup / 'originals' / name, renderer / name)
    atomic_copy(backup / 'rollback-index.html',renderer / 'web-index.html')
    verify(runtime, backup, installed=False)


if __name__ == '__main__':
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['apply', 'rollback', 'verify'])
    parser.add_argument('--runtime', type=Path, required=True)
    parser.add_argument('--backup', type=Path, required=True)
    parser.add_argument('--overlay', type=Path)
    parser.add_argument('--profile', type=Path)
    args = parser.parse_args()
    if args.action == 'apply':
        if not args.overlay or not args.profile:
            parser.error('apply requires --overlay and --profile')
        apply(args.runtime.resolve(), args.overlay.resolve(), args.backup.resolve(), args.profile.resolve())
    elif args.action == 'rollback':
        rollback(args.runtime.resolve(), args.backup.resolve())
    else:
        verify(args.runtime.resolve(), args.backup.resolve(), installed=True)
    print(f'{args.action}: verified; no services restarted')
