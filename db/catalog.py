"""Compile the pinned Catalogue of Life TextTree into a read-only BioSfere search index."""
import argparse
from collections import defaultdict
import csv
import gzip
import hashlib
import io
from pathlib import Path
import sqlite3
import sys
import unicodedata
from zipfile import ZipFile

RELEASE = '2026-10-16-xr'
TREE_SHA = '162bc13ed0e6b992342abd3dd7e1ccf7291b314c93b079e16b7f4b70e1852ff2'
STRUCTURED_SHA = '267b7ed346dd3ff17e3ff58316a81f865a54d706bbf7a04f6437ee20124be6c1'
RANKS = ('kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'species')
RANK_NUMBER = {rank: i for i, rank in enumerate(RANKS)}
HYBRID = {'×', 'x', '+'}
DETAILS = Path(__file__).with_name('col-name-details.tsv.gz')


def check_digest(path, expected):
    with path.open('rb') as stream:
        digest = hashlib.sha256()
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    if digest.hexdigest() != expected:
        raise ValueError(f'Catalogue of Life SHA-256 mismatch for {path.name}')


def usual_name(verbatim, rank):
    words = verbatim.split()
    if not words:
        return ''
    end = 2 if words[0] in HYBRID else 1
    if words[0].strip('"“') == 'Candidatus':
        end += 1
    if rank == 'species' or rank not in RANK_NUMBER:
        # Zoological names may contain a parenthesized subgenus before the species epithet.
        if len(words) > end + 1 and words[end].startswith('(') and words[end].endswith(')') and words[end + 1][:1].islower():
            end += 1
        if len(words) > end and words[end] in HYBRID:
            end += 1
        end += 1
    return ' '.join(words[:end])


def turkish_key(name):
    text = unicodedata.normalize('NFD', name.lower().replace('ı', 'i'))
    return ''.join(c for c in text if not unicodedata.combining(c))


def source_rows(archive, filename, cols):
    csv.field_size_limit(sys.maxsize)
    with archive.open(filename) as stream, io.TextIOWrapper(stream, encoding='utf-8-sig', newline='') as text:
        table = csv.reader(text, delimiter='\t', quoting=csv.QUOTE_NONE)
        header = [col.removeprefix('col:') for col in next(table)]
        positions = [header.index(col) for col in cols]
        for row in table:
            yield [row[p] for p in positions]


def extract_details(source, output):
    """Run once per release. Preserve structured spellings and Turkish names omitted from TextTree."""
    check_digest(source, STRUCTURED_SHA)
    corrections = set()
    common = set()
    with ZipFile(source) as archive:
        vernacular = defaultdict(list)
        for key, language, name, preferred in source_rows(archive, 'VernacularName.tsv', ('taxonID','language','name','preferred')):
            if language.lower() in ('tur','tr') and name.strip():
                vernacular[key].append((' '.join(name.split()), int(preferred == 'true')))
        cols = ('ID','rank','scientificName','authorship','kingdom','family','status')
        for key, rank, name, authors, kingdom, family, status in source_rows(archive, 'NameUsage.tsv', cols):
            if rank not in RANK_NUMBER or not name:
                continue
            name = ' '.join(name.split())
            verbatim = ' '.join(f'{name} {authors}'.split())
            if usual_name(verbatim, rank) != name:
                corrections.add(('x',rank,verbatim,name))
            if key in vernacular and status in ('accepted','provisionally accepted'):
                for tr, preferred in vernacular[key]:
                    common.add(('t',rank,name,kingdom,family,tr,preferred))
    with output.open('wb') as file, gzip.GzipFile(filename='', fileobj=file, mode='wb', mtime=0) as compressed:
        with io.TextIOWrapper(compressed, encoding='utf-8', newline='') as text:
            writer = csv.writer(text, delimiter='\t', lineterminator='\n')
            writer.writerows(sorted(corrections))
            writer.writerows(sorted(common))
    print(f'{len(corrections):,} structured spellings; {len(common):,} Turkish common names.')


def load_details():
    corrections = {}
    common = defaultdict(list)
    with gzip.open(DETAILS,'rt',encoding='utf-8',newline='') as stream:
        for kind, rank, name, *data in csv.reader(stream,delimiter='\t'):
            if kind == 'x':
                corrections[rank,name] = data[0]
            else:
                common[rank,name].append(data)
    return corrections, common


def index_tree(archive, db):
    corrections, common = load_details()
    taxa, aliases, local_names = [], [], []
    # Track the nearest included ancestor, including when intermediate ranks are omitted.
    stack = []
    last_id = 0

    def flush():
        db.executemany('INSERT INTO taxa VALUES(?,?,?,?,?)',taxa)
        db.executemany('INSERT INTO pending_alias VALUES(?,?,?)',aliases)
        db.executemany('INSERT OR IGNORE INTO common VALUES(?,?,?,?,?)',local_names)
        taxa.clear()
        aliases.clear()
        local_names.clear()

    with archive.open('dataset-316691.txtree') as binary, io.TextIOWrapper(binary, encoding='utf-8') as stream:
        for line in stream:
            clean = line.lstrip(' ')
            depth = (len(line) - len(clean)) // 2
            verbatim, sep, rank_text = clean.rpartition(' [')
            if not sep:
                continue
            rank = rank_text.split(']',1)[0].lower()
            rank_no = RANK_NUMBER.get(rank)
            alias = verbatim.startswith(('=','≡'))
            provisional = verbatim.startswith('?')
            verbatim = verbatim.lstrip('=≡$?† \ufeff').strip()
            del stack[depth:]
            parent, parent_rank, kingdom, family = stack[-1] if stack else (None,None,'','')
            if rank_no is not None:
                name = corrections.get((rank,verbatim)) or usual_name(verbatim,rank)
            if alias:
                if rank_no is not None and parent_rank is not None and name:
                    aliases.append((parent_rank,name,parent))
            elif rank_no is None:
                stack.append((parent,None,kingdom,family))
            else:
                last_id += 1
                taxa.append((last_id,parent,rank_no,name,int(provisional)))
                if rank == 'species' and ' (' in name:
                    parts = name.split()
                    if len(parts) == 3 and parts[1].startswith('(') and parts[1].endswith(')'):
                        aliases.append((rank_no,f'{parts[0]} {parts[2]}',last_id))
                if rank == 'kingdom':
                    kingdom = name
                if rank == 'family':
                    family = name
                stack.append((last_id,rank_no,kingdom,family))
                for expected_kingdom,expected_family,tr,preferred in common.get((rank,name),()):
                    if expected_kingdom and expected_kingdom != kingdom:
                        continue
                    if expected_family and expected_family != family:
                        continue
                    local_names.append((rank_no,turkish_key(tr),last_id,tr,int(preferred)))
            if len(taxa) + len(aliases) >= 15000:
                flush()
    flush()


def build(archive_path, output):
    check_digest(archive_path,TREE_SHA)
    if output.exists():
        raise ValueError(f'Target already exists: {output}')
    db = sqlite3.connect(output)
    try:
        db.executescript('''
            PRAGMA journal_mode=OFF;
            PRAGMA synchronous=OFF;
            PRAGMA cache_size=-18000;
            PRAGMA temp_store=FILE;
            CREATE TABLE taxa(id INTEGER PRIMARY KEY, parent INTEGER, rank INTEGER NOT NULL,
                              name TEXT COLLATE NOCASE NOT NULL, provisional INTEGER NOT NULL);
            CREATE TEMP TABLE pending_alias(rank INTEGER,name TEXT COLLATE NOCASE,target INTEGER);
            CREATE TABLE aliases(rank INTEGER NOT NULL, name TEXT COLLATE NOCASE NOT NULL,
                                 target INTEGER NOT NULL, PRIMARY KEY(rank,name,target)) WITHOUT ROWID;
            CREATE TABLE common(rank INTEGER NOT NULL, normalized TEXT NOT NULL, target INTEGER NOT NULL,
                                name TEXT NOT NULL, preferred INTEGER NOT NULL,
                                PRIMARY KEY(rank,normalized,target,name)) WITHOUT ROWID;
        ''')
        with ZipFile(archive_path) as archive:
            index_tree(archive,db)
        db.executescript('''
            INSERT OR IGNORE INTO aliases
                SELECT a.rank,a.name,a.target FROM pending_alias a JOIN taxa t ON t.id=a.target
                WHERE a.name != t.name ORDER BY a.rank,a.name,a.target;
            DROP TABLE pending_alias;
            CREATE INDEX taxon_search ON taxa(rank,name);
            CREATE INDEX common_target ON common(target,preferred DESC,name);
            PRAGMA user_version=1;
        ''')
        species = db.execute('SELECT COUNT(*) FROM taxa WHERE rank=6').fetchone()[0]
        if species != 2504814 or db.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
            raise ValueError(f'Incomplete taxonomy index ({species:,} species)')
        db.commit()
        print(f'Catalogue of Life {RELEASE} indexed: {species:,} species')
    finally:
        db.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=('build','extract-details'))
    parser.add_argument('archive',type=Path)
    parser.add_argument('output',type=Path)
    args = parser.parse_args()
    (build if args.action == 'build' else extract_details)(args.archive,args.output)
