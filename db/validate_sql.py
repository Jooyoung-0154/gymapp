"""Optional development check: pip install pglast into ../.validation first."""
from pathlib import Path
import re
import sys

root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root / '.validation'))
from pglast import parse_sql, parse_plpgsql, ast
from pglast.enums import ConstrType

schema_text = (root / 'db/001_schema.sql').read_text(encoding='utf-8')
tables = {}
foreign_keys = []
for raw in parse_sql(schema_text):
    stmt = raw.stmt
    if not isinstance(stmt, ast.CreateStmt):
        continue
    name = (stmt.relation.schemaname or 'gym', stmt.relation.relname)
    columns, unique_keys, primary_key = set(), set(), None
    constraints = []
    for item in stmt.tableElts:
        if isinstance(item, ast.ColumnDef):
            columns.add(item.colname)
            constraints.extend((c, item.colname) for c in item.constraints or ())
        elif isinstance(item, ast.Constraint):
            constraints.append((item, None))
    for c, column in constraints:
        if c.contype in (ConstrType.CONSTR_PRIMARY, ConstrType.CONSTR_UNIQUE):
            key = tuple(x.sval for x in c.keys) if c.keys else (column,)
            unique_keys.add(key)
            if c.contype == ConstrType.CONSTR_PRIMARY:
                primary_key = key
        elif c.contype == ConstrType.CONSTR_FOREIGN:
            target = (c.pktable.schemaname or 'gym', c.pktable.relname)
            local = tuple(x.sval for x in c.fk_attrs) if c.fk_attrs else (column,)
            remote = tuple(x.sval for x in c.pk_attrs) if c.pk_attrs else None
            foreign_keys.append((name, local, target, remote))
    tables[name] = (columns, unique_keys, primary_key)

for source, local, target, remote in foreign_keys:
    assert target in tables, f'Unknown FK target: {source} -> {target}'
    assert set(local) <= tables[source][0], f'Unknown FK source columns: {source}, {local}'
    remote = remote or tables[target][2]
    assert remote and set(remote) <= tables[target][0], f'Unknown FK target columns: {target}, {remote}'
    assert len(local) == len(remote), f'FK cardinality mismatch: {source} -> {target}'
    assert remote in tables[target][1], f'FK target lacks declared unique key: {target}, {remote}'
print(f'FK structure: PASS ({len(foreign_keys)} references, target columns and declared unique keys)')

for name in ('001_schema.sql', '002_smoke_test.sql'):
    text = (root / 'db' / name).read_text(encoding='utf-8')
    text = '\n'.join(line for line in text.splitlines() if not line.startswith('\\'))
    parsed = parse_sql(text)
    for match in re.finditer(r'CREATE FUNCTION .*?\$\$;', text, re.S):
        parse_plpgsql(match.group())
    for match in re.finditer(r'DO \$\$.*?\$\$;', text, re.S):
        parse_plpgsql(match.group())
    print(f'{name}: PASS ({len(parsed)} statements, SQL and PL/pgSQL syntax)')
print('Tables:', len(re.findall(r'CREATE TABLE ', (root / 'db/001_schema.sql').read_text(encoding='utf-8'))))
