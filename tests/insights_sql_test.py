"""Run production analytics SQL against a migrated SQLite database."""
import json
import pathlib
import sqlite3
import subprocess
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
DAY = 86400000
NOW = 1793404800000


class InsightsSqlTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        code = "import {INSIGHT_SQL} from './lib/insights.js'; console.log(JSON.stringify(INSIGHT_SQL))"
        cls.queries = json.loads(subprocess.check_output(["node", "--input-type=module", "-e", code], cwd=ROOT, text=True))

    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        self.db.executescript((ROOT / "schema.sql").read_text())
        for migration in sorted(ROOT.glob("migrations_*.sql")):
            self.db.executescript(migration.read_text())
        def visit(id, kiosk, user, age, status, amount=None, paid=False, wait=None, deposit=None):
            created = NOW - age * DAY
            self.db.execute("""INSERT INTO checkins
                (id,kiosk_id,user_id,ticket,answers,status,created_at,arrived_at,served_at,amount_cents,paid_at,deposit_cents,deposit_paid_at,channel,seen_business)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (id,kiosk,user,f"A{id}",'{"email":"PRIVATE"}',status,created,
                 created if wait is not None else None,created + wait * 60000 if wait is not None else None,
                 amount,NOW-1000 if paid else None,deposit,NOW-1000 if deposit else None,
                 "phone, voice" if user else "kiosk",10 if id == 2 else 0))
        visit(1,"one","a",10,"done",1000,True,2)
        visit(2,"one","a",2,"done",2000,True,5)
        visit(3,"one","b",1,"no-show")
        visit(4,"one",None,1,"payment",3000,False,20)
        visit(5,"one",None,40,"done",99999,True)
        visit(6,"two","a",1,"done",99999,True)
        visit(7,"one","future",-1,"done")
        visit(8,"one","d",1,"ready",deposit=500)
        visit(9,"one",None,1,"cancelled")
        self.db.executemany("INSERT INTO ratings (kiosk_id,checkin_id,score,comment,at) VALUES (?,?,?,?,?)", [
            ("one",2,2,"Too slow",NOW-1000),("one",5,1,"Expired",NOW-1000),
            ("two",6,5,"Other business",NOW-1000),("one",1,4,"Older visit",NOW-1000)])
        self.db.executemany("INSERT INTO messages (id,kiosk_id,checkin_id,sender,body,at) VALUES (?,?,?,?,?,?)", [
            (1,"one",4,"customer","PRIVATE MESSAGE",NOW-1000),
            (2,"one",2,"customer","Already read",NOW-1000),
            (3,"one",5,"customer","Expired",NOW-1000),
            (4,"two",4,"customer","Wrong kiosk",NOW-1000)])
        self.db.execute("UPDATE checkins SET delete_status = 'requested' WHERE id = 8")
        self.db.executemany("INSERT INTO events(kiosk_id,type,at) VALUES (?,?,?)", [
            ("one","view",NOW-DAY),("one","start",NOW-DAY),("one","checkin",NOW-DAY),
            ("one","view",NOW-40*DAY),("two","view",NOW-DAY),("one","view",NOW+DAY)])

    def tearDown(self):
        self.db.close()

    def query(self, name):
        args = ("one", NOW-7*DAY, NOW)
        if name == "customers":
            args += (NOW-30*DAY,)
        return [dict(r) for r in self.db.execute(self.queries[name], args)]

    def test_summary_scopes_period_business_and_future_records(self):
        r = self.query("summary")[0]
        self.assertEqual(r["visits"], 5)
        self.assertEqual(r["completed"], 1)
        self.assertEqual(r["no_shows"], 1)
        self.assertEqual(r["cancelled"], 1)
        self.assertEqual(r["active"], 2)
        self.assertEqual(r["anonymous_visits"], 2)
        self.assertEqual(r["paid_cents"], 2000)
        self.assertEqual(r["deposit_cents"], 500)
        self.assertEqual(r["outstanding_cents"], 3000)
        self.assertEqual(r["wait_samples"], 2)
        self.assertEqual(r["wait_ms"], 12.5 * 60000)

    def test_customer_cohorts_use_retained_history_without_exposing_ids(self):
        self.assertEqual(self.query("customers"), [{"identified_customers":3,"repeat_customers":1,"single_visit_customers":2}])

    def test_followup_counts_are_exact_and_never_return_messages_or_answers(self):
        rows = self.query("attention")
        self.assertEqual({r["id"] for r in rows}, {2,4,8})
        self.assertEqual(rows[0]["id"], 8)
        self.assertEqual(next(r for r in rows if r["id"] == 4)["unread"], 1)
        self.assertNotIn("PRIVATE", json.dumps(rows))
        self.assertEqual(self.query("attention_counts"), [{"deletion_requests":1,"unpaid_visits":1,"ready_visits":1,"unanswered_visits":1}])

    def test_ratings_and_events_use_the_correct_period(self):
        self.assertEqual(self.query("ratings"), [{"count":1,"average":2.0,"low_scores":1}])
        self.assertEqual(len(self.query("feedback")), 1)
        self.assertEqual({r["type"]: r["count"] for r in self.query("funnel")}, {"view":1,"start":1,"checkin":1})

    def test_charts_reconcile_to_visit_totals(self):
        for query in ["daily", "hours", "channels"]:
            self.assertEqual(sum(r["visits"] for r in self.query(query)),5)

    def test_all_queries_execute_on_an_empty_database(self):
        self.db.execute("DELETE FROM checkins")
        self.db.execute("DELETE FROM events")
        for name in self.queries:
            self.query(name)
        self.assertEqual(self.query("summary")[0]["visits"],0)


if __name__ == "__main__":
    unittest.main()
