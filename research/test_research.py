"""Regression checks for simulation accounting; no external datasets required."""
import unittest
import tempfile
from pathlib import Path
import numpy as np
from audit_mr080g import audit
from robustness import protocol_metrics, run


class ProtocolMetricsTests(unittest.TestCase):
    def test_positive_before_true_breach_is_not_detection(self):
        # First participant flags early, second flags during a true breach,
        # third has a false alarm while always clearly above the boundary.
        traj = np.array([[1, .9, .79, .75], [1, .9, .79, .75], [1, .95, .95, .95]])
        result = protocol_metrics(np.array([1., 3., 1.]), np.ones(3), traj)
        self.assertEqual(result['breaches'], 2)
        self.assertEqual(result['detected_breaches'], 1)
        self.assertEqual(result['sens'], 50.)
        self.assertEqual(result['alarms_before_breach'], 1)
        self.assertEqual(result['delay_med'], 1.)
        self.assertEqual(result['false_alarms_clear'], 1)

    def test_positive_after_recovery_is_not_detection(self):
        result = protocol_metrics(np.array([3.]), np.ones(1), np.array([[1, .79, .79, .9]]))
        self.assertEqual(result['detected_breaches'], 0)
        self.assertIsNone(result['delay_med'])

    def test_empty_denominators_are_unavailable(self):
        result = protocol_metrics(np.array([np.inf]), np.zeros(1), np.array([[1, .82, .82]]))
        self.assertIsNone(result['sens'])
        self.assertIsNone(result['fa_clear'])

    def test_both_maximal_protocols_stop_after_first_positive(self):
        scenario = dict(dist=lambda rng, n: np.full(n, .3), traj='step14', sd_aci=0., sd_peak=0., thr=.85, every=14)
        result = run(scenario, n=10)
        self.assertEqual(result['REF']['peak_tests'], 1.)
        self.assertEqual(result['SCR']['peak_tests'], 1.)
        self.assertEqual(result['REF']['sens'], 100.)
        self.assertEqual(result['SCR']['sens'], 100.)

    def test_reproducible_seed_and_nonnegative_delays(self):
        scenario = dict(dist=lambda rng, n: rng.normal(.2, .05, n), traj='linear', sd_aci=6., sd_peak=3., thr=.85, every=14)
        first = run(scenario, n=300)
        self.assertEqual(first, run(scenario, n=300))
        for result in first.values():
            self.assertTrue(result['delay_med'] is None or result['delay_med'] >= 0)


class ArchiveAuditTests(unittest.TestCase):
    def test_all_unreadable_files_produce_report(self):
        with tempfile.TemporaryDirectory() as d:
            source = Path(d) / 'broken.csv'
            source.write_text('')
            summary, files, variables, participants = audit([source], window=3)
            self.assertEqual(len(files), 1)
            self.assertIn('Ошибка чтения', files)
            self.assertTrue(variables.empty)
            self.assertTrue(participants.empty)
            self.assertEqual(summary.iloc[0]['Результат'], 0)


if __name__ == '__main__':
    unittest.main()
