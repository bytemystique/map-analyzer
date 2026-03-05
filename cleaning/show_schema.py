import sqlite3
conn = sqlite3.connect('source.db')
cursor = conn.cursor()

# Get all tables
cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [t[0] for t in cursor.fetchall()]
print('Tables:', tables)
print()

for table in tables:
    cursor.execute(f'PRAGMA table_info({table})')
    cols = cursor.fetchall()
    print(f'=== {table} ===')
    for col in cols:
        print(f'  {col[1]} ({col[2]})')
    cursor.execute(f'SELECT COUNT(*) FROM {table}')
    count = cursor.fetchone()[0]
    print(f'  Records: {count}')
    print()

conn.close()
