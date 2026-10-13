import json
import unittest
import numpy as np
from progress import AudioProgress


class ProgressTests(unittest.TestCase):
    def setUp(self):
        self.now = 0
        self.progress = AudioProgress(clock=lambda: self.now)

    def test_countdown_uses_current_speed_and_includes_remaining_stages(self):
        self.progress.update('Grouping', stage='grouping', duration=240, fraction=0)
        self.now = 10
        self.progress.update('Grouping', stage='grouping', fraction=.5)
        snapshot = self.progress.snapshot()
        self.assertGreater(snapshot['etaSeconds'], 10)  # transcription is still pending
        self.now += 3
        self.assertEqual(self.progress.snapshot()['etaSeconds'], snapshot['etaSeconds'] - 3)

    def test_unknown_download_time_never_reuses_processing_countdown(self):
        self.progress.update('Grouping', stage='grouping', duration=60, fraction=.2)
        self.progress.update('Loading model', stage='preparing')
        self.assertIsNone(self.progress.snapshot()['etaSeconds'])
        self.progress.update('Download', stage='download', step='model', fraction=0)
        self.now = 10
        self.progress.update('Download', stage='download', step='model', fraction=.5)
        self.assertEqual(self.progress.snapshot()['etaSeconds'], 10)
        self.assertEqual(self.progress.snapshot()['etaScope'], 'download')

    def test_overdue_never_claims_zero_seconds_or_completion(self):
        self.progress.update('Finishing', stage='finishing')
        self.now = 20
        snapshot = self.progress.snapshot()
        self.assertTrue(snapshot['overdue'])
        self.assertIsNone(snapshot['etaSeconds'])

    def test_completed_stage_can_calibrate_next_recording(self):
        self.progress.update('Grouping', stage='grouping', duration=100, fraction=0)
        self.now = 10
        self.progress.update('Grouping', stage='grouping', fraction=1)
        self.progress.update('Loading', stage='preparing')
        self.assertAlmostEqual(self.progress.learned['grouping'], .1)
        next_run = AudioProgress(rates=self.progress.learned)
        self.assertAlmostEqual(next_run.rates['grouping'], .1)

    def test_inference_numpy_progress_is_json_serializable(self):
        self.progress.update('Transcribing', stage='transcription', duration=np.float64(240), fraction=np.float32(0))
        self.now = 10
        self.progress.update('Transcribing', stage='transcription', fraction=np.float32(.25))
        snapshot = json.loads(json.dumps(self.progress.snapshot()))
        self.assertEqual(snapshot['percent'], 25)
        self.assertIs(snapshot['overdue'], False)
        self.now = 100
        self.assertIs(json.loads(json.dumps(self.progress.snapshot()))['overdue'], True)
