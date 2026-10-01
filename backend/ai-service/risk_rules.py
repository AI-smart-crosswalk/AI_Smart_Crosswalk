"""
========================================
Risk Rules

This file decides the risk level of each tracked
person or wheeled object. It turns a track into one
of the risk cases (Low, Medium, or High), or none.

Units (so the rules do not depend on the camera):
  * distances: body heights (h). dist > 0 = on the sidewalk,
               dist <= 0 = past the edge (inside the crosswalk zone).
  * speeds:    body heights per second (h/s). Walking ~0.8-1.5, running >= 2.
  * times:     seconds of video time.

When several cases match, the PRIORITY list decides which one is used.
========================================
"""
from __future__ import annotations

from dataclasses import dataclass, field
import math
from statistics import median

import cv2
import numpy as np

import config


# ========================================
# Risk Cases
# ========================================
CASES: dict[str, tuple[str, str, str]] = {
    # id : (level, Hebrew name, short English reason)
    # --- Low (saved only, no LEDs) ---
    "L1": ("Low",    "הולך רגל נע במקביל לכביש",              "moving parallel to the road, not approaching"),
    "L2": ("Low",    "הולך רגל עומד רחוק מהשפה",              "standing still, not near the edge"),
    "L3": ("Low",    "הולך רגל מתרחק",                        "moving away from the crossing"),
    "L4": ("Low",    "המתנה שקטה (עומד במקום)",               "standing still at the edge"),
    "M1": ("Low",    "התקרבות רגילה למעבר",                   "normal walking approach to the crossing"),
    "M3": ("Low",    "קבוצת הולכי רגל מתקרבת",                "group of pedestrians approaching together"),
    "M4": ("Low",    "נוכחות באזור המעבר",                    "stepping into / standing in the crossing zone"),
    # --- Medium (early warning, LEDs) ---
    "M2": ("Medium", "הסחת דעת בהתקרבות לכביש (טלפון)",       "approaching the edge while holding a phone"),
    "M5": ("Medium", "התקרבות מהירה ללא האטה",                "brisk approach with no sign of slowing"),
    "MW": ("Medium", "כלי גלגלים מתקרב ומאט אך לא מספיק",     "wheeled approacher slowing but not enough"),
    "H2": ("Medium", "ילד מתקרב לכביש",                      "child approaching the edge"),
    # --- High (immediate danger, LEDs) ---
    "H1": ("High",   "התפרצות (מהירות גבוהה)",                "bursting toward the road at high speed"),
    "H3": ("High",   "מוסח דעת שלא עוצר בשפה",                "distracted by phone, not slowing at the edge"),
    "H4": ("High",   "הופעה פתאומית ומהירה בקרבת השפה",       "sudden appearance near the edge, moving toward it"),
    "H5": ("High",   "כניסה לכביש ללא עצירה",                 "fast approach, not slowing - entering without stopping"),
    "H6": ("High",   "ילד מתפרץ לכביש",                       "child running toward the edge"),
    "HW": ("High",   "כלי גלגלים מתקרב במהירות",              "wheeled approacher coming in fast / not slowing"),
}
# Case order: High, then Medium, then Low. Inside a level, the most severe case is first.
PRIORITY = [
    "H6", "H1", "H5", "H3", "H4", "HW",          # High
    "H2", "M2", "M5", "MW",                        # Medium
    "M4", "L4", "M1", "L1", "L3", "L2", "M3",     # Low
]
LEVEL_RANK = {None: 0, "Low": 1, "Medium": 2, "High": 3}

# A polygon point this close to the frame border is treated as lying on the border
# (for example, y = 0.95 means "the bottom of the picture").
BORDER_EPS_Y = 0.05
BORDER_EPS_X = 0.01


# ========================================
# Crosswalk Zone
# ========================================
class EdgeZone:
    """
    The crosswalk zone as a polygon in normalized coordinates (0 to 1).
    It is converted to pixels for each frame. Default = config.ROI_POLYGON_NORM.
    """

    def __init__(self, polygon_norm=None):
        raw = list(polygon_norm or config.ROI_POLYGON_NORM)
        # Move points that are near the border exactly onto the border.
        self.polygon_norm = [
            (0.0 if x <= BORDER_EPS_X else 1.0 if x >= 1.0 - BORDER_EPS_X else x,
             1.0 if y >= 1.0 - BORDER_EPS_Y else y)
            for x, y in raw
        ]

    def pixel_polygon(self, frame_w: int, frame_h: int) -> np.ndarray:
        return np.array([(x * frame_w, y * frame_h) for x, y in self.polygon_norm], dtype=np.float32)

    def curb_edges(self, frame_w: int, frame_h: int) -> list[tuple[np.ndarray, np.ndarray]]:
        """
        The polygon edges that form the curb line: all edges except those on the
        frame border (bottom / left / right). Distances are measured only to these edges.
        """
        pts = self.polygon_norm
        edges = []
        for i in range(len(pts)):
            (ax, ay), (bx, by) = pts[i], pts[(i + 1) % len(pts)]
            # Skip edges that lie on the frame border.
            if (ay == 1.0 and by == 1.0) or (ax == 0.0 and bx == 0.0) or (ax == 1.0 and bx == 1.0):
                continue
            edges.append((np.array([ax * frame_w, ay * frame_h]), np.array([bx * frame_w, by * frame_h])))
        if not edges:                                    # If no edges are left, use all edges.
            poly = self.pixel_polygon(frame_w, frame_h)
            edges = [(poly[i], poly[(i + 1) % len(poly)]) for i in range(len(poly))]
        return edges

    @staticmethod
    def _point_segment_distance(p: np.ndarray, a: np.ndarray, b: np.ndarray) -> float:
        # Shortest distance from point p to the line segment a-b.
        ab = b - a
        denom = float(ab @ ab)
        u = 0.0 if denom == 0 else max(0.0, min(1.0, float((p - a) @ ab) / denom))
        return float(np.linalg.norm(p - (a + u * ab)))

    def signed_distance_px(self, point: tuple[float, float], frame_w: int, frame_h: int) -> float:
        """
        Distance from `point` to the curb line in pixels:
        > 0 on the sidewalk, < 0 inside the zone, 0 on the line.
        """
        poly = self.pixel_polygon(frame_w, frame_h)
        p = np.array([float(point[0]), float(point[1])])
        inside = cv2.pointPolygonTest(poly, (p[0], p[1]), False) >= 0
        d = min(self._point_segment_distance(p, a, b) for a, b in self.curb_edges(frame_w, frame_h))
        return -d if inside else d


# ========================================
# Motion Data
# ========================================
@dataclass
class Kinematics:
    """All the motion data the rules use for one track, over the last RISK_WINDOW_SECONDS."""
    n_obs: int
    window_seconds: float
    motion_known: bool           # Enough history to judge the motion.
    dist_first: float            # h, at the start of the window.
    dist_last: float             # h, now.
    dist_max: float              # h, farthest point in the window.
    approach_speed: float        # h/s, positive = getting closer to the edge.
    lateral_speed: float         # h/s, movement along the curb.
    speed: float                 # h/s, total speed.
    recent_speed: float          # h/s, over the last RECENT_SECONDS only.
    net_move_h: float            # h, total movement over the window.
    last_approach: float         # h/s, approach over the last STEP_LOOKBACK_SECONDS.
    time_to_edge: float          # Seconds until the edge (inf if not approaching).
    stationary: bool
    approaching: bool
    parallel: bool
    moving_away: bool
    receded: bool                # Moved away from the edge at some point in the window.
    not_slowing: bool            # The second half of the window is not slower than the first.
    stepping_down: bool          # Stepped from the sidewalk into the zone while approaching.
    appeared_suddenly: bool      # Entered from the frame border, already near and approaching.
    phone_fraction: float
    has_phone: bool
    person_type: str             # 'child' | 'adult' | 'unknown'
    person_type_source: str      # 'calibration' | 'relative' | 'none'
    truncated_last: bool
    mean_confidence: float
    h_ref_px: float


# ========================================
# Assessment Result
# ========================================
@dataclass
class Assessment:
    """The result for one track (or for a group, track_id = -1)."""
    track_id: int
    level: str | None            # 'Low' | 'Medium' | 'High' | None
    case_id: str | None          # A key of CASES, or None.
    case_name: str | None        # Hebrew case name.
    reason: str
    confidence: int              # 0-100, how sure we are that the case is real.
    person_type: str
    distracted: bool
    metadata: dict = field(default_factory=dict)

    @property
    def danger(self) -> bool:
        """Only Medium and High turn on the LEDs. Low is saved only."""
        return LEVEL_RANK[self.level] >= LEVEL_RANK["Medium"]


# ========================================
# Risk Engine
# ========================================
class RiskEngine:
    """Calculates the motion data of each track and applies the risk rules."""

    def __init__(self, zone: EdgeZone | None = None, cfg=config, stream_start_t: float | None = None):
        self.zone = zone or EdgeZone()
        self.cfg = cfg
        # Start time of the analysis. People seen in the first frames
        # did not "appear suddenly" (H4); they were already there.
        self._stream_t0 = stream_start_t

           # ============================================================
    # NEW: Additional phone-to-person check
    # ============================================================
    # This function checks whether a phone was already assigned
    #o this specific person in at least one observation.
    #
    # The geometric phone-to-person assignment is performed earlier.
    # If the phone was assigned to this person, observation.phone
    # should already be True.
    #
    # This function DOES NOT replace the existing M2 rule.
    # It is an additional check that will be used during video analysis.
    # ============================================================

    def check_phone_assigned_to_person(self, track, t: float) -> bool:

        # Get this person's observations from the current risk window.
        observations = (
            track.window(t, self.cfg.RISK_WINDOW_SECONDS)
            or track.observations[-1:]
        )

        # Check whether any observation has a phone
        # already assigned to this person.
        for observation in observations:
            if getattr(observation, "phone", False):
                return True

        # No phone was assigned to this person.
        return False

    # ----------------------------------------
    # Evaluate All Tracks
    # ----------------------------------------
    def evaluate(self, tracks, t: float, frame_w: int, frame_h: int,
                 all_live_tracks=None, recently_died_near=None) -> list[Assessment]:
        """
        Assess every track seen in this frame. Returns one result per track,
        plus one group result (M3, track_id -1) when relevant,
        sorted from most to least severe.
        """
        if self._stream_t0 is None:
            self._stream_t0 = t
        all_live = all_live_tracks if all_live_tracks is not None else tracks
        results: list[Assessment] = []
        kins: list[tuple[object, Kinematics]] = []
        # Calculate the motion of each track and apply the matching rules.
        for tr in tracks:
            k = self.kinematics(tr, t, frame_w, frame_h, all_live, recently_died_near)
            kins.append((tr, k))
            if getattr(tr, "kind", "person") == "wheeled":
                results.append(self.assess_wheeled(tr.track_id, k))
            else:
                # Run the normal risk assessment first.
                assessment = self.assess(tr.track_id, k)

                # NEW: Check if a phone was assigned to this person.
                phone_assigned = self.check_phone_assigned_to_person(tr, t)

                # If a phone was assigned, classify as at least M2 (Medium).
                # Do not override an existing High-risk case.
                if phone_assigned and assessment.level != "High":
                    level, name, reason = CASES["M2"]

                    assessment.level = level
                    assessment.case_id = "M2"
                    assessment.case_name = name
                    assessment.reason = reason
                    assessment.distracted = True
                    assessment.metadata["phoneAssigned"] = True

                # Add the final assessment to the results.
                results.append(assessment)

        # Group rule only applies to pedestrians.
        group = self.assess_group([(tr, k) for tr, k in kins if getattr(tr, "kind", "person") == "person"])
        if group is not None:
            results.append(group)

        # Sort the results from most to least severe.
        results.sort(key=lambda a: (LEVEL_RANK[a.level], -PRIORITY.index(a.case_id) if a.case_id else 0), reverse=True)
        return results

    # ----------------------------------------
    # Calculate Motion Data
    # ----------------------------------------
    def kinematics(self, track, t: float, frame_w: int, frame_h: int,
                   all_live_tracks, recently_died_near=None) -> Kinematics:
        cfg = self.cfg
        obs = track.window(t, cfg.RISK_WINDOW_SECONDS) or track.observations[-1:]
        h_ref = max(track.h_ref, 1e-6)
        truncated_last = self._bottom_truncated(obs[-1], frame_h)

        # A box cut by the bottom of the frame has its feet outside the picture,
        # which looks like a big jump toward the road. Use only full boxes for motion.
        obs = [o for o in obs if not self._bottom_truncated(o, frame_h)] or obs[-1:]

        # Distance to the edge in body heights for each observation.
        dists = [self.zone.signed_distance_px(o.anchor, frame_w, frame_h) / h_ref for o in obs]
        T = obs[-1].t - obs[0].t
        n = len(obs)
        motion_known = n >= 2 and T >= cfg.MIN_WINDOW_SECONDS

        approach = lateral = speed = recent_speed = net_move = last_approach = 0.0
        receded = not_slowing = stepping_down = False
        if n >= 2 and T > 0:
            approach = (dists[0] - dists[-1]) / T
            # Split the movement into "toward the curb" (approach)
            # and "along the curb" (lateral), in body heights.
            net_move = self._anchor_distance(obs[0], obs[-1]) / h_ref
            speed = net_move / T
            lateral = math.sqrt(max(0.0, speed * speed - approach * approach))
            recent_speed = self._segment_speed(obs, cfg.RECENT_SECONDS, h_ref)
            j = self._lookback_index(obs, cfg.STEP_LOOKBACK_SECONDS)
            dt_j = obs[-1].t - obs[j].t
            last_approach = (dists[j] - dists[-1]) / dt_j if dt_j > 0 else 0.0
            receded = any((dists[i + 1] - dists[i]) > cfg.EDGE_JITTER for i in range(n - 1))
            if n >= 3:                                  # Compare the two halves of the window to check slowing.
                mid = n // 2
                T1, T2 = obs[mid].t - obs[0].t, obs[-1].t - obs[mid].t
                a1 = (dists[0] - dists[mid]) / T1 if T1 > 0 else 0.0
                a2 = (dists[mid] - dists[-1]) / T2 if T2 > 0 else 0.0
                not_slowing = a1 >= cfg.MOVING_MIN and a2 >= 0.8 * a1
            stepping_down = (dists[-1] <= 0.0 and max(dists) > cfg.EDGE_JITTER
                             and last_approach >= cfg.MOVING_MIN)

        # Decide the type of motion.
        stationary = motion_known and (recent_speed < cfg.MOVING_MIN or net_move < cfg.MIN_MOVE_H)
        moving = motion_known and not stationary
        parallel = moving and abs(approach) < cfg.PARALLEL_RATIO * speed
        approaching = moving and approach >= cfg.MOVING_MIN and not parallel
        moving_away = moving and approach <= -cfg.MOVING_MIN and not parallel
        tte = dists[-1] / approach if (approaching and dists[-1] > 0) else math.inf

        # The person has a phone if it was seen in enough frames.
        phone_count = sum(1 for o in obs if o.phone)
        phone_fraction = phone_count / n
        has_phone = phone_count >= cfg.PHONE_MIN_FRAMES and phone_fraction >= cfg.PHONE_MIN_FRACTION

        person_type, source = self._person_type(track, obs[-1], all_live_tracks, frame_h)
        appeared_suddenly = approaching and self._appeared_suddenly(track, t, n, T, frame_w, frame_h,
                                                                    h_ref, recently_died_near)

        return Kinematics(
            n_obs=n, window_seconds=T, motion_known=motion_known,
            dist_first=dists[0], dist_last=dists[-1], dist_max=max(dists),
            approach_speed=approach, lateral_speed=lateral, speed=speed, recent_speed=recent_speed,
            net_move_h=net_move, last_approach=last_approach, time_to_edge=tte,
            stationary=stationary, approaching=approaching, parallel=parallel, moving_away=moving_away,
            receded=receded, not_slowing=not_slowing, stepping_down=stepping_down,
            appeared_suddenly=appeared_suddenly, phone_fraction=phone_fraction, has_phone=has_phone,
            person_type=person_type, person_type_source=source, truncated_last=truncated_last,
            mean_confidence=sum(o.confidence for o in obs) / n, h_ref_px=h_ref,
        )

    # ----------------------------------------
    # Person Rules
    # ----------------------------------------
    def matching_cases(self, k: Kinematics) -> list[str]:
        """Return every matching case in priority order (the first one is the result)."""
        cfg = self.cfg
        if not k.motion_known:
            # Not enough history to judge motion. Report only a person
            # who is already past the curb line.
            return ["M4"] if k.dist_last <= -cfg.EDGE_JITTER else []

        # Phone and approach rules apply only before the curb,
        # not to someone already walking in the road.
        at_or_before_curb = k.dist_last > -cfg.EDGE_JITTER or k.stepping_down
        is_child = k.person_type == "child"           # True only when the camera is calibrated.
        brisk = cfg.BRISK_MIN <= k.approach_speed < cfg.RUN_MIN
        # Check the condition of each case.
        rules = {
            # --- High ---
            "H6": k.approaching and is_child and k.approach_speed >= cfg.RUN_MIN,   # Child running.
            "H1": k.approaching and k.approach_speed >= cfg.RUN_MIN,                # Running toward the road.
            # Fast, not slowing, and already near the edge.
            "H5": (k.approaching and k.not_slowing and at_or_before_curb
                   and k.approach_speed >= cfg.BRISK_MIN and k.dist_last < cfg.NEAR_APPROACH),
            "H3": k.approaching and k.has_phone and k.dist_last < cfg.NEAR and k.not_slowing and at_or_before_curb,
            "H4": k.approaching and k.appeared_suddenly,
            "HW": False,                                     # Wheeled rule, see matching_wheeled.
            # --- Medium ---
            "H2": k.approaching and is_child                                        # Child walking toward the edge.
                  and (k.dist_last < cfg.NEAR_APPROACH or k.time_to_edge <= cfg.TTE_MEDIUM),
            "M2": k.approaching and k.has_phone and k.dist_last < cfg.FAR and at_or_before_curb,
            # Fast and not slowing, but not very close yet (that would be H5).
            "M5": (k.approaching and brisk and k.not_slowing
                   and k.dist_last >= cfg.NEAR and at_or_before_curb),
            "MW": False,                                     # Wheeled rule, see matching_wheeled.
            # --- Low ---
            "M4": k.stepping_down or (k.stationary and k.dist_last <= -cfg.EDGE_JITTER),
            "L4": k.stationary and -cfg.EDGE_JITTER < k.dist_last < cfg.NEAR,
            "M1": k.approaching and not k.receded and k.dist_last > -cfg.EDGE_JITTER
                  and (k.dist_last < cfg.NEAR_APPROACH or k.time_to_edge <= cfg.TTE_MEDIUM),
            "L1": k.parallel,
            "L3": k.moving_away,
            "L2": k.stationary and k.dist_last >= cfg.NEAR,
            "M3": False,                                     # Group rule, checked in assess_group.
        }
        # Keep only the matching cases, in priority order.
        return [cid for cid in PRIORITY if rules[cid]]

    # ----------------------------------------
    # Wheeled Object Rules
    # ----------------------------------------
    def matching_wheeled(self, k: Kinematics) -> list[str]:
        """A bicycle or motorcycle moving toward the crossing -> HW / MW / none."""
        cfg = self.cfg
        # Ignore objects that are not approaching or are far away.
        if not k.motion_known or not k.approaching or k.dist_last >= cfg.WHEELED_NEAR:
            return []
        if k.approach_speed >= cfg.WHEELED_FAST or k.not_slowing:
            return ["HW"]                                    # Fast or not slowing -> High.
        if k.approach_speed >= cfg.WHEELED_MOVING_MIN:
            return ["MW"]                                    # Slowing but still coming -> Medium.
        return []

    # ----------------------------------------
    # Build Assessment Results
    # ----------------------------------------
    def assess(self, track_id: int, k: Kinematics) -> Assessment:
        # The first matching case is the result.
        matched = self.matching_cases(k)
        case_id = matched[0] if matched else None
        level, name, reason = CASES[case_id] if case_id else (None, None, "no rule matched")
        # Confidence is lower when the person was seen in only 1-2 frames.
        confidence = int(round(100 * k.mean_confidence * min(1.0, k.n_obs / 3.0))) if case_id else 0
        return Assessment(
            track_id=track_id, level=level, case_id=case_id, case_name=name, reason=reason,
            confidence=max(1, min(100, confidence)) if case_id else 0,
            person_type=k.person_type, distracted=k.has_phone,
            metadata={
                "matchedCases": matched,
                "distanceToEdgeH": round(k.dist_last, 3),
                "approachSpeedHps": round(k.approach_speed, 3),
                "lateralSpeedHps": round(k.lateral_speed, 3),
                "speedHps": round(k.speed, 3),
                "recentSpeedHps": round(k.recent_speed, 3),
                "netMoveH": round(k.net_move_h, 3),
                "timeToEdgeSec": None if math.isinf(k.time_to_edge) else round(k.time_to_edge, 2),
                "windowSec": round(k.window_seconds, 2),
                "frames": k.n_obs,
                "phoneFraction": round(k.phone_fraction, 2),
                "personTypeSource": k.person_type_source,
                "truncated": k.truncated_last,
                "hRefPx": round(k.h_ref_px, 1),
                "note": "" if k.motion_known else "insufficient motion history",
            },
        )

    def assess_wheeled(self, track_id: int, k: Kinematics) -> Assessment:
        """Result for a bicycle or motorcycle."""
        matched = self.matching_wheeled(k)
        case_id = matched[0] if matched else None
        level, name, reason = CASES[case_id] if case_id else (None, None, "no rule matched")
        confidence = int(round(100 * k.mean_confidence * min(1.0, k.n_obs / 3.0))) if case_id else 0
        return Assessment(
            track_id=track_id, level=level, case_id=case_id, case_name=name, reason=reason,
            confidence=max(1, min(100, confidence)) if case_id else 0,
            person_type="wheeled", distracted=False,
            metadata={
                "matchedCases": matched,
                "kind": "wheeled",
                "distanceToEdgeH": round(k.dist_last, 3),
                "approachSpeedHps": round(k.approach_speed, 3),
                "speedHps": round(k.speed, 3),
                "timeToEdgeSec": None if math.isinf(k.time_to_edge) else round(k.time_to_edge, 2),
                "frames": k.n_obs,
                "note": "" if k.motion_known else "insufficient motion history",
            },
        )

    def assess_group(self, kins: list[tuple[object, Kinematics]]) -> Assessment | None:
        """M3: several people approaching together, and at least one of them is close."""
        cfg = self.cfg
        # Find people who are approaching and were seen in enough frames.
        approaching = [(tr, k) for tr, k in kins if k.approaching and k.n_obs >= cfg.MIN_FRAMES_FOR_ALERT]
        if len(approaching) < cfg.GROUP_MIN or min(k.dist_last for _, k in approaching) >= cfg.FAR:
            return None
        level, name, reason = CASES["M3"]
        confidence = int(round(100 * sum(k.mean_confidence for _, k in approaching) / len(approaching)))
        return Assessment(
            track_id=-1, level=level, case_id="M3", case_name=name, reason=reason,
            confidence=max(1, min(100, confidence)),
            person_type="unknown", distracted=any(k.has_phone for _, k in approaching),
            metadata={"matchedCases": ["M3"], "trackIds": [tr.track_id for tr, _ in approaching],
                      "count": len(approaching),
                      "frames": min(k.n_obs for _, k in approaching),
                      "distanceToEdgeH": round(min(k.dist_last for _, k in approaching), 3),
                      "approachSpeedHps": round(sum(k.approach_speed for _, k in approaching) / len(approaching), 3)},
        )

    # ----------------------------------------
    # Helpers
    # ----------------------------------------
    @staticmethod
    def _bottom_truncated(o, frame_h: int) -> bool:
        # True if the box touches the bottom of the frame.
        return o.y2 >= frame_h * (1.0 - config.TRUNCATION_MARGIN)

    @staticmethod
    def _anchor_distance(a, b) -> float:
        # Distance in pixels between the feet points of two observations.
        (ax, ay), (bx, by) = a.anchor, b.anchor
        return math.hypot(bx - ax, by - ay)

    @staticmethod
    def _lookback_index(obs, seconds: float) -> int:
        """Index of the first observation inside the last `seconds` (always < last index)."""
        for j, o in enumerate(obs):
            if o.t >= obs[-1].t - seconds and j < len(obs) - 1:
                return j
        return len(obs) - 2

    def _segment_speed(self, obs, seconds: float, h_ref: float) -> float:
        """Speed (h/s) over the most recent `seconds` of the window."""
        j = self._lookback_index(obs, seconds)
        dt = obs[-1].t - obs[j].t
        return self._anchor_distance(obs[j], obs[-1]) / h_ref / dt if dt > 0 else 0.0

    def _appeared_suddenly(self, track, t, n, T, frame_w, frame_h, h_ref, recently_died_near) -> bool:
        """
        H4: a person who entered the picture from a side or top border while the analysis
        was running, is already near the curb, moves toward it, and was not just
        lost by the tracker for a moment.
        """
        cfg = self.cfg
        first = track.observations[0]
        # The person must enter from a side or top border.
        entered_from_border = first.truncated and not self._bottom_truncated(first, frame_h)
        if not entered_from_border:
            return False
        if self._stream_t0 is None or track.born_at - self._stream_t0 <= cfg.SUDDEN_MAX_AGE_SECONDS:
            return False                                 # The person was there when the analysis started.
        # The track must be new, but old enough to have MIN_FRAMES_FOR_ALERT frames.
        dt_med = T / (n - 1) if n > 1 else cfg.SUDDEN_MAX_AGE_SECONDS
        age_bound = max(cfg.SUDDEN_MAX_AGE_SECONDS, (cfg.MIN_FRAMES_FOR_ALERT - 1) * dt_med * 1.05)
        if track.age(t) > age_bound:
            return False
        # The person must appear close to the edge.
        first_dist = self.zone.signed_distance_px(first.anchor, frame_w, frame_h) / h_ref
        if first_dist >= cfg.NEAR_APPROACH:
            return False
        # Skip a person who was just lost and found again by the tracker.
        if recently_died_near and recently_died_near(track.born_at, first.anchor, h_ref):
            return False
        return True

    def _person_type(self, track, last_obs, all_live_tracks, frame_h: int) -> tuple[str, str]:
        """
        Return child / adult / unknown.
        The person's recent height is compared with the expected adult height
        at the same position (from ADULT_HEIGHT_REF calibration).
        Cut-off boxes and cameras without calibration return 'unknown'.
        """
        cfg = self.cfg
        if last_obs.truncated:
            return "unknown", "none"
        # Use the recent height, because a box grows as a person walks toward the camera.
        recent = [o.height for o in track.observations[-3:] if not o.truncated]
        h = float(median(recent)) if recent else track.h_ref
        ref = cfg.ADULT_HEIGHT_REF
        if ref and len(ref) >= 2:
            # Calculate the expected adult height at the feet position.
            (y1, h1), (y2, h2) = ref[0], ref[1]
            y = last_obs.anchor[1] / frame_h
            slope = (h2 - h1) / (y2 - y1) if y2 != y1 else 0.0
            expected = (h1 + slope * (y - y1)) * frame_h
            if expected > 0:
                return ("child" if h < cfg.CHILD_HEIGHT_RATIO * expected else "adult"), "calibration"
        # Without calibration, do not guess (to avoid false child alerts).
        return "unknown", "none"


    
