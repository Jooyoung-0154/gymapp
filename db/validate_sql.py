# [목적] validate_sql.py 파일: PostgreSQL 구문 분석기로 SQL·PL/pgSQL 문법과 외래 키 참조 구조를 검사합니다. 실제 DB에서 업무 흐름을 실행하는 검사는 아닙니다.
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
# [처리 흐름] parse_sql(schema_text) 결과 순회: 파싱된 테이블 정의에서 열·기본 키·고유 키·외래 키 구조를 수집합니다.
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

# [처리 흐름] foreign_keys 목록 검증 반복문: 외래 키 대상 존재 여부와 열 개수·고유성 조건을 검증합니다.
for source, local, target, remote in foreign_keys:
    assert target in tables, f'Unknown FK target: {source} -> {target}'
    assert set(local) <= tables[source][0], f'Unknown FK source columns: {source}, {local}'
    remote = remote or tables[target][2]
    assert remote and set(remote) <= tables[target][0], f'Unknown FK target columns: {target}, {remote}'
    assert len(local) == len(remote), f'FK cardinality mismatch: {source} -> {target}'
    assert remote in tables[target][1], f'FK target lacks declared unique key: {target}, {remote}'
print(f'FK structure: PASS ({len(foreign_keys)} references, target columns and declared unique keys)')

# [처리 흐름] 스키마·스모크 테스트 파일 구문 검사 반복문: 스키마와 스모크 테스트의 SQL 및 함수·DO 블록 문법을 검사합니다.
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
