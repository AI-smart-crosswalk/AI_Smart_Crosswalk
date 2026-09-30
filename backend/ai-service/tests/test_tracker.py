# [LIEL] Tests for tracker.py: identity across frames, gaps, crossing people, duplicates, phones.
import unittest

import config
from tests.helpers import ScriptedDetector, blank_frame, det, phone_det
from tracker import SimpleTracker, assign_phones, is_truncated, suppress_duplicates


class TestSimpleTracker(unittest.TestCase):
    def setUp(self):
        self.frame = blank_frame()

    def test_fast_mover_stays_one_track(self):
        # 250 px in 0.5 s with h = 100 px  ->  5 h/s, below the 6 h/s gate
        tr = SimpleTracker(detect_fn=ScriptedDetector([[det(500, 500)], [det(500, 750)]]))
        tr.process(0.0, self.frame)
        seen, _phones = tr.process(0.5, self.frame)
        self.assertEqual(len(seen), 1)
        self.assertEqual(len(seen[0].observations), 2)
        self.assertEqual(len(tr.live_tracks), 1)

    def test_one_frame_gap_is_tolerated(self):
        tr = SimpleTracker(detect_fn=ScriptedDetector([[det(500, 600)], [], [det(520, 620)]]))
        first = tr.process(0.0, self.frame)[0][0]
        tr.process(0.2, self.frame)                       # YOLO missed the person
        again = tr.process(0.4, self.frame)[0][0]
        self.assertIs(first, again)
        self.assertEqual(len(again.observations), 2)

    def test_long_gap_starts_a_new_track_and_remembers_the_dead_one(self):
        tr = SimpleTracker(detect_fn=ScriptedDetector([[det(500, 700)], [], [det(520, 710)]]))
        first = tr.process(0.0, self.frame)[0][0]
        tr.process(0.6, self.frame)                       # gap > TRACK_MAX_GAP_SECONDS -> first dies
        new = tr.process(1.0, self.frame)[0][0]
        self.assertIsNot(first, new)
        self.assertNotEqual(first.track_id, new.track_id)
        self.assertTrue(tr.recently_died_near(1.0, (520, 710), 100))
        self.assertFalse(tr.recently_died_near(1.0, (100, 100), 100))

    def test_two_people_crossing_keep_their_identities(self):
        xs_a = [200, 400, 600, 800]                        # A: h = 100, walks right
        xs_b = [800, 600, 400, 200]                        # B: h = 140, walks left
        frames = [[det(xs_a[i], 700, h=100), det(xs_b[i], 700, h=140)] for i in range(4)]
        tr = SimpleTracker(detect_fn=ScriptedDetector(frames))
        for i in range(4):
            tr.process(i * 0.5, self.frame)
        tracks = sorted(tr.live_tracks, key=lambda t: t.h_ref)
        self.assertEqual(len(tracks), 2)
        a, b = tracks
        self.assertAlmostEqual(a.last.anchor[0], 800)       # the 100 px person ended on the right
        self.assertAlmostEqual(b.last.anchor[0], 200)       # the 140 px person ended on the left
        self.assertEqual([len(a.observations), len(b.observations)], [4, 4])

    def test_duplicate_boxes_become_one_person(self):
        tr = SimpleTracker(detect_fn=ScriptedDetector([[det(500, 700), det(502, 701, conf=0.5)]]))
        seen, _phones = tr.process(0.0, self.frame)
        self.assertEqual(len(seen), 1)

    def test_tiny_boxes_are_ignored(self):
        tr = SimpleTracker(detect_fn=ScriptedDetector([[det(500, 700, h=config.MIN_PERSON_HEIGHT_PX - 1)]]))
        self.assertEqual(tr.process(0.0, self.frame), ([], []))

    def test_phone_flag_reaches_the_observation(self):
        person = det(500, 700)                            # box x 480..520, y 600..700 ; chest at (500, 635)
        tr = SimpleTracker(detect_fn=ScriptedDetector([[person, phone_det(505, 640)]]))
        seen, phones = tr.process(0.0, self.frame)
        self.assertTrue(seen[0].last.phone)
        self.assertEqual(len(phones), 1)


class TestHelpers(unittest.TestCase):
    def test_one_phone_lights_only_one_person(self):
        a, b = det(500, 700), det(560, 700)
        holders = assign_phones([a, b], [phone_det(530, 640)])
        self.assertEqual(len(holders), 1)

    def test_phone_far_from_everyone_is_ignored(self):
        self.assertEqual(assign_phones([det(500, 700)], [phone_det(900, 100)]), set())

    def test_truncation_flag(self):
        self.assertTrue(is_truncated(det(500, 999), 1000, 1000))     # feet on the bottom border
        self.assertFalse(is_truncated(det(500, 700), 1000, 1000))

    def test_suppress_duplicates_keeps_the_confident_box(self):
        kept = suppress_duplicates([det(500, 700, conf=0.4), det(501, 700, conf=0.9)])
        self.assertEqual(len(kept), 1)
        self.assertEqual(kept[0]["confidence"], 0.9)


if __name__ == "__main__":
    unittest.main()
