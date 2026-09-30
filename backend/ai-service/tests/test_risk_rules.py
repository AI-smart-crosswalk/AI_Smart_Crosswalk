# [LIEL] One test per agreed risk case (4 Low / 4 Medium / 4 High) + the edge cases the
# design review asked for. Geometry: see tests/helpers.py (1 h = 100 px, zone line y = 800).
import unittest

import config
from risk_rules import Assessment, CASES, PRIORITY
from tests.helpers import FRAME_H, FRAME_W, ZONE_TOP, engine, obs, track, y_feet_for_dist
from tracker import Observation, Track


_saved_ref = None


def setUpModule():
    """Run these rule tests with child-calibration OFF by default (deterministic, independent
    of whatever ADULT_HEIGHT_REF is committed in config.py). Child tests opt in via use_calibration."""
    global _saved_ref
    _saved_ref = config.ADULT_HEIGHT_REF
    config.ADULT_HEIGHT_REF = None


def tearDownModule():
    config.ADULT_HEIGHT_REF = _saved_ref


def use_calibration(tc):
    """Turn on child detection for a test: constant adult height = 0.1*frame (100 px)."""
    prev = config.ADULT_HEIGHT_REF
    config.ADULT_HEIGHT_REF = [(0.6, 0.1), (0.9, 0.1)]
    tc.addCleanup(lambda: setattr(config, "ADULT_HEIGHT_REF", prev))


def wheeled_track(track_id: int, dists: list[float], t0: float = 0.0, dt: float = 0.5,
                  x: float = 500.0, h: float = 100.0) -> Track:
    """A wheeled approacher (bicycle/motorcycle) track."""
    obs_list = []
    for i, d in enumerate(dists):
        yf = y_feet_for_dist(d, h)
        obs_list.append(Observation(t=t0 + i * dt, x1=x - 20, y1=yf - h, x2=x + 20, y2=yf,
                                    confidence=0.9, truncated=False, phone=False, kind="wheeled"))
    return Track(track_id=track_id, observations=obs_list, kind="wheeled")


def verdict(tr: Track, others=None, died=None, t=None, stream_t0=None) -> Assessment:
    eng = engine()
    eng._stream_t0 = stream_t0                     # None = "analysis started with this frame" (cold start)
    t = tr.last.t if t is None else t
    results = eng.evaluate([tr], t, FRAME_W, FRAME_H, all_live_tracks=[tr] + list(others or []),
                           recently_died_near=died)
    return next(a for a in results if a.track_id == tr.track_id)


class TestCaseTable(unittest.TestCase):
    def test_case_table_and_priority(self):
        self.assertEqual(len(CASES), 17)
        self.assertEqual(sorted(CASES), sorted(PRIORITY))
        self.assertEqual([CASES[c][0] for c in PRIORITY],
                         ["High"] * 6 + ["Medium"] * 4 + ["Low"] * 7)


class TestLowCases(unittest.TestCase):
    def test_L1_moving_parallel(self):
        # feet stay 0.3 h from the edge, x moves 160 px in 2 s -> lateral 0.8 h/s, approach 0
        a = verdict(track(1, [0.3] * 5, xs=[100, 140, 180, 220, 260]))
        self.assertEqual(a.case_id, "L1")
        self.assertEqual(a.level, "Low")
        self.assertFalse(a.danger)

    def test_L2_standing_far(self):
        a = verdict(track(1, [3.0, 3.01, 2.99, 3.0], xs=[500, 502, 498, 500]))
        self.assertEqual(a.case_id, "L2")

    def test_L3_moving_away(self):
        a = verdict(track(1, [0.2, 1.0, 1.8]))
        self.assertEqual(a.case_id, "L3")

    def test_L4_quiet_waiting(self):
        a = verdict(track(1, [0.4, 0.41, 0.4, 0.39]))
        self.assertEqual(a.case_id, "L4")
        self.assertFalse(a.distracted)

    def test_L4_with_phone_is_still_low_but_distracted(self):
        # "phone is a modifier, never a gate": standing with a phone must be LOGGED as Low, not lit as Medium
        a = verdict(track(1, [0.4, 0.41, 0.4, 0.39], phone=True))
        self.assertEqual(a.case_id, "L4")
        self.assertTrue(a.distracted)

    def test_L4_boundary_flicker_is_not_M4(self):
        # feet jitter across the zone line while standing: must NOT be "stepping down"
        a = verdict(track(1, [0.01, -0.01, 0.01, -0.01]))
        self.assertEqual(a.case_id, "L4")


class TestMediumCases(unittest.TestCase):
    def test_M1_normal_approach_is_low(self):
        # a calm walk up to the crossing is normal behaviour -> Low, no LEDs
        a = verdict(track(1, [2.0, 1.5, 1.0, 0.5]))          # 1.0 h/s, ends 0.5 h from the edge
        self.assertEqual(a.case_id, "M1")
        self.assertEqual(a.level, "Low")
        self.assertFalse(a.danger)
        self.assertEqual(a.metadata["approachSpeedHps"], 1.0)

    def test_M5_brisk_no_brake(self):
        # brisk (1.8 h/s), not slowing, still ~1.6 h out -> Medium early warning
        a = verdict(track(1, [3.4, 2.5, 1.6]))
        self.assertEqual(a.case_id, "M5")
        self.assertEqual(a.level, "Medium")

    def test_M1_survives_one_jitter_interval(self):
        a = verdict(track(1, [1.2, 0.85, 0.87, 0.4]))
        self.assertEqual(a.case_id, "M1")

    def test_M1_via_time_to_edge_when_not_yet_very_close(self):
        a = verdict(track(1, [3.0, 2.5, 2.0, 1.5]))          # 1.0 h/s, 1.5 h left -> 1.5 s to the edge
        self.assertEqual(a.case_id, "M1")
        self.assertAlmostEqual(a.metadata["timeToEdgeSec"], 1.5)

    def test_slow_far_approach_is_none(self):
        a = verdict(track(1, [3.0, 2.9, 2.8, 2.7]))          # 0.2 h/s, 13 s away: no agreed case
        self.assertIsNone(a.case_id)
        self.assertIsNone(a.level)

    def test_M2_phone_while_approaching(self):
        a = verdict(track(1, [1.4, 1.0, 0.6], phone=True))
        self.assertEqual(a.case_id, "M2")
        self.assertTrue(a.distracted)

    def test_M4_stepping_down(self):
        a = verdict(track(1, [0.4, 0.1, -0.1]))               # crosses the line while still approaching
        self.assertEqual(a.case_id, "M4")
        self.assertNotIn("M1", a.metadata["matchedCases"])    # once inside the zone M1 no longer applies

    def test_walking_on_inside_the_zone_after_the_window_is_none(self):
        # the crossing left the 2 s window: the person is beyond the curb, out of the agreed cases
        a = verdict(track(1, [-0.6, -0.9, -1.2, -1.5, -1.8]))
        self.assertIsNone(a.case_id)

    def test_M3_group_of_three_approaching(self):
        eng = engine()
        people = [track(i, [1.5, 1.1, 0.7], x=200 + 200 * i) for i in range(3)]
        results = eng.evaluate(people, people[0].last.t, FRAME_W, FRAME_H)
        group = [a for a in results if a.track_id == -1]
        self.assertEqual(len(group), 1)
        self.assertEqual(group[0].case_id, "M3")
        self.assertEqual(group[0].metadata["count"], 3)

    def test_two_people_are_not_a_group(self):
        eng = engine()
        people = [track(i, [1.5, 1.1, 0.7], x=200 + 200 * i) for i in range(2)]
        results = eng.evaluate(people, people[0].last.t, FRAME_W, FRAME_H)
        self.assertFalse(any(a.track_id == -1 for a in results))


class TestHighCases(unittest.TestCase):
    def test_H1_burst(self):
        a = verdict(track(1, [2.0, 0.9]))                     # 1.1 h in 0.5 s = 2.2 h/s
        self.assertEqual(a.case_id, "H1")
        self.assertEqual(a.level, "High")

    def test_H1_keeps_firing_inside_the_zone(self):
        # signed distance: once inside the zone the approach speed must not collapse to 0
        a = verdict(track(1, [0.5, 0.0, -0.5], dt=0.25))
        self.assertEqual(a.case_id, "H1")

    def test_H1_not_triggered_by_a_box_cut_at_the_frame_bottom(self):
        # last box touches the bottom border: its anchor jump must be ignored for motion
        tr = track(1, [0.4, 0.1])
        tr.observations.append(obs(1.0, 500, 0.0, y_feet=FRAME_H - 5, truncated=True))
        a = verdict(tr)
        self.assertNotEqual(a.case_id, "H1")
        self.assertTrue(a.metadata["truncated"])

    def test_H2_child_walking_is_medium(self):
        use_calibration(self)
        child = track(1, [1.0, 0.6, 0.2], x=600, h=70)      # 70 < 0.8 * 100 (calibrated adult) -> child
        a = verdict(child)
        self.assertEqual(a.person_type, "child")
        self.assertEqual(a.case_id, "H2")
        self.assertEqual(a.level, "Medium")                 # child walking toward the edge = Medium

    def test_H6_child_darting_is_high(self):
        use_calibration(self)
        child = track(1, [2.4, 1.2], x=600, h=70)           # 2.4 h/s = running
        a = verdict(child)
        self.assertEqual(a.person_type, "child")
        self.assertEqual(a.case_id, "H6")
        self.assertEqual(a.level, "High")

    def test_H5_no_stop_entry(self):
        # brisk (1.8 h/s), not slowing, already within 1.2 h of the edge -> entering without stopping
        a = verdict(track(1, [2.6, 1.7, 0.8]))
        self.assertEqual(a.case_id, "H5")
        self.assertEqual(a.level, "High")

    def test_child_needs_calibration_else_unknown(self):
        # without ADULT_HEIGHT_REF the system does NOT guess child (no false child alarms)
        a = verdict(track(1, [1.0, 0.6, 0.2], h=70))
        self.assertEqual(a.person_type, "unknown")
        self.assertNotIn(a.case_id, ("H2", "H6"))

    def test_child_alone_is_unknown_and_falls_back_to_M1(self):
        a = verdict(track(1, [1.0, 0.6, 0.2], h=70))
        self.assertEqual(a.person_type, "unknown")
        self.assertEqual(a.case_id, "M1")                     # never gate on classification

    def test_child_walking_parallel_is_L1_not_H2(self):
        use_calibration(self)
        child = track(1, [0.3] * 4, xs=[100, 150, 200, 250], h=70)
        a = verdict(child)
        self.assertEqual(a.case_id, "L1")
        self.assertEqual(a.person_type, "child")

    def test_H3_distracted_not_slowing(self):
        a = verdict(track(1, [1.0, 0.6, 0.2], phone=True))   # 0.8 h/s then 0.8 h/s, ends at 0.2 h
        self.assertEqual(a.case_id, "H3")

    def test_H3_needs_no_deceleration_else_M2(self):
        a = verdict(track(1, [1.0, 0.6, 0.45], phone=True))  # slowed from 0.8 to 0.3 h/s
        self.assertEqual(a.case_id, "M2")

    def test_H3_needs_sustained_approach_else_M2(self):
        a = verdict(track(1, [0.3, 0.3, 0.1], phone=True))   # was standing, took one step
        self.assertEqual(a.case_id, "M2")

    def test_H4_sudden_appearance(self):
        # entered from the side of the picture (first box touches a border) 0.5 s ago, already
        # near the curb, heading for it, while the analysis had been running since t=0
        young = track(1, [0.4, 0.25, 0.1], t0=2.0, dt=0.25, truncated=[True, False, False])
        a = verdict(young, died=lambda t, anchor, h: False, stream_t0=0.0)
        self.assertEqual(a.case_id, "H4")

    def test_H4_not_for_a_reidentified_person(self):
        young = track(1, [0.4, 0.25, 0.1], t0=2.0, dt=0.25, truncated=[True, False, False])
        a = verdict(young, died=lambda t, anchor, h: True, stream_t0=0.0)   # a track just died right there
        self.assertEqual(a.case_id, "M1")

    def test_H4_not_at_cold_start(self):
        # same person, but the clip STARTS with them: nobody "appeared", they were already there
        young = track(1, [0.4, 0.25, 0.1], t0=0.0, dt=0.25, truncated=[True, False, False])
        a = verdict(young, died=lambda t, anchor, h: False)
        self.assertEqual(a.case_id, "M1")


class TestSingleFrameAndOutput(unittest.TestCase):
    def test_too_little_history_waits_unless_inside_zone(self):
        self.assertIsNone(verdict(track(1, [0.3])).case_id)               # one frame: wait
        self.assertIsNone(verdict(track(1, [0.3, 0.3], dt=0.1)).case_id)  # 0.1 s of history: wait
        self.assertEqual(verdict(track(1, [-0.2])).case_id, "M4")         # past the curb: act now
        self.assertIn("insufficient", verdict(track(1, [0.3])).metadata["note"])

    def test_standing_in_the_road_stays_medium(self):
        a = verdict(track(1, [-0.5, -0.5, -0.5, -0.5]))
        self.assertEqual(a.case_id, "M4")

    def test_child_far_and_slow_is_not_H2(self):
        use_calibration(self)
        child = track(1, [4.29, 4.19, 4.09, 3.99], x=600, h=70)   # 0.2 h/s, ~20 s from the edge
        a = verdict(child)
        self.assertEqual(a.person_type, "child")
        self.assertIsNone(a.case_id)

    def test_running_along_the_sidewalk_is_not_H1(self):
        a = verdict(track(1, [3.0, 3.0, 3.0], xs=[100, 220, 340]))       # 2.4 h/s sideways, 0 toward the curb
        self.assertEqual(a.case_id, "L1")

    def test_results_sorted_most_severe_first(self):
        eng = engine()
        low = track(1, [3.0, 3.0, 3.0], x=100)
        high = track(2, [2.0, 0.9], x=700)
        results = eng.evaluate([low, high], 0.5, FRAME_W, FRAME_H)
        self.assertEqual([a.level for a in results], ["High", "Low"])

    def test_confidence_and_metadata_shape(self):
        a = verdict(track(1, [2.0, 1.5, 1.0, 0.5]))
        self.assertTrue(1 <= a.confidence <= 100)
        for key in ("matchedCases", "distanceToEdgeH", "approachSpeedHps", "speedHps",
                    "timeToEdgeSec", "frames", "phoneFraction", "personTypeSource", "hRefPx"):
            self.assertIn(key, a.metadata)


class TestWheeledCases(unittest.TestCase):
    def test_HW_wheeled_fast(self):
        a = verdict(wheeled_track(7, [2.5, 1.0]))            # 3.0 h/s toward the edge
        self.assertEqual(a.case_id, "HW")
        self.assertEqual(a.level, "High")
        self.assertEqual(a.person_type, "wheeled")

    def test_MW_wheeled_slowing_but_not_enough(self):
        a = verdict(wheeled_track(7, [2.0, 1.3, 0.9]))       # ~1.1 h/s, decelerating
        self.assertEqual(a.case_id, "MW")
        self.assertEqual(a.level, "Medium")

    def test_wheeled_far_is_ignored(self):
        a = verdict(wheeled_track(7, [5.0, 4.6, 4.2]))       # beyond WHEELED_NEAR
        self.assertIsNone(a.case_id)


if __name__ == "__main__":
    unittest.main()
