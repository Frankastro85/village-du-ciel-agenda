#!/usr/bin/env python3
"""Extension Discord ISS : simulation par défaut, réparation contrôlée et sauvegarde.

Compatible avec la version initiale, une installation propre ou une installation
partielle V1.5.3 ayant deux déclarations de la variable payload.

Usage: python3 iss-transits/installer-discord-iss.py scripts/discord-bulletin.mjs
       python3 iss-transits/installer-discord-iss.py scripts/discord-bulletin.mjs --apply
"""
from __future__ import annotations
import argparse
from pathlib import Path
import re
import shutil
import subprocess
import sys

PATTERN = re.compile(r"(?m)^(?P<indent>[ \t]*)(?P<decl>const|let)\s+payload\s*=\s*makeMessage\(events,\s*now,\s*weather\);[ \t]*\r?\n?")
IMPORT = "await import('./discord-transits-addon.mjs')"
CALL = 'payload=await addTransitsToBulletin(payload,now);'
ADDITION = """// Extension optionnelle ISS : ne modifie ni les rubriques existantes ni l'envoi.
try {
  const {addTransitsToBulletin}=await import('./discord-transits-addon.mjs');
  payload=await addTransitsToBulletin(payload,now);
} catch (error) {
  console.warn('Extension ISS ignoree : '+error.message);
}
"""


def transform(source: str):
    matches = list(PATTERN.finditer(source))
    imports = source.count(IMPORT)
    calls = source.count(CALL)
    if imports > 1 or calls > 1:
        raise ValueError('Plusieurs blocs ISS detectes. Arret : corriger manuellement.')
    if imports != calls:
        raise ValueError('Bloc ISS incomplet (import et appel differents). Arret.')

    if imports == 1:
        if len(matches) == 1:
            match = matches[0]
            if match.group('decl') == 'let':
                return source, 'Installation deja correcte.'
            corrected = source[:match.start()] + match.group('indent') + 'let payload=makeMessage(events,now,weather);\n' + source[match.end():]
            return corrected, 'Reparation : const transforme en let (bloc ISS conserve).'
        if len(matches) == 2:
            decls = [m.group('decl') for m in matches]
            if sorted(decls) != ['const', 'let']:
                raise ValueError('Declarations payload ambigues. Arret.')
            old = next(m for m in matches if m.group('decl') == 'const')
            corrected = source[:old.start()] + source[old.end():]
            # Conserver la declaration let et le bloc ISS, retirer seulement l'ancienne const.
            return corrected, 'Reparation : ancienne declaration const payload en double supprimee.'
        raise ValueError('Bloc ISS present, mais declaration payload absente ou multiple. Arret.')

    if len(matches) != 1:
        raise ValueError('Declaration payload introuvable ou multiple. Arret sans modification.')
    match = matches[0]
    replacement = match.group('indent') + 'let payload=makeMessage(events,now,weather);\n' + ADDITION
    return source[:match.start()] + replacement + source[match.end():], 'Installation de l\'extension ISS.'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--apply', action='store_true', help='Appliquer la modification (avec sauvegarde)')
    args = parser.parse_args()
    path = args.source
    if not path.is_file():
        parser.error(f'Fichier absent : {path}')
    raw = path.read_bytes()
    has_bom = raw.startswith(b'\xef\xbb\xbf')
    try:
        txt = raw.decode('utf-8-sig')
        fixed, note = transform(txt)
    except (UnicodeDecodeError, ValueError) as exc:
        print('ECHEC :', exc, file=sys.stderr)
        return 2
    print('Diagnostic :', note)
    if fixed == txt:
        print('Aucune modification necessaire.')
        return 0
    if not args.apply:
        print('SIMULATION : aucune modification. Utiliser --apply pour corriger une copie locale.')
        return 0

    # Jamais de modification silencieuse : sauvegarde avant ecriture.
    backup = path.with_name(path.name + '.avant-iss-v154.bak')
    if backup.exists():
        print('ECHEC : sauvegarde deja presente :', backup, file=sys.stderr)
        return 2
    shutil.copy2(path, backup)
    path.write_bytes((b'\xef\xbb\xbf' if has_bom else b'') + fixed.encode('utf-8'))
    # Si Node est present, verifier le code. Restaurer automatiquement sinon.
    if shutil.which('node'):
        result = subprocess.run(['node', '--check', str(path)], capture_output=True, text=True)
        if result.returncode != 0:
            shutil.copy2(backup, path)
            print('ECHEC : syntaxe invalide, source restauree.\n' + result.stderr, file=sys.stderr)
            return 3
    print('Fichier corrige ; sauvegarde :', backup)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
