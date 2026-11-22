#!/usr/bin/env python3
"""Ajoute facultativement les transits ISS au bulletin, simulation par défaut."""
from pathlib import Path
import argparse
import sys

ANCHOR = b'const payload=makeMessage(events,now,weather);'
REPLACEMENT = b"""let payload=makeMessage(events,now,weather);
// Extension optionnelle ISS : ne change ni les deux embeds existants ni l'envoi.
try {
  const {addTransitsToBulletin}=await import('./discord-transits-addon.mjs');
  payload=await addTransitsToBulletin(payload,now);
} catch (error) {
  console.warn('Extension ISS ignoree : '+error.message);
}"""
MARKER = b"await import('./discord-transits-addon.mjs')"

def transform(data):
    if MARKER in data:
        return data, 'deja installe'
    if data.count(ANCHOR) != 1:
        raise ValueError('Ancrage introuvable ou multiple : aucune modification.')
    return data.replace(ANCHOR, REPLACEMENT, 1), 'modification possible'

def main():
    parser = argparse.ArgumentParser(description='Activation prudente ISS Discord')
    parser.add_argument('source', type=Path)
    parser.add_argument('--apply', action='store_true', help='appliquer le patch avec sauvegarde locale')
    args = parser.parse_args()
    if not args.source.is_file():
        parser.error(f'Fichier absent : {args.source}')
    before = args.source.read_bytes()
    try:
        after, status = transform(before)
    except ValueError as error:
        print('ECHEC :', error, file=sys.stderr)
        return 2
    print('Etat :', status)
    if before == after:
        print('Aucune modification.')
        return 0
    if not args.apply:
        print('SIMULATION UNIQUEMENT : le fichier est intact.')
        return 0
    backup = args.source.with_name(args.source.name + '.avant-transits-v153.bak')
    if backup.exists():
        print(f'ECHEC : sauvegarde existante ({backup}). Aucune modification.', file=sys.stderr)
        return 2
    backup.write_bytes(before)
    try:
        args.source.write_bytes(after)
    except OSError:
        args.source.write_bytes(before)
        raise
    print('Fichier modifie ; sauvegarde locale :', backup)
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
