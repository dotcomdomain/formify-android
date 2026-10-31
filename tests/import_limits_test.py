"""Exercise the exact endpoint rate-limit SQL against SQLite, as used by D1."""
import pathlib
import re
import sqlite3
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


class ImportLimitTest(unittest.TestCase):
    def test_atomic_reservations_and_window_reset(self):
        db = sqlite3.connect(":memory:")
        db.executescript((ROOT / "migrations_010.sql").read_text())
        source = (ROOT / "functions/api/import.js").read_text()
        sql = re.search(r"prepare\(`(INSERT INTO document_import_limits.*?)`\)", source, re.S).group(1)

        def reserve(business, window):
            return db.execute(sql, (business, window)).fetchone()

        for count in range(1, 6):
            self.assertEqual(reserve("one", 600000), (count,))
        self.assertIsNone(reserve("one", 600000))
        self.assertEqual(reserve("two", 600000), (1,))
        self.assertEqual(reserve("one", 1200000), (1,))
        self.assertEqual(db.execute("SELECT COUNT(*) FROM document_import_limits").fetchone(), (2,))
        db.close()


if __name__ == "__main__":
    unittest.main()
